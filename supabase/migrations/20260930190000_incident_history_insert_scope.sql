-- HISTORIAL DE AVERÍAS — el técnico solo escribe en el historial de SUS averías (2026-09-30).
--
-- Problema: `authenticated` tiene INSERT sobre `incident_history` (20260508204858) y la única
-- policy de escritura que no es de admin, `tech_incident_history_insert` (última versión en
-- 20260611163629), solo exigía `changed_by = auth.uid()`. No miraba de qué avería era la línea
-- ni quién la escribía: cualquier usuario con sesión —un cliente del portal, o un técnico al que
-- ya le quitaron la avería— podía colar por PostgREST cambios de estado o comentarios inventados
-- en el historial de CUALQUIER avería cuyo id conociera. Ese historial es lo que mira la oficina
-- cuando un cliente reclama.
--
-- Solución: la misma regla que ya rige para leer ese historial (`tech_incident_history_select`)
-- y para escribir piezas (`tech_incident_parts_insert`): la avería tiene que estar asignada a
-- quien escribe (`auth_tech_incident_ids()`), y además quien escribe tiene que ser técnico.
--
-- Quién sigue pudiendo escribir, sin cambios:
--   · El técnico asignado desde su ficha (`tech/incidents/[id]/actions.ts`): la acción ya
--     comprueba `assigned_to = user.id` antes de escribir y el UPDATE mantiene la asignación.
--   · La oficina: `admin_all_incident_history` (is_admin()) no se toca.
--   · Kiosko, escaneo QR y encuesta CSAT escriben con service_role, que ignora la RLS.
--
-- Semántica de `changed_by` idéntica; se conserva la envoltura (SELECT auth.uid()) (initplan).

BEGIN;

DROP POLICY IF EXISTS tech_incident_history_insert ON public.incident_history;
CREATE POLICY tech_incident_history_insert ON public.incident_history
  FOR INSERT TO authenticated
  WITH CHECK (
    changed_by = (SELECT auth.uid())
    AND incident_id IN (SELECT auth_tech_incident_ids())
    AND EXISTS (SELECT 1 FROM profiles WHERE profiles.id = (SELECT auth.uid()) AND profiles.role = 'technician'::user_role)
  );

COMMIT;
