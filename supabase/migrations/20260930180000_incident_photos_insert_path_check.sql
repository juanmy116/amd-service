-- La policy de INSERT del cliente en incident_photos pasa a validar también `storage_path`.
-- Antes solo exigía `uploaded_by = auth.uid()` y que la incidencia fuera suya: un cliente, con su
-- propia sesión y la anon key, podía insertar DIRECTAMENTE por la API de datos (sin pasar por
-- createPortalIncidentAction y su `startsWith`) una fila con la ruta del objeto de OTRO inquilino
-- (o con `../`), y IncidentPhotos la firmaba luego con service_role y le devolvía la URL.
-- Ahora la ruta tiene que ser exactamente la que genera createIncidentPhotoUploadUrl para su propio
-- usuario: `incidents/<auth.uid()>/<año>/<mes>/<sha256>.<jpeg|png|webp>`.
-- El admin no cambia (admin_all_incident_photos) y el formulario público inserta con service_role.

BEGIN;

DROP POLICY IF EXISTS "client_incident_photos_insert" ON public.incident_photos;
CREATE POLICY "client_incident_photos_insert" ON public.incident_photos
  FOR INSERT TO authenticated
  WITH CHECK (
    uploaded_by = (SELECT auth.uid())
    AND storage_path ~ (
      '^incidents/' || (SELECT auth.uid())::text
      || '/[0-9]{4}/[0-9]{2}/[0-9a-f]{64}\.(jpeg|png|webp)$'
    )
    AND incident_id IN (
      SELECT id FROM public.incidents
      WHERE contract_machine_id IN (SELECT auth_client_contract_machine_ids())
    )
  );

COMMIT;
