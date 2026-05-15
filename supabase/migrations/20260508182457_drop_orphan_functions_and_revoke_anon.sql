
-- Revocar acceso anon antes de borrar (por si acaso)
REVOKE EXECUTE ON FUNCTION public.get_pending_campaign_emails() FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.create_campaign_and_enqueue(text, text, text, text, integer) FROM anon, authenticated;

-- Borrar las 3 funciones huérfanas
DROP FUNCTION IF EXISTS public.fn_calculer_compteurs_mensuels() CASCADE;
DROP FUNCTION IF EXISTS public.get_pending_campaign_emails() CASCADE;
DROP FUNCTION IF EXISTS public.create_campaign_and_enqueue(text, text, text, text, integer) CASCADE;
