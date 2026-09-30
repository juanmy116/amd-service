-- maintenance-cron exige ahora la cabecera `x-cron-secret`: antes respondía a cualquiera desde
-- Internet con service_role (UPDATE de maintenance_visits + avisos Matrix). Se reprograma el cron
-- diario para que la envíe, leyendo el secreto de Vault `maintenance_cron_secret` (mismo valor
-- que el secret MAINTENANCE_CRON_SECRET de la Edge Function). Se crea a mano en prod:
--   select vault.create_secret('<secreto>', 'maintenance_cron_secret');
-- Sin el secreto en Vault (CI, local, o antes de crearlo en prod) no se llama a la función y el
-- job queda en error en cron.job_run_details: nada se pierde en silencio.

-- Eliminar el job anterior (llamaba sin cabecera)
SELECT cron.unschedule('maintenance-daily-check') WHERE EXISTS (
  SELECT 1 FROM cron.job WHERE jobname = 'maintenance-daily-check'
);

-- Mismo horario: diario a las 8h UTC (= 8h Dakar)
SELECT cron.schedule(
  'maintenance-daily-check',
  '0 8 * * *',
  $$
  DO $job$
  DECLARE
    v_secret text;
  BEGIN
    SELECT decrypted_secret INTO v_secret FROM vault.decrypted_secrets WHERE name = 'maintenance_cron_secret';
    IF v_secret IS NULL THEN
      RAISE EXCEPTION 'maintenance-daily-check: falta el secreto maintenance_cron_secret en Vault';
    END IF;
    PERFORM net.http_post(
      url     := 'https://myyejbviunyvywfukysj.supabase.co/functions/v1/maintenance-cron',
      headers := jsonb_build_object('Content-Type', 'application/json', 'x-cron-secret', v_secret),
      body    := '{}'::jsonb
    );
  END
  $job$;
  $$
);
