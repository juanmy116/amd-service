-- BLOQUE C / P1-1 + P2-6 — coherencia contable del snapshot y persistencia del desglose.
-- Plan: docs/plan-correccion-core-facturacion-2026-06-08.md §Bloque C, puntos 2 y 5.
--
-- Estado heredado del motor:
--   · emit_contract_invoice (Bloque E, 20260608150000) YA nace con validación de coherencia
--     (P1-1). Aquí solo le añadimos la persistencia del breakdown (P2-6) sin tocar su validación.
--   · emit_invoice (legacy por cliente/mes, vigente desde 20260606000200 con has_replacement)
--     sigue SIN validar coherencia → la endurecemos con la misma red (P1-1) + breakdown.
-- Construido SOBRE las versiones vigentes (CREATE OR REPLACE), sin machacar lo del motor.

BEGIN;

-- P2-6: desglose por máquina del consumo consolidado cuando la línea agrupa un reemplazo.
-- El draft (lib/invoicing) ya calcula line.breakdown; las RPC lo descartaban. NULL si no aplica.
ALTER TABLE public.invoice_lines
  ADD COLUMN IF NOT EXISTS breakdown jsonb;

COMMENT ON COLUMN public.invoice_lines.breakdown IS
  'Desglose por máquina del consumo consolidado cuando la línea agrupa un reemplazo (P2-6). NULL si no aplica.';

-- ────────────────────────────────────────────────────────────────────────────
-- emit_invoice (legacy por cliente/mes): + validación de coherencia (P1-1) + breakdown (P2-6).
-- Cuerpo basado en 20260606000200 (con has_replacement); se añade la pasada de validación
-- ANTES de insertar nada y la columna breakdown en el INSERT de líneas.
-- ────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.emit_invoice(p_payload jsonb)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_client_id   bigint  := (p_payload->>'client_id')::bigint;
  v_year        int     := (p_payload->>'period_year')::int;
  v_month       int     := (p_payload->>'period_month')::int;
  v_has_est     bool    := COALESCE((p_payload->>'has_estimated')::bool, false);
  v_has_repl    bool    := COALESCE((p_payload->>'has_replacement')::bool, false);
  v_confirm     bool    := COALESCE((p_payload->>'confirm_estimated')::bool, false);
  v_issued_by   uuid    := NULLIF(p_payload->>'issued_by','')::uuid;
  v_total       numeric := COALESCE((p_payload->>'total_amount')::numeric, 0);
  v_lines       jsonb   := p_payload->'lines';
  v_numero      text;
  v_invoice_id  uuid;
  v_line        jsonb;
  v_sum         numeric := 0;
  v_lf numeric; v_lbw numeric; v_lcol numeric; v_lt numeric;
  v_dbw int; v_dcol int;
BEGIN
  IF auth.role() <> 'service_role' THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  IF v_has_est AND NOT v_confirm THEN
    RAISE EXCEPTION 'estimated_not_confirmed';
  END IF;

  -- P1-1: coherencia contable ANTES de insertar (si falla, no se crea cabecera).
  IF v_lines IS NULL OR jsonb_array_length(v_lines) < 1 THEN
    RAISE EXCEPTION 'no_lines';
  END IF;

  IF v_client_id IS NULL OR NOT EXISTS (SELECT 1 FROM public.clients WHERE id = v_client_id) THEN
    RAISE EXCEPTION 'client_not_found';
  END IF;

  IF v_issued_by IS NULL OR NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = v_issued_by) THEN
    RAISE EXCEPTION 'issuer_not_found';
  END IF;

  FOR v_line IN SELECT * FROM jsonb_array_elements(v_lines) LOOP
    v_lf   := COALESCE((v_line->>'amount_fixed')::numeric, 0);
    v_lbw  := COALESCE((v_line->>'amount_bw')::numeric, 0);
    v_lcol := COALESCE((v_line->>'amount_color')::numeric, 0);
    v_lt   := COALESCE((v_line->>'amount_total')::numeric, 0);
    v_dbw  := COALESCE((v_line->>'delta_bw')::int, 0);
    v_dcol := COALESCE((v_line->>'delta_color')::int, 0);

    IF v_lf < 0 OR v_lbw < 0 OR v_lcol < 0 OR v_lt < 0 OR v_dbw < 0 OR v_dcol < 0 THEN
      RAISE EXCEPTION 'negative_amount';
    END IF;
    IF v_lt <> v_lf + v_lbw + v_lcol THEN
      RAISE EXCEPTION 'line_total_mismatch';
    END IF;
    v_sum := v_sum + v_lt;
  END LOOP;

  IF v_total < 0 OR v_total <> v_sum THEN
    RAISE EXCEPTION 'header_total_mismatch';
  END IF;

  -- No duplicar factura emise para el mismo cliente/periodo
  IF EXISTS (
    SELECT 1 FROM public.invoices
    WHERE client_id = v_client_id AND period_year = v_year
      AND period_month = v_month AND status = 'emise' AND contract_id IS NULL
  ) THEN
    RAISE EXCEPTION 'already_issued';
  END IF;

  v_numero := public.next_invoice_number();

  INSERT INTO public.invoices (
    numero_facture, client_id, client_name, period_year, period_month,
    status, has_estimated, has_replacement, total_amount, issued_by
  ) VALUES (
    v_numero, v_client_id, p_payload->>'client_name', v_year, v_month,
    'emise', v_has_est, v_has_repl, v_total, v_issued_by
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
REVOKE EXECUTE ON FUNCTION public.emit_invoice(jsonb) FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.emit_invoice(jsonb) TO service_role;

-- ────────────────────────────────────────────────────────────────────────────
-- emit_contract_invoice (Bloque E): conserva ÍNTEGRA la validación de coherencia del motor;
-- solo se añade la persistencia del breakdown (P2-6) en el INSERT de líneas.
-- ────────────────────────────────────────────────────────────────────────────
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
