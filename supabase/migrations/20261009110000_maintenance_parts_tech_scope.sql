-- F8 (escaneo de seguridad 2026-09-29): piezas de mantenimiento y planes aislados por técnico.
--
-- `tech_read_parts`, `tech_insert_parts` y `tech_read_plans` solo comprobaban el rol: cualquier
-- técnico leía las piezas de todas las visitas, podía añadirlas a cualquiera (falseando
-- `v_machine_parts_history`, la base de rendimiento de piezas y el agente de anomalías) y leía
-- todos los planes. Ahora usan el mismo alcance que sus visitas, `auth_tech_visit_ids()`
-- (asignadas a él o de máquinas donde tiene trabajo), que desde F2 (20261009100000) el técnico
-- ya no puede ampliar.
--
-- La app no usa estas tablas con la sesión del técnico: cierra las visitas con la RPC
-- `close_maintenance_visit` (service_role) y lee los planes con service_role.
--
-- Deshacer: docs/rollback-2026-10-09-f8.md

DROP POLICY IF EXISTS tech_read_parts ON public.maintenance_parts;
CREATE POLICY tech_read_parts ON public.maintenance_parts
  FOR SELECT TO authenticated
  USING (
    EXISTS (SELECT 1 FROM profiles WHERE profiles.id = (SELECT auth.uid()) AND profiles.role = 'technician'::user_role)
    AND visit_id IN (SELECT public.auth_tech_visit_ids())
  );

DROP POLICY IF EXISTS tech_insert_parts ON public.maintenance_parts;
CREATE POLICY tech_insert_parts ON public.maintenance_parts
  FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (SELECT 1 FROM profiles WHERE profiles.id = (SELECT auth.uid()) AND profiles.role = 'technician'::user_role)
    AND visit_id IN (SELECT public.auth_tech_visit_ids())
  );

DROP POLICY IF EXISTS tech_read_plans ON public.maintenance_plans;
CREATE POLICY tech_read_plans ON public.maintenance_plans
  FOR SELECT TO authenticated
  USING (
    EXISTS (SELECT 1 FROM profiles WHERE profiles.id = (SELECT auth.uid()) AND profiles.role = 'technician'::user_role)
    AND id IN (
      SELECT mv.plan_id FROM public.maintenance_visits mv
      WHERE mv.id IN (SELECT public.auth_tech_visit_ids())
    )
  );
