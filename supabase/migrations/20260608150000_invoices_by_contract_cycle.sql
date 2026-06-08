-- BLOQUE E2 — persistencia de la factura por CONTRATO y CICLO de aniversario (regla 9).
-- Plan: docs/plan-correccion-core-facturacion-2026-06-08.md §Bloque E.
--
-- Decisiones del dueño: factura por contrato; periodo representado por period_start/period_end
-- (DATE) además del mes-ancla (period_year/period_month, ya existentes); entrega por fases
-- (E1 = motor de cálculo, ya en main; E2 = esta persistencia + UI).
--
-- ⚠️ COORDINACIÓN (fix-forward, regla de integridad del plan):
--   E2 NO toca emit_invoice ni la tabla invoices de forma destructiva. Añade:
--     · columnas ADITIVAS nullable a invoices (no rompe facturas ya emitidas ni el flujo viejo
--       por cliente que sigue usando emit_invoice).
--     · una RPC NUEVA emit_contract_invoice (paralela a emit_invoice).
--   Así el Bloque C (soporte: P0-5 inmutabilidad de invoices, P1-1 validación de emit_invoice)
--   puede construirse sin colisión. emit_contract_invoice YA nace con la validación de
--   coherencia contable (P1-1) para no depender del orden de merge. Cuando ambos estén en main,
--   un PR de unificación puede converger emit_invoice/emit_contract_invoice si se desea.

BEGIN;

-- 1) Columnas aditivas: el contrato y el periodo real del ciclo.
ALTER TABLE public.invoices
  ADD COLUMN IF NOT EXISTS contract_id  uuid REFERENCES public.contracts(id) ON DELETE RESTRICT,
  ADD COLUMN IF NOT EXISTS period_start date,
  ADD COLUMN IF NOT EXISTS period_end   date;

COMMENT ON COLUMN public.invoices.contract_id  IS 'Bloque E: contrato facturado (factura por contrato/ciclo). NULL en facturas legacy por cliente/mes.';
COMMENT ON COLUMN public.invoices.period_start IS 'Bloque E: inicio del ciclo de aniversario (billing_day). period_year/month quedan como mes-ancla.';
COMMENT ON COLUMN public.invoices.period_end   IS 'Bloque E: fin del ciclo (día anterior al billing_day del mes siguiente, con clamp de fin de mes).';

-- 2) No duplicar factura emise para el mismo contrato y ciclo (inicio del periodo).
CREATE UNIQUE INDEX IF NOT EXISTS invoices_contract_cycle_emise_unique
  ON public.invoices (contract_id, period_start)
  WHERE status = 'emise' AND contract_id IS NOT NULL;

-- 3) RPC de emisión por contrato/ciclo. Nace con validación de coherencia contable (P1-1).
--    p_payload: { contract_id, client_id, client_name, numero_contrat,
--                 period_start, period_end, period_year, period_month,
--                 has_estimated, has_replacement, confirm_estimated,
--                 total_amount, issued_by, lines: [ { ...invoice_lines... } ] }
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

  -- No duplicar factura emise para el mismo contrato y ciclo.
  IF EXISTS (
    SELECT 1 FROM public.invoices
    WHERE contract_id = v_contract_id AND period_start = v_pstart AND status = 'emise'
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
      amount_fixed, amount_bw, amount_color, amount_total
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
      COALESCE((v_line->>'amount_total')::numeric, 0)
    );
  END LOOP;

  RETURN v_invoice_id;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.emit_contract_invoice(jsonb) FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.emit_contract_invoice(jsonb) TO service_role;

COMMIT;
