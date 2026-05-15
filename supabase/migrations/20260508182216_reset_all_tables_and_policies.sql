
-- Borrar todas las tablas (CASCADE elimina FKs y políticas asociadas)
DROP TABLE IF EXISTS public.campaign_clicks CASCADE;
DROP TABLE IF EXISTS public.campaign_emails CASCADE;
DROP TABLE IF EXISTS public.campaigns CASCADE;
DROP TABLE IF EXISTS public.dataleads CASCADE;
DROP TABLE IF EXISTS public."landing-leads-01" CASCADE;
DROP TABLE IF EXISTS public.compteurs_mensuels CASCADE;
DROP TABLE IF EXISTS public.compteurs_totaux CASCADE;
DROP TABLE IF EXISTS public.contrats CASCADE;
DROP TABLE IF EXISTS public.machines CASCADE;
DROP TABLE IF EXISTS public.clients CASCADE;

-- Borrar enums personalizados
DROP TYPE IF EXISTS public.pays CASCADE;
