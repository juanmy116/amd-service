
-- Revocar acceso anon antes de borrar (por si acaso). Estas funciones eran legacy
-- (existían en la BD original, no las crea ninguna migración) → en una reconstrucción
-- limpia no existen y un REVOKE directo abortaría. Se hace condicional con to_regprocedure
-- (NULL si la función no existe) para que la cadena de migraciones sea reproducible.
DO $$
BEGIN
  IF to_regprocedure('public.get_pending_campaign_emails()') IS NOT NULL THEN
    REVOKE EXECUTE ON FUNCTION public.get_pending_campaign_emails() FROM anon, authenticated;
  END IF;
  IF to_regprocedure('public.create_campaign_and_enqueue(text, text, text, text, integer)') IS NOT NULL THEN
    REVOKE EXECUTE ON FUNCTION public.create_campaign_and_enqueue(text, text, text, text, integer) FROM anon, authenticated;
  END IF;
END $$;

-- Borrar las 3 funciones huérfanas
DROP FUNCTION IF EXISTS public.fn_calculer_compteurs_mensuels() CASCADE;
DROP FUNCTION IF EXISTS public.get_pending_campaign_emails() CASCADE;
DROP FUNCTION IF EXISTS public.create_campaign_and_enqueue(text, text, text, text, integer) CASCADE;
