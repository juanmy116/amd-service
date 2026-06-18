-- FORMA B / P0 anti-duplicados — dedup de factura por MES FACTURADO, no por period_start.
-- Spec: docs/superpowers/specs/2026-06-16-facturacion-periodo-a-medida-design.md §13 (P0).
--
-- PROBLEMA: el modelo «periodo a medida» (Forma B) calcula period_start = fecha REAL de la lectura
-- de apertura más temprana de la tanda. Ese valor CAMBIA si entra/edita una lectura después de
-- emitir (los contadores llegan poco a poco por email). El anti-duplicados vivía en
-- `(contract_id, period_start)` → con period_start variable deja de reconocer el mes ya facturado
-- → riesgo de SEGUNDA factura del mismo mes.
--
-- SOLUCIÓN: la identidad estable de una factura es el MES FACTURADO (period_year, period_month)
-- — regla de negocio: una factura por contrato y mes. Se mueve la unicidad ahí. period_start/end
-- siguen guardándose como fechas reales descriptivas (las que se muestran en la factura).
--
-- Seguro de aplicar: 0 facturas reales hoy → ningún dato choca con el nuevo índice.

BEGIN;

-- 1) Retirar la unicidad por period_start (inestable en Forma B).
DROP INDEX IF EXISTS public.invoices_contract_cycle_emise_unique;

-- 2) Unicidad por contrato + mes facturado (estable). Solo facturas por contrato (no legacy).
CREATE UNIQUE INDEX IF NOT EXISTS invoices_contract_month_emise_unique
  ON public.invoices (contract_id, period_year, period_month)
  WHERE status = 'emise' AND contract_id IS NOT NULL;

COMMENT ON INDEX public.invoices_contract_month_emise_unique IS
  'Forma B: una sola factura emise por contrato y mes facturado (period_year, period_month). '
  'Reemplaza la unicidad por period_start, que en el modelo «periodo a medida» es una fecha real '
  'variable y no servía de clave de no-duplicado.';

-- 3) emit_contract_invoice: el EXISTS de no-duplicado pasa a (period_year, period_month).
--    Resto del cuerpo IDÉNTICO a la versión vigente (20260609081000): validación de coherencia
--    P1-1, breakdown P2-6, guard service_role. Solo cambia el bloque marcado «P0 dedup».
CREATE OR REPLACE FUNCTION public.emit_contract_invoice(p_payload jsonb)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_contract_id uuid   := (p_payload->>'contract_id')::uuid;
  v_client_id   bigint := (p_payload->>'client_id')::bigint;
  v_pstart      date   := (p_payload->>'period_start')::date;
  v_pend        date   := (p_payload->>'period_end')::date;
  v_year        int    := (p_payload->>'period_year')::int;
  v_month       int    := (p_payload->>'period_month')::int;
  v_has_est     bool   := COALESCE((p_payload->>'has_estimated')::bool, false);
  v_has_repl    bool   := COALESCE((p_payload->>'has_replacement')::bool, false);
  v_confirm     bool   := COALESCE((p_payload->>'confirm_estimated')::bool, false);
  v_total       numeric := COALESCE((p_payload->>'total_amount')::numeric, 0);
  v_lines       jsonb  := COALESCE(p_payload->'lines', '[]'::jsonb);
  v_numero      text;
  v_invoice_id  uuid;
  v_line        jsonb;
  v_sum         numeric := 0;
  v_line_total  numeric;
  v_line_comp   numeric;
  v_real_client bigint;
BEGIN
  IF auth.role() <> 'service_role' THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  -- Validación estructural mínima
  IF v_contract_id IS NULL OR v_client_id IS NULL OR v_pstart IS NULL OR v_pend IS NULL THEN
    RAISE EXCEPTION 'invalid_payload';
  END IF;
  IF v_pend < v_pstart THEN
    RAISE EXCEPTION 'invalid_period';
  END IF;
  -- P0: el mes facturado debe ser válido (es ahora la clave de no-duplicado).
  IF v_year IS NULL OR v_month IS NULL OR v_month < 1 OR v_month > 12 THEN
    RAISE EXCEPTION 'invalid_period';
  END IF;
  IF jsonb_array_length(v_lines) < 1 THEN
    RAISE EXCEPTION 'no_lines';
  END IF;

  IF v_has_est AND NOT v_confirm THEN
    RAISE EXCEPTION 'estimated_not_confirmed';
  END IF;

  -- P1-1: el contrato existe y su cliente coincide con el del payload.
  SELECT client_id INTO v_real_client FROM public.contracts WHERE id = v_contract_id;
  IF v_real_client IS NULL THEN
    RAISE EXCEPTION 'contract_not_found';
  END IF;
  IF v_real_client <> v_client_id THEN
    RAISE EXCEPTION 'client_mismatch';
  END IF;

  -- P1-1: coherencia contable de cada línea + cuadre de la cabecera.
  FOR v_line IN SELECT * FROM jsonb_array_elements(v_lines) LOOP
    IF COALESCE((v_line->>'delta_bw')::int, 0) < 0
       OR COALESCE((v_line->>'delta_color')::int, 0) < 0 THEN
      RAISE EXCEPTION 'negative_delta';
    END IF;
    v_line_total := COALESCE((v_line->>'amount_total')::numeric, 0);
    v_line_comp  := COALESCE((v_line->>'amount_fixed')::numeric, 0)
                  + COALESCE((v_line->>'amount_bw')::numeric, 0)
                  + COALESCE((v_line->>'amount_color')::numeric, 0);
    IF v_line_total < 0 OR v_line_comp < 0 THEN
      RAISE EXCEPTION 'negative_amount';
    END IF;
    IF v_line_total <> v_line_comp THEN
      RAISE EXCEPTION 'line_total_mismatch';
    END IF;
    v_sum := v_sum + v_line_total;
  END LOOP;

  IF v_sum <> v_total THEN
    RAISE EXCEPTION 'header_total_mismatch';
  END IF;

  -- P0 dedup: no duplicar factura emise para el mismo contrato y MES FACTURADO (estable).
  IF EXISTS (
    SELECT 1 FROM public.invoices
    WHERE contract_id = v_contract_id
      AND period_year = v_year AND period_month = v_month
      AND status = 'emise'
  ) THEN
    RAISE EXCEPTION 'already_issued';
  END IF;

  v_numero := public.next_invoice_number();

  INSERT INTO public.invoices (
    numero_facture, client_id, client_name, contract_id,
    period_year, period_month, period_start, period_end,
    status, has_estimated, has_replacement, total_amount, issued_by
  ) VALUES (
    v_numero, v_client_id, p_payload->>'client_name', v_contract_id,
    v_year, v_month, v_pstart, v_pend,
    'emise', v_has_est, v_has_repl, v_total, (p_payload->>'issued_by')::uuid
  ) RETURNING id INTO v_invoice_id;

  FOR v_line IN SELECT * FROM jsonb_array_elements(v_lines)
  LOOP
    INSERT INTO public.invoice_lines (
      invoice_id, contract_id, numero_contrat, machine_id, machine_label,
      plan_name, billing_type, fixed_fee, price_bw, price_color, tiers,
      delta_bw, delta_color, is_estimated,
      amount_fixed, amount_bw, amount_color, amount_total, breakdown
    ) VALUES (
      v_invoice_id,
      NULLIF(v_line->>'contract_id','')::uuid,
      v_line->>'numero_contrat',
      v_line->>'machine_id',
      v_line->>'machine_label',
      v_line->>'plan_name',
      v_line->>'billing_type',
      NULLIF(v_line->>'fixed_fee','')::numeric,
      NULLIF(v_line->>'price_bw','')::numeric,
      NULLIF(v_line->>'price_color','')::numeric,
      CASE WHEN v_line->'tiers' = 'null'::jsonb THEN NULL ELSE v_line->'tiers' END,
      COALESCE((v_line->>'delta_bw')::int, 0),
      COALESCE((v_line->>'delta_color')::int, 0),
      COALESCE((v_line->>'is_estimated')::bool, false),
      COALESCE((v_line->>'amount_fixed')::numeric, 0),
      COALESCE((v_line->>'amount_bw')::numeric, 0),
      COALESCE((v_line->>'amount_color')::numeric, 0),
      COALESCE((v_line->>'amount_total')::numeric, 0),
      CASE WHEN v_line->'breakdown' IS NULL OR v_line->'breakdown' = 'null'::jsonb
           THEN NULL ELSE v_line->'breakdown' END
    );
  END LOOP;

  RETURN v_invoice_id;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.emit_contract_invoice(jsonb) FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.emit_contract_invoice(jsonb) TO service_role;

COMMIT;
