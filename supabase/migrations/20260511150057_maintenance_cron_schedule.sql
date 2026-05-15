
CREATE EXTENSION IF NOT EXISTS pg_net;

-- Eliminar si ya existe para evitar duplicados
SELECT cron.unschedule('maintenance-daily-check') WHERE EXISTS (
  SELECT 1 FROM cron.job WHERE jobname = 'maintenance-daily-check'
);

-- Programar cron diario a las 8h UTC (= 8h Dakar)
SELECT cron.schedule(
  'maintenance-daily-check',
  '0 8 * * *',
  $$
  SELECT net.http_post(
    url     := 'https://myyejbviunyvywfukysj.supabase.co/functions/v1/maintenance-cron',
    headers := '{"Content-Type": "application/json"}'::jsonb,
    body    := '{}'::jsonb
  ) AS request_id;
  $$
);
