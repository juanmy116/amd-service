-- WP-1 Tarea 1.2 — Cerrar auto-vinculación cross-tenant vía client_profiles
-- La policy client_own_profile_insert solo validaba profile_id = auth.uid(), no client_id.
-- Un autenticado podía insertarse un vínculo a CUALQUIER empresa por la API REST,
-- saltándose verifyContractAction. La única vía legítima de vinculación pasa ahora por
-- service_role (portal verify), por lo que se elimina la policy de INSERT y se revoca
-- el privilegio a authenticated.
DROP POLICY IF EXISTS "client_own_profile_insert" ON public.client_profiles;
REVOKE INSERT ON public.client_profiles FROM authenticated;
-- SELECT/DELETE de la propia fila se conservan; admin_all_client_profiles intacta.
