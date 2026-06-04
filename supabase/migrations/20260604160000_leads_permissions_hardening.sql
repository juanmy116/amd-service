-- Hardening de permisos de la tabla leads.
-- El insert público se hace con service_role (no anon). anon no debe acceder a leads.
-- Se añade WITH CHECK a la política admin para consistencia con el resto de tablas.

REVOKE ALL ON public.leads FROM anon;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.leads TO authenticated;

DROP POLICY IF EXISTS "admin_all_leads" ON leads;
CREATE POLICY "admin_all_leads" ON leads FOR ALL TO authenticated
USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'))
WITH CHECK (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'));
