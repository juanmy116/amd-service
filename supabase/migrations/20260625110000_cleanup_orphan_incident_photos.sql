-- Limpieza programada de fotos huérfanas del bucket `incident-photos`.
-- El cliente sube la foto DIRECTO a Storage al abrir la incidencia; si abandona el formulario
-- sin enviarlo, el objeto queda sin fila en incident_photos. Un cron diario invoca la Edge
-- Function `cleanup-orphan-incident-photos`, que pide a esta RPC los nombres a borrar.

BEGIN;

-- pg_net (net.http_post) ya está habilitado por 20260509160039, pero lo reaseguramos para que
-- esta migración no dependa del orden en un entorno recreado (db reset / branch limpia).
CREATE EXTENSION IF NOT EXISTS pg_net;

-- Objetos del bucket sin fila en incident_photos y con > 24 h (no tocar subidas en curso).
-- SECURITY DEFINER para poder leer el schema `storage`; solo service_role la ejecuta.
CREATE OR REPLACE FUNCTION public.orphan_incident_photo_paths()
RETURNS SETOF text
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, storage, pg_catalog
AS $$
  SELECT o.name
  FROM storage.objects o
  WHERE o.bucket_id = 'incident-photos'
    AND o.created_at < now() - interval '24 hours'
    AND NOT EXISTS (
      SELECT 1 FROM public.incident_photos p WHERE p.storage_path = o.name
    );
$$;
REVOKE EXECUTE ON FUNCTION public.orphan_incident_photo_paths() FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.orphan_incident_photo_paths() TO service_role;

-- Cron diario a las 02:30 UTC (hora de bajo tráfico). Reprograma de forma idempotente.
SELECT cron.unschedule('cleanup-orphan-incident-photos') WHERE EXISTS (
  SELECT 1 FROM cron.job WHERE jobname = 'cleanup-orphan-incident-photos'
);

SELECT cron.schedule(
  'cleanup-orphan-incident-photos',
  '30 2 * * *',
  $$
  SELECT net.http_post(
    url     := 'https://myyejbviunyvywfukysj.supabase.co/functions/v1/cleanup-orphan-incident-photos',
    headers := '{"Content-Type": "application/json"}'::jsonb,
    body    := '{}'::jsonb
  ) AS request_id;
  $$
);

COMMIT;
