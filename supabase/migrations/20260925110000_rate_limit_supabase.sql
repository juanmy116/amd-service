-- Limitador de intentos en Supabase (2026-09-25). Sustituye a Upstash.
-- El 2026-09-14 la base gratuita de Upstash se borró por inactividad y las 8 puertas públicas
-- (login, signup, verify, csat, contacto, formulario del QR y su foto) quedaron sin freno.
-- Aquí la libreta vive en nuestra propia base: no depende de otro proveedor ni caduca.

BEGIN;

-- 1. La libreta: un apunte por intento aceptado. `bucket` = la puerta (login, contact...);
--    `identifier` = quién llama (IP, IP:email...). Se guarda unas horas y se purga (paso 3).
CREATE TABLE public.rate_limit_hits (
  id         bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  bucket     text        NOT NULL,
  identifier text        NOT NULL,
  hit_at     timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX rate_limit_hits_lookup_idx ON public.rate_limit_hits (bucket, identifier, hit_at);
CREATE INDEX rate_limit_hits_hit_at_idx ON public.rate_limit_hits (hit_at);

-- Interna: contiene IPs y emails. Sin políticas ⇒ nadie la lee salvo service_role.
-- Los privilegios por defecto de prod dan ALL a anon/authenticated en tablas nuevas; se retiran.
ALTER TABLE public.rate_limit_hits ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.rate_limit_hits FROM anon, authenticated;

-- 2. El portero: ventana deslizante. Cuenta los apuntes de la ventana; si hay cupo apunta uno y
--    deja pasar, si no, deniega SIN apuntar (como hacía Upstash). El candado consultivo serializa
--    las peticiones simultáneas del mismo (bucket, identifier): sin él, 10 intentos a la vez
--    leerían el mismo recuento y pasarían todos.
--    Solo service_role puede llamarla: si la tuviera anon, cualquiera con la clave pública
--    podría llenar el cupo de otro (p. ej. con la IP:email de un usuario) y dejarlo fuera.
CREATE FUNCTION public.check_rate_limit(
  p_bucket         text,
  p_identifier     text,
  p_limit          int,
  p_window_seconds int
) RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_count int;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtextextended(p_bucket || ':' || p_identifier, 0));

  SELECT count(*) INTO v_count
    FROM public.rate_limit_hits
   WHERE bucket = p_bucket
     AND identifier = p_identifier
     AND hit_at > now() - make_interval(secs => p_window_seconds);

  IF v_count >= p_limit THEN
    RETURN false;
  END IF;

  INSERT INTO public.rate_limit_hits (bucket, identifier) VALUES (p_bucket, p_identifier);
  RETURN true;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.check_rate_limit(text, text, int, int) FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.check_rate_limit(text, text, int, int) TO service_role;

-- 3. Limpieza cada hora. La ventana más larga es de 24 h: todo lo anterior ya no cuenta.
--    Idempotente.
SELECT cron.unschedule('rate-limit-purge') WHERE EXISTS (
  SELECT 1 FROM cron.job WHERE jobname = 'rate-limit-purge'
);
SELECT cron.schedule(
  'rate-limit-purge',
  '17 * * * *',
  $$ DELETE FROM public.rate_limit_hits WHERE hit_at < now() - interval '25 hours' $$
);

COMMIT;
