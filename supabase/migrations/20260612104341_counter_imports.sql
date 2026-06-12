-- Buzón de Contadores por email (Fase 1 del agente supervisor).
-- Crea: bucket privado counter-images, tabla pending_counter_imports (cola + audit),
-- RPC process_counter_extraction (match por serial + validaciones + semáforo) y
-- RPC import_counter_from_pending (confirmación admin → INSERT en machine_counters).
-- Toda la lógica de decisión vive en SQL (un solo sitio, testeable por integración).

BEGIN;

-- ───────────────────────────────────────────────────────────────────────────
-- 1) Bucket de Storage para las imágenes originales (privado).
-- ───────────────────────────────────────────────────────────────────────────
INSERT INTO storage.buckets (id, name, public)
VALUES ('counter-images', 'counter-images', false)
ON CONFLICT (id) DO NOTHING;

-- Solo service_role escribe/lee; los admins leen vía signed URLs generadas server-side.
CREATE POLICY "counter_images_service_all" ON storage.objects
  FOR ALL TO service_role
  USING (bucket_id = 'counter-images') WITH CHECK (bucket_id = 'counter-images');

CREATE POLICY "counter_images_admin_read" ON storage.objects
  FOR SELECT TO authenticated
  USING (bucket_id = 'counter-images' AND public.is_admin());

-- ───────────────────────────────────────────────────────────────────────────
-- 2) Cola de revisión + audit log.
-- ───────────────────────────────────────────────────────────────────────────
CREATE TABLE public.pending_counter_imports (
  id                  uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  image_path          text        NOT NULL,
  image_size_bytes    int         NOT NULL,
  image_hash_sha256   text        NOT NULL UNIQUE,
  source              text        NOT NULL DEFAULT 'email' CHECK (source IN ('email','whatsapp','manual')),
  email_from          text,
  email_subject       text,
  email_message_id    text,
  extraction_model    text        NOT NULL DEFAULT '',
  extraction_cost_usd numeric(10,6) NOT NULL DEFAULT 0,
  extracted_at        timestamptz NOT NULL DEFAULT now(),
  extracted_data      jsonb       NOT NULL DEFAULT '{}'::jsonb,
  matched_machine_id  text        REFERENCES public.machines(numero_serie) ON DELETE SET NULL,
  validation_errors   jsonb       NOT NULL DEFAULT '[]'::jsonb,
  light               text        NOT NULL DEFAULT 'red' CHECK (light IN ('green','amber','red')),
  status              text        NOT NULL DEFAULT 'pending_review'
                        CHECK (status IN ('pending_review','confirmed','rejected','failed_extraction')),
  imported_counter_id uuid        REFERENCES public.machine_counters(id) ON DELETE SET NULL,
  reviewed_by         uuid        REFERENCES public.profiles(id) ON DELETE SET NULL,
  reviewed_at         timestamptz,
  rejection_reason    text,
  notes               text,
  created_at          timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_pci_status_extracted ON public.pending_counter_imports (status, extracted_at DESC);
CREATE INDEX idx_pci_matched_machine  ON public.pending_counter_imports (matched_machine_id);
CREATE INDEX idx_pci_message_id       ON public.pending_counter_imports (email_message_id);

ALTER TABLE public.pending_counter_imports ENABLE ROW LEVEL SECURITY;

-- Admin: lectura + actualización (revisión). INSERT solo service_role (Edge Function).
CREATE POLICY "pci_admin_select" ON public.pending_counter_imports
  FOR SELECT TO authenticated USING (public.is_admin());
CREATE POLICY "pci_admin_update" ON public.pending_counter_imports
  FOR UPDATE TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());

COMMENT ON TABLE public.pending_counter_imports IS
  'Cola de revisión + audit log de los contadores recibidos por email. Nada entra a machine_counters sin confirmación de un admin.';

-- ───────────────────────────────────────────────────────────────────────────
-- 3) RPC: match por serial + validaciones + semáforo.
--    Recibe el JSON crudo del LLM, decide light/validation_errors y persiste.
--    extracted_data esperado:
--      { serial, date_iso, counter_bw, counter_color,
--        copier_bw?, printer_bw?, copier_color?, printer_color?,
--        confidence, is_valid_counter_sheet, issues[] }
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

-- ───────────────────────────────────────────────────────────────────────────
-- 4) RPC: confirmación del admin → INSERT en machine_counters.
--    p_overrides permite que el admin corrija campos antes de confirmar.
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
  v_client  bigint;
  v_contract uuid;
  v_counter_id uuid;
BEGIN
  IF auth.role() <> 'service_role' THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  SELECT * INTO v_row FROM public.pending_counter_imports WHERE id = p_pending_id;
  IF v_row IS NULL THEN RAISE EXCEPTION 'pending_not_found'; END IF;
  IF v_row.status <> 'pending_review' THEN RAISE EXCEPTION 'already_processed'; END IF;

  -- El override de máquina gana al match automático (caso 🔴 asignado a mano).
  v_machine := COALESCE(NULLIF(p_overrides->>'machine_id',''), v_row.matched_machine_id);
  IF v_machine IS NULL THEN RAISE EXCEPTION 'no_machine'; END IF;

  v_bw    := COALESCE(NULLIF(p_overrides->>'counter_bw','')::int,    (v_row.extracted_data->>'counter_bw')::int);
  v_color := COALESCE(NULLIF(p_overrides->>'counter_color','')::int, (v_row.extracted_data->>'counter_color')::int);
  v_date  := COALESCE(NULLIF(p_overrides->>'date_iso','')::timestamptz, NULLIF(v_row.extracted_data->>'date_iso','')::timestamptz, now());
  v_year  := EXTRACT(YEAR  FROM v_date)::int;
  v_month := EXTRACT(MONTH FROM v_date)::int;
  v_day   := EXTRACT(DAY   FROM v_date)::int;

  IF v_bw IS NULL OR v_color IS NULL THEN RAISE EXCEPTION 'missing_counters'; END IF;

  -- No duplicar el relevé del mes (respeta machine_counters_one_active_per_month).
  IF EXISTS (
    SELECT 1 FROM public.machine_counters
    WHERE machine_id = v_machine AND year = v_year AND month = v_month AND status = 'actif'
  ) THEN
    RAISE EXCEPTION 'counter_exists_for_month';
  END IF;

  -- Cliente/contrato actual del parque (línea abierta).
  SELECT c.client_id, cm.contract_id INTO v_client, v_contract
  FROM public.contract_machines cm
  JOIN public.contracts c ON c.id = cm.contract_id
  WHERE cm.machine_id = v_machine AND cm.date_fin IS NULL AND cm.statut = 'actif'
  LIMIT 1;

  -- Sin línea de contrato activa el relevé no se podría facturar (quedaría huérfano de cliente).
  -- Mejor rechazar y que el admin cree/active el contrato antes de importar.
  IF v_contract IS NULL THEN
    RAISE EXCEPTION 'no_active_line';
  END IF;

  INSERT INTO public.machine_counters
    (machine_id, contract_id, client_id, year, month, day, counter_bw, counter_color,
     status, notes, recorded_by, recorded_at)
  VALUES
    (v_machine, v_contract, v_client, v_year, v_month, v_day, v_bw, v_color,
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

COMMIT;
