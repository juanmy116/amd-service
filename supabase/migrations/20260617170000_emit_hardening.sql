-- PR-D.1 (FASE 4) — ENDURECIMIENTO de emit_contract_invoice: la RPC ya NO confía en el payload.
-- Spec: docs/superpowers/specs/2026-06-17-contadores-fecha-real-y-linea-design.md §6 (emisión endurecida).
--
-- El draft lo calcula el servidor (TS), pero la RPC es la ÚLTIMA barrera antes de escribir una factura
-- INMUTABLE. Un payload manipulado/incoherente no debe poder facturar. Se añaden 4 validaciones (V1–V4)
-- al cuerpo de 20260617150000 (que ya hacía: coherencia contable P1-1, dedup por mes P0, persistencia
-- de identidad §5). Todo lo demás es IDÉNTICO.
--
--   V1 — cada `cm_id` (contract_machine_id) de una línea pertenece a ESTE contrato.
--   V2 — cada opening/closing_counter_id (si no es null) es una lectura ACTIVA de esa línea (atribución
--        directa por contract_machine_id, o fallback por máquina para relevés heredados con cm NULL).
--   V3 — el closing_counter_id no fue ya usado como cierre de otra factura EMISE (no reutilización; A2:
--        solo contra 'emise', no 'annulee' → tras anular, la lectura queda libre y se puede reemitir).
--   V4 — si el contrato ya tiene facturas emise, el mes facturado = último mes facturado + 1 (secuencia;
--        ordinal year*12+(month-1) para que el borde diciembre→enero sea correcto). Sin historial, el
--        primer mes lo ancla el draft (N7); la secuencia no tiene referencia en SQL y no se fuerza aquí.
--
-- Seguro: 0 facturas reales hoy.

BEGIN;

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
  -- V1–V4
  v_cm_id       uuid;
  v_open_id     uuid;
  v_close_id    uuid;
  v_last_ord    int;
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

  -- ── V4: secuencia de mes (solo si hay historial; el primer mes lo ancla el draft). ──
  SELECT MAX(period_year * 12 + (period_month - 1)) INTO v_last_ord
    FROM public.invoices
    WHERE contract_id = v_contract_id AND status = 'emise';
  IF v_last_ord IS NOT NULL AND (v_year * 12 + (v_month - 1)) <> v_last_ord + 1 THEN
    RAISE EXCEPTION 'billing_sequence_mismatch';
  END IF;

  -- P1-1: coherencia contable de cada línea + cuadre de la cabecera.
  -- V1/V2/V3: cada línea pertenece al contrato; sus lecturas pertenecen a la línea; cierre no reutilizado.
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

    v_cm_id    := NULLIF(v_line->>'cm_id', '')::uuid;
    v_open_id  := NULLIF(v_line->>'opening_counter_id', '')::uuid;
    v_close_id := NULLIF(v_line->>'closing_counter_id', '')::uuid;

    -- V1: la línea pertenece a ESTE contrato.
    IF v_cm_id IS NULL THEN
      RAISE EXCEPTION 'line_without_cm';
    END IF;
    IF NOT EXISTS (
      SELECT 1 FROM public.contract_machines cm
      WHERE cm.id = v_cm_id AND cm.contract_id = v_contract_id
    ) THEN
      RAISE EXCEPTION 'cm_id_not_in_contract';
    END IF;

    -- V2: opening/closing son lecturas ACTIVAS de esa línea (directo por contract_machine_id, o
    --     fallback por máquina para relevés heredados con contract_machine_id NULL — mismo criterio
    --     que countersForLine en el motor). Solo se valida cuando el id no es null (apertura por
    --     start_counter o tramo solo-fijo → null, legítimo).
    IF v_open_id IS NOT NULL AND NOT EXISTS (
      SELECT 1 FROM public.machine_counters mc
      JOIN public.contract_machines cm ON cm.id = v_cm_id
      WHERE mc.id = v_open_id AND mc.status = 'actif'
        AND (mc.contract_machine_id = v_cm_id
             OR (mc.contract_machine_id IS NULL AND mc.machine_id = cm.machine_id))
    ) THEN
      RAISE EXCEPTION 'opening_counter_not_in_line';
    END IF;
    IF v_close_id IS NOT NULL THEN
      IF NOT EXISTS (
        SELECT 1 FROM public.machine_counters mc
        JOIN public.contract_machines cm ON cm.id = v_cm_id
        WHERE mc.id = v_close_id AND mc.status = 'actif'
          AND (mc.contract_machine_id = v_cm_id
               OR (mc.contract_machine_id IS NULL AND mc.machine_id = cm.machine_id))
      ) THEN
        RAISE EXCEPTION 'closing_counter_not_in_line';
      END IF;
      -- V3: el closing no fue cierre de otra factura EMISE (no reutilización; A2: solo 'emise').
      IF EXISTS (
        SELECT 1 FROM public.invoice_lines il
        JOIN public.invoices i ON i.id = il.invoice_id
        WHERE il.closing_counter_id = v_close_id AND i.status = 'emise'
      ) THEN
        RAISE EXCEPTION 'closing_counter_already_used';
      END IF;
    END IF;
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
      amount_fixed, amount_bw, amount_color, amount_total, breakdown,
      contract_machine_id, opening_counter_id, closing_counter_id,
      opening_reading_date, closing_reading_date,
      opening_counter_bw, opening_counter_color, closing_counter_bw, closing_counter_color
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
           THEN NULL ELSE v_line->'breakdown' END,
      NULLIF(v_line->>'cm_id','')::uuid,
      NULLIF(v_line->>'opening_counter_id','')::uuid,
      NULLIF(v_line->>'closing_counter_id','')::uuid,
      NULLIF(v_line->>'opening_reading_date','')::date,
      NULLIF(v_line->>'closing_reading_date','')::date,
      NULLIF(v_line->>'opening_counter_bw','')::int,
      NULLIF(v_line->>'opening_counter_color','')::int,
      NULLIF(v_line->>'closing_counter_bw','')::int,
      NULLIF(v_line->>'closing_counter_color','')::int
    );
  END LOOP;

  RETURN v_invoice_id;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.emit_contract_invoice(jsonb) FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.emit_contract_invoice(jsonb) TO service_role;

COMMIT;
