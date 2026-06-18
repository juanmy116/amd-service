-- FASE 2 (PR-B) — el flujo OCR de contadores se alinea con el modelo "fecha real + línea":
--   · import_counter_from_pending: dedup por DÍA (no por mes), atribución de la línea por la FECHA
--     de la lectura (getLineForMachineAtDate en SQL), y persiste contract_machine_id.
--   · process_counter_extraction: el aviso de duplicado pasa de "mismo mes" a "mismo día"
--     (V_DUP_MONTH → V_DUP_DAY; V_DUP_PENDING también por día), para no marcar como duplicada una
--     segunda lectura legítima del mismo mes natural.
-- Spec: docs/superpowers/specs/2026-06-17-contadores-fecha-real-y-linea-design.md §6 (FASE 2).

BEGIN;

-- ───────────────────────────────────────────────────────────────────────────
-- import_counter_from_pending: copia íntegra de 20260612104341 con los cambios marcados.
-- ───────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.import_counter_from_pending(
  p_pending_id uuid, p_reviewed_by uuid, p_overrides jsonb DEFAULT '{}'::jsonb
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
DECLARE
  v_row     public.pending_counter_imports;
  v_machine text;
  v_bw      int;
  v_color   int;
  v_date    timestamptz;
  v_year    int;
  v_month   int;
  v_day     int;
  v_rdate   date;
  v_client  bigint;
  v_contract uuid;
  v_cm_id   uuid;      -- NUEVO: línea/puesto vigente en la fecha de la lectura
  v_counter_id uuid;
BEGIN
  IF auth.role() <> 'service_role' THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  SELECT * INTO v_row FROM public.pending_counter_imports WHERE id = p_pending_id;
  IF v_row IS NULL THEN RAISE EXCEPTION 'pending_not_found'; END IF;
  IF v_row.status <> 'pending_review' THEN RAISE EXCEPTION 'already_processed'; END IF;

  v_machine := COALESCE(NULLIF(p_overrides->>'machine_id',''), v_row.matched_machine_id);
  IF v_machine IS NULL THEN RAISE EXCEPTION 'no_machine'; END IF;

  v_bw    := COALESCE(NULLIF(p_overrides->>'counter_bw','')::int,    (v_row.extracted_data->>'counter_bw')::int);
  v_color := COALESCE(NULLIF(p_overrides->>'counter_color','')::int, (v_row.extracted_data->>'counter_color')::int);
  v_date  := COALESCE(NULLIF(p_overrides->>'date_iso','')::timestamptz, NULLIF(v_row.extracted_data->>'date_iso','')::timestamptz, now());
  v_year  := EXTRACT(YEAR  FROM v_date)::int;
  v_month := EXTRACT(MONTH FROM v_date)::int;
  v_day   := EXTRACT(DAY   FROM v_date)::int;
  v_rdate := v_date::date;

  IF v_bw IS NULL OR v_color IS NULL THEN RAISE EXCEPTION 'missing_counters'; END IF;

  -- CAMBIO: una lectura activa por máquina y DÍA (no por mes) → permite dos lecturas en el mismo
  -- mes natural; otra del mismo día = corrección (anular la anterior).
  IF EXISTS (
    SELECT 1 FROM public.machine_counters
    WHERE machine_id = v_machine AND year = v_year AND month = v_month AND day = v_day AND status = 'actif'
  ) THEN
    RAISE EXCEPTION 'counter_exists_for_day';
  END IF;

  -- CAMBIO: línea/cliente VIGENTES EN LA FECHA de la lectura (no «la línea abierta hoy»).
  SELECT c.client_id, cm.contract_id, cm.id INTO v_client, v_contract, v_cm_id
  FROM public.contract_machines cm
  JOIN public.contracts c ON c.id = cm.contract_id
  WHERE cm.machine_id = v_machine
    AND cm.date_debut <= v_rdate
    AND (cm.date_fin IS NULL OR cm.date_fin >= v_rdate)
  ORDER BY cm.date_debut DESC
  LIMIT 1;

  IF v_contract IS NULL THEN
    RAISE EXCEPTION 'no_active_line';
  END IF;

  INSERT INTO public.machine_counters
    (machine_id, contract_id, contract_machine_id, client_id, year, month, day, counter_bw, counter_color,
     status, notes, recorded_by, recorded_at)
  VALUES
    (v_machine, v_contract, v_cm_id, v_client, v_year, v_month, v_day, v_bw, v_color,
     'actif', 'Importé via email (OCR)', NULL, now())
  RETURNING id INTO v_counter_id;

  UPDATE public.pending_counter_imports
  SET status = 'confirmed', imported_counter_id = v_counter_id,
      reviewed_by = p_reviewed_by, reviewed_at = now()
  WHERE id = p_pending_id;

  RETURN v_counter_id;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.import_counter_from_pending(uuid, uuid, jsonb) FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.import_counter_from_pending(uuid, uuid, jsonb) TO service_role;

-- ───────────────────────────────────────────────────────────────────────────
-- process_counter_extraction: copia íntegra de 20260614170000 con el aviso de duplicado por DÍA.
-- ───────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.process_counter_extraction(p_pending_id uuid, p_extracted jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
DECLARE
  v_serial      text := NULLIF(trim(p_extracted->>'serial'), '');
  v_is_sheet    bool := COALESCE((p_extracted->>'is_valid_counter_sheet')::bool, false);
  v_conf        numeric := COALESCE((p_extracted->>'confidence')::numeric, 0);
  v_bw          int := NULLIF(p_extracted->>'counter_bw','')::int;
  v_color       int := NULLIF(p_extracted->>'counter_color','')::int;
  v_copier_bw   int := NULLIF(p_extracted->>'copier_bw','')::int;
  v_printer_bw  int := NULLIF(p_extracted->>'printer_bw','')::int;
  v_copier_col  int := NULLIF(p_extracted->>'copier_color','')::int;
  v_printer_col int := NULLIF(p_extracted->>'printer_color','')::int;
  v_date        timestamptz := NULLIF(p_extracted->>'date_iso','')::timestamptz;
  v_year        int := EXTRACT(YEAR  FROM COALESCE(v_date, now()))::int;
  v_month       int := EXTRACT(MONTH FROM COALESCE(v_date, now()))::int;
  v_day         int := EXTRACT(DAY   FROM COALESCE(v_date, now()))::int;  -- NUEVO
  v_cur_year    int := EXTRACT(YEAR FROM now())::int;
  v_machine     text;
  v_errors      text[] := ARRAY[]::text[];
  v_light       text;
  v_prev_bw     int;
  v_prev_color  int;
BEGIN
  IF auth.role() <> 'service_role' THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  SELECT numero_serie INTO v_machine
  FROM public.machines WHERE numero_serie = v_serial AND active = true;

  IF v_conf < 0.80 THEN v_errors := array_append(v_errors, 'V_CONF'); END IF;
  IF v_bw IS NULL OR v_bw < 0 OR v_bw > 100000000 THEN v_errors := array_append(v_errors, 'V_RANGE_BW'); END IF;
  IF v_color IS NULL OR v_color < 0 OR v_color > 100000000 THEN v_errors := array_append(v_errors, 'V_RANGE_COLOR'); END IF;
  IF v_year NOT IN (v_cur_year, v_cur_year - 1) THEN v_errors := array_append(v_errors, 'V_YEAR'); END IF;
  IF v_month < 1 OR v_month > 12 THEN v_errors := array_append(v_errors, 'V_MONTH'); END IF;
  IF v_copier_bw IS NOT NULL AND v_printer_bw IS NOT NULL AND v_bw IS NOT NULL
     AND (v_copier_bw + v_printer_bw) <> v_bw THEN v_errors := array_append(v_errors, 'V_CROSS_BW'); END IF;
  IF v_copier_col IS NOT NULL AND v_printer_col IS NOT NULL AND v_color IS NOT NULL
     AND (v_copier_col + v_printer_col) <> v_color THEN v_errors := array_append(v_errors, 'V_CROSS_COLOR'); END IF;

  IF v_machine IS NOT NULL THEN
    SELECT counter_bw, counter_color INTO v_prev_bw, v_prev_color
    FROM public.machine_counters
    WHERE machine_id = v_machine AND status = 'actif'
    ORDER BY year DESC, month DESC, day DESC, recorded_at DESC   -- CAMBIO: orden por fecha real (incluye día)
    LIMIT 1;

    IF v_prev_bw IS NOT NULL AND v_bw IS NOT NULL AND v_bw < v_prev_bw THEN
      v_errors := array_append(v_errors, 'V_NONDECR_BW');
    END IF;
    IF v_prev_color IS NOT NULL AND v_color IS NOT NULL AND v_color < v_prev_color THEN
      v_errors := array_append(v_errors, 'V_NONDECR_COLOR');
    END IF;
    -- CAMBIO: duplicado por DÍA (no por mes) — una segunda lectura del mismo mes ya no es duplicado.
    IF EXISTS (
      SELECT 1 FROM public.machine_counters
      WHERE machine_id = v_machine AND year = v_year AND month = v_month AND day = v_day AND status = 'actif'
    ) THEN
      v_errors := array_append(v_errors, 'V_DUP_DAY');
    END IF;

    -- Otra lectura de la MISMA máquina y MISMO DÍA aún pendiente en la cola (sin confirmar).
    IF EXISTS (
      SELECT 1 FROM public.pending_counter_imports p
      WHERE p.matched_machine_id = v_machine
        AND p.status = 'pending_review'
        AND p.id <> p_pending_id
        AND EXTRACT(YEAR  FROM COALESCE(NULLIF(p.extracted_data->>'date_iso','')::timestamptz, p.extracted_at))::int = v_year
        AND EXTRACT(MONTH FROM COALESCE(NULLIF(p.extracted_data->>'date_iso','')::timestamptz, p.extracted_at))::int = v_month
        AND EXTRACT(DAY   FROM COALESCE(NULLIF(p.extracted_data->>'date_iso','')::timestamptz, p.extracted_at))::int = v_day
    ) THEN
      v_errors := array_append(v_errors, 'V_DUP_PENDING');
    END IF;
  END IF;

  IF NOT v_is_sheet OR v_serial IS NULL THEN
    v_light := 'red';
  ELSIF v_machine IS NULL THEN
    v_light := 'red';
    v_errors := array_append(v_errors, 'V_NO_MATCH');
  ELSIF array_length(v_errors, 1) IS NULL THEN
    v_light := 'green';
  ELSE
    v_light := 'amber';
  END IF;

  UPDATE public.pending_counter_imports
  SET extracted_data    = p_extracted,
      matched_machine_id = v_machine,
      validation_errors = to_jsonb(v_errors),
      light             = v_light,
      status            = 'pending_review',
      extracted_at      = now()
  WHERE id = p_pending_id;

  RETURN jsonb_build_object('light', v_light, 'matched_machine_id', v_machine, 'errors', to_jsonb(v_errors));
END;
$$;
REVOKE EXECUTE ON FUNCTION public.process_counter_extraction(uuid, jsonb) FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.process_counter_extraction(uuid, jsonb) TO service_role;

COMMIT;
