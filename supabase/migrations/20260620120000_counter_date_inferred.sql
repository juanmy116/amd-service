-- Algunas hojas de contador (Pantum "Printer Information Page", HP "Rapport d'utilisation") NO
-- imprimen fecha de lectura. El motor `parse-counter-document` deduce la fecha del LOTE (la del
-- resto de hojas del mismo PDF) y marca esa lectura con `date_inferred=true`.
-- Aquí: cuando `date_inferred` es true, se añade el código V_DATE_INFERRED → la lectura sale 🟡
-- amber (revisión humana antes de confirmar). El flujo de EMAIL no manda esa marca → no le afecta.
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
  v_day         int := EXTRACT(DAY   FROM COALESCE(v_date, now()))::int;
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
  -- NUEVO: fecha deducida del lote (la hoja no la imprime) → 🟡 para que un humano la verifique.
  IF COALESCE((p_extracted->>'date_inferred')::bool, false) THEN
    v_errors := array_append(v_errors, 'V_DATE_INFERRED');
  END IF;

  IF v_machine IS NOT NULL THEN
    SELECT counter_bw, counter_color INTO v_prev_bw, v_prev_color
    FROM public.machine_counters
    WHERE machine_id = v_machine AND status = 'actif'
    ORDER BY year DESC, month DESC, day DESC, recorded_at DESC
    LIMIT 1;

    IF v_prev_bw IS NOT NULL AND v_bw IS NOT NULL AND v_bw < v_prev_bw THEN
      v_errors := array_append(v_errors, 'V_NONDECR_BW');
    END IF;
    IF v_prev_color IS NOT NULL AND v_color IS NOT NULL AND v_color < v_prev_color THEN
      v_errors := array_append(v_errors, 'V_NONDECR_COLOR');
    END IF;
    IF EXISTS (
      SELECT 1 FROM public.machine_counters
      WHERE machine_id = v_machine AND year = v_year AND month = v_month AND day = v_day AND status = 'actif'
    ) THEN
      v_errors := array_append(v_errors, 'V_DUP_DAY');
    END IF;

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
