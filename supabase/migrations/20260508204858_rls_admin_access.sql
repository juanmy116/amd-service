
-- Función helper: comprueba si el usuario es admin
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid() AND role = 'admin'
  );
$$;

-- profiles: admin ve todos los perfiles (para asignar técnicos)
CREATE POLICY "admin_read_all_profiles"
ON public.profiles FOR SELECT TO authenticated
USING (public.is_admin() OR auth.uid() = id);

-- clients
GRANT SELECT, INSERT, UPDATE, DELETE ON public.clients TO authenticated;
CREATE POLICY "admin_all_clients"
ON public.clients FOR ALL TO authenticated
USING (public.is_admin()) WITH CHECK (public.is_admin());

-- machines
GRANT SELECT, INSERT, UPDATE, DELETE ON public.machines TO authenticated;
CREATE POLICY "admin_all_machines"
ON public.machines FOR ALL TO authenticated
USING (public.is_admin()) WITH CHECK (public.is_admin());

-- contracts
GRANT SELECT, INSERT, UPDATE, DELETE ON public.contracts TO authenticated;
CREATE POLICY "admin_all_contracts"
ON public.contracts FOR ALL TO authenticated
USING (public.is_admin()) WITH CHECK (public.is_admin());

-- incidents
GRANT SELECT, INSERT, UPDATE, DELETE ON public.incidents TO authenticated;
CREATE POLICY "admin_all_incidents"
ON public.incidents FOR ALL TO authenticated
USING (public.is_admin()) WITH CHECK (public.is_admin());

-- parts (lectura para todos los autenticados)
GRANT SELECT ON public.parts TO authenticated;
CREATE POLICY "authenticated_read_parts"
ON public.parts FOR SELECT TO authenticated USING (true);

-- incident_parts
GRANT SELECT, INSERT, DELETE ON public.incident_parts TO authenticated;
CREATE POLICY "admin_all_incident_parts"
ON public.incident_parts FOR ALL TO authenticated
USING (public.is_admin()) WITH CHECK (public.is_admin());

-- incident_photos
GRANT SELECT, INSERT ON public.incident_photos TO authenticated;
CREATE POLICY "admin_all_incident_photos"
ON public.incident_photos FOR ALL TO authenticated
USING (public.is_admin()) WITH CHECK (public.is_admin());

-- incident_history
GRANT SELECT, INSERT ON public.incident_history TO authenticated;
CREATE POLICY "admin_all_incident_history"
ON public.incident_history FOR ALL TO authenticated
USING (public.is_admin()) WITH CHECK (public.is_admin());

-- csat_responses
GRANT SELECT ON public.csat_responses TO authenticated;
CREATE POLICY "admin_read_csat"
ON public.csat_responses FOR SELECT TO authenticated
USING (public.is_admin());

-- princity_alerts
GRANT SELECT, INSERT, UPDATE ON public.princity_alerts TO authenticated;
CREATE POLICY "admin_all_princity_alerts"
ON public.princity_alerts FOR ALL TO authenticated
USING (public.is_admin()) WITH CHECK (public.is_admin());

-- client_profiles
GRANT SELECT, INSERT, DELETE ON public.client_profiles TO authenticated;
CREATE POLICY "admin_all_client_profiles"
ON public.client_profiles FOR ALL TO authenticated
USING (public.is_admin()) WITH CHECK (public.is_admin());
