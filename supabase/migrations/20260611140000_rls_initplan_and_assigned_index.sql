-- Tarea 9 (advisor de Supabase):
--  1) Índice en incidents.assigned_to — columna por la que filtran TODAS las
--     queries del técnico y su RLS; hoy no existe.
--  2) auth_rls_initplan — envolver auth.uid() en (SELECT auth.uid()) para que
--     se evalúe UNA vez por query (initplan) en lugar de por cada fila escaneada.
--     Se preserva la semántica EXACTA de cada policy (mismo cmd/roles/USING/CHECK),
--     solo cambia la envoltura de auth.uid().
--
-- Se reescriben 19 policies. Las dos tech_* de maintenance_visits NO se tocan aquí:
-- se rehacen con su nueva lógica de aislamiento en la migración de la Tarea 7.

-- ── 1) Índice ────────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS incidents_assigned_to_idx ON public.incidents (assigned_to);

-- ── 2) Reescritura de policies (DROP + CREATE, semántica idéntica) ────────────

-- client_profiles
DROP POLICY IF EXISTS client_own_profile_select ON public.client_profiles;
CREATE POLICY client_own_profile_select ON public.client_profiles
  FOR SELECT TO authenticated
  USING (profile_id = (SELECT auth.uid()));

-- clients
DROP POLICY IF EXISTS client_own_client_select ON public.clients;
CREATE POLICY client_own_client_select ON public.clients
  FOR SELECT TO authenticated
  USING (id IN (SELECT cp.client_id FROM client_profiles cp WHERE cp.profile_id = (SELECT auth.uid())));

-- contract_machines
DROP POLICY IF EXISTS admin_all_contract_machines ON public.contract_machines;
CREATE POLICY admin_all_contract_machines ON public.contract_machines
  FOR ALL TO public
  USING ((SELECT profiles.role FROM profiles WHERE profiles.id = (SELECT auth.uid())) = 'admin'::user_role);

-- incident_history
DROP POLICY IF EXISTS tech_incident_history_insert ON public.incident_history;
CREATE POLICY tech_incident_history_insert ON public.incident_history
  FOR INSERT TO authenticated
  WITH CHECK (changed_by = (SELECT auth.uid()));

-- incidents
DROP POLICY IF EXISTS tech_assigned_incidents_select ON public.incidents;
CREATE POLICY tech_assigned_incidents_select ON public.incidents
  FOR SELECT TO authenticated
  USING (assigned_to = (SELECT auth.uid()));

DROP POLICY IF EXISTS tech_assigned_incidents_update ON public.incidents;
CREATE POLICY tech_assigned_incidents_update ON public.incidents
  FOR UPDATE TO authenticated
  USING (assigned_to = (SELECT auth.uid()));

-- leads
DROP POLICY IF EXISTS admin_all_leads ON public.leads;
CREATE POLICY admin_all_leads ON public.leads
  FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles WHERE profiles.id = (SELECT auth.uid()) AND profiles.role = 'admin'::user_role))
  WITH CHECK (EXISTS (SELECT 1 FROM profiles WHERE profiles.id = (SELECT auth.uid()) AND profiles.role = 'admin'::user_role));

-- machine_counters
DROP POLICY IF EXISTS admins_machine_counters ON public.machine_counters;
CREATE POLICY admins_machine_counters ON public.machine_counters
  FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles WHERE profiles.id = (SELECT auth.uid()) AND profiles.role = 'admin'::user_role))
  WITH CHECK (EXISTS (SELECT 1 FROM profiles WHERE profiles.id = (SELECT auth.uid()) AND profiles.role = 'admin'::user_role));

-- maintenance_parts
DROP POLICY IF EXISTS admin_all_parts ON public.maintenance_parts;
CREATE POLICY admin_all_parts ON public.maintenance_parts
  FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles WHERE profiles.id = (SELECT auth.uid()) AND profiles.role = 'admin'::user_role));

DROP POLICY IF EXISTS tech_insert_parts ON public.maintenance_parts;
CREATE POLICY tech_insert_parts ON public.maintenance_parts
  FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM profiles WHERE profiles.id = (SELECT auth.uid()) AND profiles.role = 'technician'::user_role));

DROP POLICY IF EXISTS tech_read_parts ON public.maintenance_parts;
CREATE POLICY tech_read_parts ON public.maintenance_parts
  FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles WHERE profiles.id = (SELECT auth.uid()) AND profiles.role = 'technician'::user_role));

-- maintenance_plans
DROP POLICY IF EXISTS admin_all_plans ON public.maintenance_plans;
CREATE POLICY admin_all_plans ON public.maintenance_plans
  FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles WHERE profiles.id = (SELECT auth.uid()) AND profiles.role = 'admin'::user_role));

DROP POLICY IF EXISTS tech_read_plans ON public.maintenance_plans;
CREATE POLICY tech_read_plans ON public.maintenance_plans
  FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles WHERE profiles.id = (SELECT auth.uid()) AND profiles.role = 'technician'::user_role));

-- maintenance_visits (solo admin_all_visits; las tech_* se rehacen en la Tarea 7)
DROP POLICY IF EXISTS admin_all_visits ON public.maintenance_visits;
CREATE POLICY admin_all_visits ON public.maintenance_visits
  FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles WHERE profiles.id = (SELECT auth.uid()) AND profiles.role = 'admin'::user_role));

-- princity_api_logs
DROP POLICY IF EXISTS "admins pueden leer logs" ON public.princity_api_logs;
CREATE POLICY "admins pueden leer logs" ON public.princity_api_logs
  FOR SELECT TO public
  USING (EXISTS (SELECT 1 FROM profiles WHERE profiles.id = (SELECT auth.uid()) AND profiles.role = 'admin'::user_role));

-- princity_health
DROP POLICY IF EXISTS "admins pueden leer health" ON public.princity_health;
CREATE POLICY "admins pueden leer health" ON public.princity_health
  FOR SELECT TO public
  USING (EXISTS (SELECT 1 FROM profiles WHERE profiles.id = (SELECT auth.uid()) AND profiles.role = 'admin'::user_role));

-- profiles
DROP POLICY IF EXISTS admin_read_all_profiles ON public.profiles;
CREATE POLICY admin_read_all_profiles ON public.profiles
  FOR SELECT TO authenticated
  USING (is_admin() OR (SELECT auth.uid()) = id);

DROP POLICY IF EXISTS users_select_own_profile ON public.profiles;
CREATE POLICY users_select_own_profile ON public.profiles
  FOR SELECT TO authenticated
  USING ((SELECT auth.uid()) = id);

DROP POLICY IF EXISTS users_update_own_profile ON public.profiles;
CREATE POLICY users_update_own_profile ON public.profiles
  FOR UPDATE TO authenticated
  USING ((SELECT auth.uid()) = id)
  WITH CHECK ((SELECT auth.uid()) = id);
