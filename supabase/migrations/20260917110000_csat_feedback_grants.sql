-- Permisos de la vista v_csat_feedback (creada en 20260917100000_csat_feedback.sql).
--
-- Por qué existe esta migración aparte: la que creó la vista ya está aplicada en producción y no
-- se toca. Allí faltaron los GRANT/REVOKE, así que la vista funciona hoy solo porque heredó los
-- privilegios por defecto de Supabase — que incluyen a `anon`, justo lo que 20260508200855
-- revocó a mano en todas las tablas. Y en una base limpia (`supabase db reset`) esos defaults no
-- tienen por qué estar, con lo que /admin/avis fallaría con «permission denied».
--
-- Mismo patrón que las demás vistas del repo (v_machine_park en 20260608120000): nada para anon,
-- SELECT para authenticated (la RLS de csat_responses, admin-only, es la que filtra de verdad —
-- la vista es security_invoker) y para service_role.
-- Idempotente: REVOKE/GRANT se pueden repetir sin efecto adicional.

REVOKE ALL ON public.v_csat_feedback FROM PUBLIC, anon;
GRANT SELECT ON public.v_csat_feedback TO authenticated, service_role;
