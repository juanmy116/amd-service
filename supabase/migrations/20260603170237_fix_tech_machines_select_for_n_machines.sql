-- Fix tech_machines_select policy to use the new auth_tech_assigned_machine_ids() helper
-- introduced in the contracts N machines refactor.
-- The legacy auth_tech_incident_machine_ids() function reads incidents.machine_id, which is
-- now NULL for internal incidents (post-refactor), making machines invisible to assigned techs.

BEGIN;

DROP POLICY IF EXISTS tech_machines_select ON public.machines;
CREATE POLICY tech_machines_select ON public.machines
  FOR SELECT
  USING (numero_serie IN (SELECT public.auth_tech_assigned_machine_ids()));

COMMIT;
