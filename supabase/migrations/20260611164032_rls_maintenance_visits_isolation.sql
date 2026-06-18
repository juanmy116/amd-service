-- Tarea 7: aislamiento RLS de maintenance_visits.
-- Antes `tech_read_visits`/`tech_update_visits` filtraban SOLO por rol técnico
-- (EXISTS profiles role='technician') → cualquier técnico veía/editaba las visitas
-- de otro. Igual que incidents, deben restringirse al técnico responsable.
--
-- Regla acordada: un técnico ve "las suyas + las de sus máquinas":
--   (a) visitas asignadas a él (`assigned_to = auth.uid()`), o
--   (b) visitas de una máquina donde tiene trabajo asignado
--       (`auth_tech_assigned_machine_ids()`, cruzando contract_machine_id).
-- Esto cubre el flujo de scan: el dispatcher (atelier) asigna la visita al técnico,
-- o el técnico ya tiene una incidencia asignada en esa máquina.
--
-- `admin_all_visits` (admin/dispatcher) NO se toca. La función helper resuelve además
-- el aviso auth_rls_initplan (auth.uid() se evalúa una vez).

-- Helper: IDs de visitas visibles para el técnico autenticado.
CREATE OR REPLACE FUNCTION public.auth_tech_visit_ids() RETURNS SETOF uuid
LANGUAGE sql SECURITY DEFINER STABLE
SET search_path = public, pg_catalog
AS $$
  SELECT mv.id FROM public.maintenance_visits mv
  WHERE mv.assigned_to = auth.uid()
     OR mv.contract_machine_id IN (
       SELECT cm.id FROM public.contract_machines cm
       WHERE cm.machine_id IN (SELECT public.auth_tech_assigned_machine_ids())
     );
$$;

REVOKE EXECUTE ON FUNCTION public.auth_tech_visit_ids() FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.auth_tech_visit_ids() TO service_role, authenticated;

-- Reescritura de las policies del técnico.
DROP POLICY IF EXISTS tech_read_visits ON public.maintenance_visits;
CREATE POLICY tech_read_visits ON public.maintenance_visits
  FOR SELECT TO authenticated
  USING (id IN (SELECT public.auth_tech_visit_ids()));

DROP POLICY IF EXISTS tech_update_visits ON public.maintenance_visits;
CREATE POLICY tech_update_visits ON public.maintenance_visits
  FOR UPDATE TO authenticated
  USING (id IN (SELECT public.auth_tech_visit_ids()));
