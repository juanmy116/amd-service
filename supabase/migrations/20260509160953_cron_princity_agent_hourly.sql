
-- NOTA HISTÓRICA: este cron y la edge function 'princity-agent' fueron retirados
-- en sesión 5 (2026-05-13) cuando se migró a integración Princity API REST.
-- Se conserva el archivo para preservar el historial de migraciones.
-- La JWT original fue sanitizada — no es necesario reintroducirla al replay.
SELECT cron.schedule(
  'princity-agent-hourly',
  '0 * * * *',
  $$
  SELECT net.http_post(
    url     := 'https://myyejbviunyvywfukysj.supabase.co/functions/v1/princity-agent',
    headers := jsonb_build_object(
      'Content-Type',  'application/json',
      'Authorization', 'Bearer <SERVICE_ROLE_KEY_REDACTED>'
    ),
    body    := '{}'::jsonb
  );
  $$
);
