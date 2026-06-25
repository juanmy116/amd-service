-- Foto adjunta a la incidencia SAV abierta por el cliente.
-- La tabla public.incident_photos ya existe desde el schema inicial (nunca se usó);
-- aquí se le añaden las políticas RLS de cliente y técnico (el admin ya tiene ALL) y
-- se crea el bucket privado `incident-photos`.
--
-- Modelo (como counter-images): el bucket solo lo toca service_role. La subida usa una URL
-- firmada que genera el servidor (createSignedUploadUrl) y la lectura URLs firmadas generadas
-- server-side con el admin client. La autorización de "quién ve qué foto" vive en las políticas
-- RLS de la TABLA incident_photos, no en Storage.
-- Diferencia con counter-images: aquí NO se añade una policy de lectura directa para
-- `authenticated` (counter-images tiene `counter_images_admin_read`); ningún rol lee el bucket
-- directamente, todas las lecturas pasan por signed URLs del admin client.

BEGIN;

-- ───────────────────────────────────────────────────────────────────────────
-- 1) Bucket de Storage para las fotos de incidencias (privado).
-- ───────────────────────────────────────────────────────────────────────────
INSERT INTO storage.buckets (id, name, public)
VALUES ('incident-photos', 'incident-photos', false)
ON CONFLICT (id) DO NOTHING;

-- Solo service_role escribe/lee; las URLs firmadas se generan server-side.
CREATE POLICY "incident_photos_service_all" ON storage.objects
  FOR ALL TO service_role
  USING (bucket_id = 'incident-photos') WITH CHECK (bucket_id = 'incident-photos');

-- ───────────────────────────────────────────────────────────────────────────
-- 2) Políticas RLS de la tabla incident_photos.
--    (admin_all_incident_photos ya existe: ALL con is_admin()).
-- ───────────────────────────────────────────────────────────────────────────

-- Cliente: ve y crea fotos de las incidencias de SUS líneas de contrato.
-- Mismo predicado que las policies de incidents del portal (auth_client_contract_machine_ids()).
CREATE POLICY "client_incident_photos_select" ON public.incident_photos
  FOR SELECT TO authenticated
  USING (
    incident_id IN (
      SELECT id FROM public.incidents
      WHERE contract_machine_id IN (SELECT auth_client_contract_machine_ids())
    )
  );

CREATE POLICY "client_incident_photos_insert" ON public.incident_photos
  FOR INSERT TO authenticated
  WITH CHECK (
    uploaded_by = (SELECT auth.uid())
    AND incident_id IN (
      SELECT id FROM public.incidents
      WHERE contract_machine_id IN (SELECT auth_client_contract_machine_ids())
    )
  );

-- Técnico: ve las fotos de las incidencias que tiene asignadas.
-- Reutiliza auth_tech_incident_ids() (igual que tech_incident_parts_select/_history_select).
CREATE POLICY "tech_incident_photos_select" ON public.incident_photos
  FOR SELECT TO authenticated
  USING (
    incident_id IN (SELECT auth_tech_incident_ids())
  );

COMMIT;
