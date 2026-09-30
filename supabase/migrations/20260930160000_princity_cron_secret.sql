-- Secreto de los crons de Princity (2026-09-30).
-- princity-alerts, princity-counters y princity-watchdog se despliegan con verify_jwt:false y no
-- comprobaban quién las llamaba: cualquiera podía dispararlas desde internet sin límite
-- (invocaciones, cuota de la API Princity con la clave de AMD, avisos duplicados por Matrix y
-- email). Ahora exigen la cabecera `x-cron-secret` (= PRINCITY_CRON_SECRET de las Edge Functions,
-- ver `_shared/princity-cron-auth.ts`). Esta migración hace que sus crons la envíen.
--
-- Orden de despliegue (si se invierte, los crons reciben 401 y el watchdog tampoco avisa):
--   1. supabase secrets set PRINCITY_CRON_SECRET=<secreto>
--   2. Vault en prod (SQL Editor de Supabase):
--        select vault.create_secret('https://myyejbviunyvywfukysj.supabase.co/functions/v1', 'princity_functions_url');
--        select vault.create_secret('<el mismo secreto del paso 1>', 'princity_cron_secret');
--   3. supabase db push (esta migración)
--   4. Desplegar princity-alerts, princity-counters y princity-watchdog con --no-verify-jwt
-- Comprobar después: SELECT jobname, schedule, command FROM cron.job WHERE command LIKE '%princity%';

BEGIN;

CREATE EXTENSION IF NOT EXISTS pg_net;

-- 1. La llamada del cron. URL y secreto viven en Vault y se leen en cada ejecución: el secreto
--    nunca queda escrito en cron.job y ningún entorno de pruebas llama a producción. Sin ellos
--    falla con error explícito (visible en cron.job_run_details) en vez de llamar sin secreto.
--    Solo acepta las tres funciones que exigen el secreto.
CREATE OR REPLACE FUNCTION public.invoke_princity_cron(p_function text) RETURNS bigint
LANGUAGE plpgsql
SET search_path = ''
AS $$
DECLARE
  v_url    text;
  v_secret text;
BEGIN
  IF p_function IS NULL OR p_function NOT IN ('princity-alerts', 'princity-counters', 'princity-watchdog') THEN
    RAISE EXCEPTION 'unknown_princity_function';
  END IF;

  SELECT decrypted_secret INTO v_url    FROM vault.decrypted_secrets WHERE name = 'princity_functions_url';
  SELECT decrypted_secret INTO v_secret FROM vault.decrypted_secrets WHERE name = 'princity_cron_secret';
  IF coalesce(v_url, '') = '' OR coalesce(v_secret, '') = '' THEN
    RAISE EXCEPTION 'princity_cron_vault_missing';
  END IF;

  RETURN net.http_post(
    url     := rtrim(v_url, '/') || '/' || p_function,
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-cron-secret', v_secret),
    body    := '{}'::jsonb
  );
END;
$$;
REVOKE EXECUTE ON FUNCTION public.invoke_princity_cron(text) FROM PUBLIC, anon, authenticated;

-- 2. Los crons de estas tres funciones se crearon a mano en prod (no están en migraciones). Se
--    localizan por la URL de la función en su comando y solo se reescribe el comando: nombre y
--    horario se conservan. En CI/local no hay ninguno (solo el aviso).
DO $$
DECLARE
  v_fn  text;
  v_job record;
  v_n   int;
BEGIN
  FOREACH v_fn IN ARRAY ARRAY['princity-alerts', 'princity-counters', 'princity-watchdog'] LOOP
    v_n := 0;
    FOR v_job IN
      SELECT jobid, jobname FROM cron.job WHERE command LIKE ('%/functions/v1/' || v_fn || '%')
    LOOP
      PERFORM cron.alter_job(v_job.jobid, command := format('SELECT public.invoke_princity_cron(%L);', v_fn));
      RAISE NOTICE 'cron % (%) → invoke_princity_cron(%)', v_job.jobname, v_job.jobid, v_fn;
      v_n := v_n + 1;
    END LOOP;
    IF v_n = 0 THEN
      RAISE WARNING 'Ningún cron llama a %: programarlo con SELECT public.invoke_princity_cron(''%'');', v_fn, v_fn;
    END IF;
  END LOOP;
END;
$$;

COMMIT;
