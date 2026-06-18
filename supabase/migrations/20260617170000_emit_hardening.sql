-- PR-D.1 (FASE 4) — ENDURECIMIENTO de emit_contract_invoice: la RPC ya NO confía en el payload.
-- Spec: docs/superpowers/specs/2026-06-17-contadores-fecha-real-y-linea-design.md §6 (emisión endurecida).
--
-- El draft lo calcula el servidor (TS), pero la RPC es la ÚLTIMA barrera antes de escribir una factura
-- INMUTABLE. Un payload manipulado/incoherente no debe poder facturar. Se añaden 4 validaciones (V1–V4)
-- al cuerpo de 20260617150000 (que ya hacía: coherencia contable P1-1, dedup por mes P0, persistencia
-- de identidad §5). Todo lo demás es IDÉNTICO.
--
--   V1 — cada `cm_id` (contract_machine_id) de una línea pertenece a ESTE contrato.
--   V2 — cada opening/closing_counter_id (si no es null) es una lectura ACTIVA de esa línea: atribución
--        directa por contract_machine_id, o fallback por máquina para relevés heredados con cm NULL
--        CUYA FECHA cae en la vigencia (date_debut, date_fin] — criterio idéntico a countersForLine.
--   V3 — no reutilización de un cierre, en TRES frentes. Los cierres se recolectan POR LÍNEA: el cierre
--        top-level SIEMPRE se incluye (un payload con breakdown:[] no puede ocultarlo) + los cierres de
--        cada tramo del breakdown. El duplicado BENIGNO (la cabeza de un reemplazo aparece en top-level
--        Y en su propio breakdown, misma línea) se colapsa con DISTINCT (línea, cierre).
--        V3a: ningún `cm_id` top-level repetido en el payload (doble forfait/consumo de la misma línea).
--        V3b: ningún cierre aparece en MÁS DE UNA línea → un mismo cierre no se cobra dos veces.
--        V3c: ningún cierre del payload fue ya cierre de una factura EMISE (A2: solo 'emise', no
--             'annulee' → tras anular, la lectura queda libre para reemitir); mira AMBOS sitios
--             persistidos: invoice_lines.closing_counter_id y los tramos en breakdown.
--   V4 — si el contrato ya tiene facturas emise, el mes facturado = último mes facturado + 1 (secuencia;
--        ordinal year*12+(month-1) para que el borde diciembre→enero sea correcto). Sin historial, el
--        primer mes lo ancla el draft (N7); la secuencia no tiene referencia en SQL y no se fuerza aquí.
--   P2 — invoice_lines.contract_id (inmutable) se persiste = v_contract_id validado, no del payload.
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
  v_closings    uuid[];
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

  -- P0 dedup: no duplicar factura emise para el mismo contrato y MES FACTURADO (estable). Va ANTES de
  -- V4 para que reintentar un mes YA facturado dé el mensaje claro 'already_issued' (y no que lo tape
  -- 'billing_sequence_mismatch' de V4, que solo debe capturar saltos a meses aún no facturados).
  IF EXISTS (
    SELECT 1 FROM public.invoices
    WHERE contract_id = v_contract_id
      AND period_year = v_year AND period_month = v_month
      AND status = 'emise'
  ) THEN
    RAISE EXCEPTION 'already_issued';
  END IF;

  -- ── V4: secuencia de mes (solo si hay historial; el primer mes lo ancla el draft). ──
  SELECT MAX(period_year * 12 + (period_month - 1)) INTO v_last_ord
    FROM public.invoices
    WHERE contract_id = v_contract_id AND status = 'emise';
  IF v_last_ord IS NOT NULL AND (v_year * 12 + (v_month - 1)) <> v_last_ord + 1 THEN
    RAISE EXCEPTION 'billing_sequence_mismatch';
  END IF;

  -- ── V3a: ningún cm_id (poste) repetido DENTRO del payload (doble forfait/consumo de la misma línea).
  --        Solo top-level: las líneas facturables son las cabezas; el breakdown es sub-detalle. ──
  IF (SELECT count(*) FILTER (WHERE NULLIF(l->>'cm_id','') IS NOT NULL)
            - count(DISTINCT NULLIF(l->>'cm_id',''))
        FROM jsonb_array_elements(v_lines) l) <> 0 THEN
    RAISE EXCEPTION 'duplicate_cm_in_payload';
  END IF;

  -- ── Cierres del payload, recolectados POR LÍNEA (WITH ORDINALITY = índice de línea). El cierre
  --     top-level SIEMPRE se incluye (un payload con breakdown:[] no puede ocultarlo, P0 de la 3ª
  --     revisión); también se incluyen los cierres de cada tramo del breakdown. El duplicado BENIGNO
  --     (la cabeza B aparece en top-level Y en su propio breakdown, misma línea) se colapsa con
  --     DISTINCT (ord, cid): dentro de una línea un id cuenta una vez; entre líneas distintas, no. ──

  -- V3b: ningún cierre aparece en MÁS DE UNA línea (eso sí sería cobrar dos veces el mismo cierre).
  IF EXISTS (
    SELECT 1 FROM (
      SELECT DISTINCT ord, cid FROM (
        SELECT l.ord AS ord, NULLIF(l.val->>'closing_counter_id','')::uuid AS cid
          FROM jsonb_array_elements(v_lines) WITH ORDINALITY AS l(val, ord)
         WHERE NULLIF(l.val->>'closing_counter_id','') IS NOT NULL
        UNION ALL
        SELECT l.ord, NULLIF(b->>'closing_counter_id','')::uuid
          FROM jsonb_array_elements(v_lines) WITH ORDINALITY AS l(val, ord)
          CROSS JOIN LATERAL jsonb_array_elements(
            CASE WHEN jsonb_typeof(l.val->'breakdown') = 'array' THEN l.val->'breakdown' ELSE '[]'::jsonb END) b
         WHERE NULLIF(b->>'closing_counter_id','') IS NOT NULL
      ) all_c
    ) per_line
    GROUP BY cid HAVING count(*) > 1
  ) THEN
    RAISE EXCEPTION 'closing_counter_already_used';
  END IF;

  -- Conjunto (distinct) de TODOS los cierres del payload (top-level SIEMPRE + breakdown) para V3c.
  SELECT array_agg(DISTINCT cid) INTO v_closings FROM (
    SELECT NULLIF(l->>'closing_counter_id','')::uuid AS cid
      FROM jsonb_array_elements(v_lines) l
     WHERE NULLIF(l->>'closing_counter_id','') IS NOT NULL
    UNION ALL
    SELECT NULLIF(b->>'closing_counter_id','')::uuid
      FROM jsonb_array_elements(v_lines) l
      CROSS JOIN LATERAL jsonb_array_elements(
        CASE WHEN jsonb_typeof(l->'breakdown') = 'array' THEN l->'breakdown' ELSE '[]'::jsonb END) b
     WHERE NULLIF(b->>'closing_counter_id','') IS NOT NULL
  ) s;

  -- ── V3c: ningún cierre del payload fue ya cierre de una factura EMISE (no reutilización; A2: solo
  --        'emise'). Mira AMBOS sitios persistidos: invoice_lines.closing_counter_id Y los tramos
  --        dentro de invoice_lines.breakdown. ──
  IF v_closings IS NOT NULL AND EXISTS (
    SELECT 1
      FROM public.invoice_lines il
      JOIN public.invoices i ON i.id = il.invoice_id AND i.status = 'emise'
     WHERE il.closing_counter_id = ANY(v_closings)
        OR EXISTS (
             SELECT 1 FROM jsonb_array_elements(
                            CASE WHEN jsonb_typeof(il.breakdown) = 'array' THEN il.breakdown ELSE '[]'::jsonb END) bb
              WHERE NULLIF(bb->>'closing_counter_id','')::uuid = ANY(v_closings)
           )
  ) THEN
    RAISE EXCEPTION 'closing_counter_already_used';
  END IF;

  -- P1-1: coherencia contable de cada línea + cuadre de la cabecera.
  -- V1/V2: cada línea pertenece al contrato; sus lecturas pertenecen a la línea (la no-reutilización de
  -- cierres ya se validó arriba como conjunto, V3a/b/c).
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

    -- V2: opening/closing son lecturas ACTIVAS de esa línea. Criterio IDÉNTICO a countersForLine del
    --     motor: atribución directa por contract_machine_id, O fallback por máquina para relevés
    --     heredados (contract_machine_id NULL) cuya FECHA cae en la vigencia de la línea —
    --     (date_debut, date_fin] (inferior estricto, superior inclusivo). Sin el rango, un relevé
    --     legacy de OTRA etapa de la misma máquina podría colarse (P1). id null = apertura por
    --     start_counter o tramo solo-fijo → legítimo, no se valida.
    IF v_open_id IS NOT NULL AND NOT EXISTS (
      SELECT 1 FROM public.machine_counters mc
      JOIN public.contract_machines cm ON cm.id = v_cm_id
      WHERE mc.id = v_open_id AND mc.status = 'actif'
        AND (mc.contract_machine_id = v_cm_id
             OR (mc.contract_machine_id IS NULL AND mc.machine_id = cm.machine_id
                 AND mc.reading_date > cm.date_debut
                 AND (cm.date_fin IS NULL OR mc.reading_date <= cm.date_fin)))
    ) THEN
      RAISE EXCEPTION 'opening_counter_not_in_line';
    END IF;
    IF v_close_id IS NOT NULL AND NOT EXISTS (
      SELECT 1 FROM public.machine_counters mc
      JOIN public.contract_machines cm ON cm.id = v_cm_id
      WHERE mc.id = v_close_id AND mc.status = 'actif'
        AND (mc.contract_machine_id = v_cm_id
             OR (mc.contract_machine_id IS NULL AND mc.machine_id = cm.machine_id
                 AND mc.reading_date > cm.date_debut
                 AND (cm.date_fin IS NULL OR mc.reading_date <= cm.date_fin)))
    ) THEN
      RAISE EXCEPTION 'closing_counter_not_in_line';
    END IF;
  END LOOP;

  IF v_sum <> v_total THEN
    RAISE EXCEPTION 'header_total_mismatch';
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
      v_contract_id,   -- P2: columna inmutable → el contrato validado (V1), no el valor del payload.
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
