-- Detección de duplicados en el buzón de contadores.
-- Antes: receive-counter-email descartaba en SILENCIO el reenvío de una foto byte-idéntica
-- (mismo hash) y process_counter_extraction solo detectaba doble-relevé-del-mes contra
-- lecturas YA confirmadas (machine_counters). Resultado: si reenviabas la misma foto o
-- llegaban dos fotos distintas de la misma máquina/mes aún en cola, no había aviso.
-- Ahora:
--   (nivel 1) columnas duplicate_count/last_duplicate_at + RPC register_counter_duplicate
--             → el reenvío del mismo fichero deja rastro visible en la fila original.
--   (nivel 2) nuevo código V_DUP_PENDING en process_counter_extraction → detecta otra
--             lectura de la misma máquina y mes que sigue EN LA COLA (pending_review) → 🟡.
-- Decisión (usuario 2026-06-14): marcar 🟡 y dejar decidir al admin; no bloquear.

BEGIN;

-- ───────────────────────────────────────────────────────────────────────────
-- 1) Nivel 1: seguimiento de reenvíos del mismo fichero.
-- ───────────────────────────────────────────────────────────────────────────
ALTER TABLE public.pending_counter_imports
  ADD COLUMN duplicate_count   int         NOT NULL DEFAULT 0,
  ADD COLUMN last_duplicate_at timestamptz;

COMMENT ON COLUMN public.pending_counter_imports.duplicate_count IS
  'Nº de veces que el MISMO fichero (hash) se reenvió tras la primera recepción. >0 = reenvíos detectados.';

-- RPC: incremento atómico del contador de reenvíos. Devuelve el estado de la fila original
-- (para que la Edge Function pueda avisar "ya recibida el [fecha], quedó en [estado]").
CREATE OR REPLACE FUNCTION public.register_counter_duplicate(p_hash text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
DECLARE
  v_row public.pending_counter_imports;
BEGIN
  IF auth.role() <> 'service_role' THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  UPDATE public.pending_counter_imports
  SET duplicate_count = duplicate_count + 1, last_duplicate_at = now()
  WHERE image_hash_sha256 = p_hash
  RETURNING * INTO v_row;

  IF v_row.id IS NULL THEN
    RETURN NULL;
  END IF;

  RETURN jsonb_build_object(
    'id',                 v_row.id,
    'status',             v_row.status,
    'light',              v_row.light,
    'matched_machine_id', v_row.matched_machine_id,
    'first_seen',         v_row.created_at,
    'duplicate_count',    v_row.duplicate_count
  );
END;
$$;
REVOKE EXECUTE ON FUNCTION public.register_counter_duplicate(text) FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.register_counter_duplicate(text) TO service_role;

-- ───────────────────────────────────────────────────────────────────────────
-- 2) Nivel 2: process_counter_extraction con el chequeo V_DUP_PENDING.
--    Copia íntegra de la función (migración 20260612104341) + el bloque nuevo
--    marcado abajo. El resto de la lógica (match, validaciones, semáforo) es idéntico.
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

  -- Match por serial contra equipo existente y activo.
  SELECT numero_serie INTO v_machine
  FROM public.machines WHERE numero_serie = v_serial AND active = true;

  -- Validaciones de forma (amber).
  IF v_conf < 0.80 THEN v_errors := array_append(v_errors, 'V_CONF'); END IF;
  IF v_bw IS NULL OR v_bw < 0 OR v_bw > 100000000 THEN v_errors := array_append(v_errors, 'V_RANGE_BW'); END IF;
  IF v_color IS NULL OR v_color < 0 OR v_color > 100000000 THEN v_errors := array_append(v_errors, 'V_RANGE_COLOR'); END IF;
  IF v_year NOT IN (v_cur_year, v_cur_year - 1) THEN v_errors := array_append(v_errors, 'V_YEAR'); END IF;
  IF v_month < 1 OR v_month > 12 THEN v_errors := array_append(v_errors, 'V_MONTH'); END IF;
  -- Sumas cruzadas SOLO si la hoja trae los sub-campos (Ricoh). Pantum/otras no los traen.
  IF v_copier_bw IS NOT NULL AND v_printer_bw IS NOT NULL AND v_bw IS NOT NULL
     AND (v_copier_bw + v_printer_bw) <> v_bw THEN v_errors := array_append(v_errors, 'V_CROSS_BW'); END IF;
  IF v_copier_col IS NOT NULL AND v_printer_col IS NOT NULL AND v_color IS NOT NULL
     AND (v_copier_col + v_printer_col) <> v_color THEN v_errors := array_append(v_errors, 'V_CROSS_COLOR'); END IF;

  -- Validaciones que dependen de datos (solo si hay máquina).
  IF v_machine IS NOT NULL THEN
    SELECT counter_bw, counter_color INTO v_prev_bw, v_prev_color
    FROM public.machine_counters
    WHERE machine_id = v_machine AND status = 'actif'
    ORDER BY year DESC, month DESC, recorded_at DESC
    LIMIT 1;

    IF v_prev_bw IS NOT NULL AND v_bw IS NOT NULL AND v_bw < v_prev_bw THEN
      v_errors := array_append(v_errors, 'V_NONDECR_BW');
    END IF;
    IF v_prev_color IS NOT NULL AND v_color IS NOT NULL AND v_color < v_prev_color THEN
      v_errors := array_append(v_errors, 'V_NONDECR_COLOR');
    END IF;
    IF EXISTS (
      SELECT 1 FROM public.machine_counters
      WHERE machine_id = v_machine AND year = v_year AND month = v_month AND status = 'actif'
    ) THEN
      v_errors := array_append(v_errors, 'V_DUP_MONTH');
    END IF;

    -- ── NUEVO (nivel 2): otra lectura de la MISMA máquina y MISMO mes que sigue
    -- esperando en la cola (aún sin confirmar → V_DUP_MONTH no la ve). El mes de las
    -- otras pendientes se deriva igual que aquí: date_iso del LLM o, en su defecto, extracted_at.
    IF EXISTS (
      SELECT 1 FROM public.pending_counter_imports p
      WHERE p.matched_machine_id = v_machine
        AND p.status = 'pending_review'
        AND p.id <> p_pending_id
        AND EXTRACT(YEAR  FROM COALESCE(NULLIF(p.extracted_data->>'date_iso','')::timestamptz, p.extracted_at))::int = v_year
        AND EXTRACT(MONTH FROM COALESCE(NULLIF(p.extracted_data->>'date_iso','')::timestamptz, p.extracted_at))::int = v_month
    ) THEN
      v_errors := array_append(v_errors, 'V_DUP_PENDING');
    END IF;
  END IF;

  -- Semáforo.
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
