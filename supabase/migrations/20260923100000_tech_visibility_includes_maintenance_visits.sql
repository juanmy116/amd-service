-- 2026-09-23 — Las visitas de mantenimiento cuentan como «trabajo asignado» para la RLS del técnico.
--
-- Problema: la visibilidad del técnico sobre `contract_machines`, `machines`, `contracts` y
-- `clients` se derivaba SOLO de las incidencias asignadas a él. Un técnico con una visita de
-- mantenimiento asignada en una máquina donde no tiene ninguna avería veía la visita
-- (`auth_tech_visit_ids()`, rama `assigned_to`) pero no su línea, máquina, contrato ni
-- cliente ⇒ `/tech/planning` y la agenda (`components/tech/AgendaPanel.tsx`), que leen
-- visita → contract_machines → machines/contracts/clients con el cliente del usuario,
-- pintaban «—» y enlazaban a `/tech` en vez de a la ficha.
--
-- Solución: añadir a cada función una rama UNION con las visitas asignadas al técnico
-- (`maintenance_visits.assigned_to = auth.uid()`). La rama de incidencias queda IDÉNTICA.
--   * auth_tech_contract_machine_ids()   → + líneas de sus visitas
--   * auth_tech_incident_contract_ids()  → + contratos de esas líneas
--   * auth_tech_assigned_client_ids()    → + clientes de esos contratos
--   * auth_tech_assigned_machine_ids()   NO se toca: deriva de auth_tech_contract_machine_ids()
--     (policy `tech_machines_select`), así que hereda la nueva rama sola.
--
-- Consecuencia buscada (y aceptada): como `auth_tech_visit_ids()` incluye «visitas de sus
-- máquinas» vía auth_tech_assigned_machine_ids(), un técnico con una visita en una máquina ve
-- también las demás visitas de esa máquina — la misma regla que ya regía con las incidencias.
--
-- Sin recursión: las ramas nuevas leen `maintenance_visits` / `contract_machines` / `contracts`
-- DIRECTAMENTE dentro de funciones SECURITY DEFINER (el owner salta la RLS) y NO llaman a
-- auth_tech_visit_ids() (que a su vez llama a auth_tech_assigned_machine_ids()).
--
-- Firmas, LANGUAGE, STABLE, SECURITY DEFINER y search_path se mantienen EXACTAMENTE como en su
-- última definición (20260603120559 para la primera, 20260605000000 para las otras dos).
-- CREATE OR REPLACE conserva el ACL; solo la primera tenía grants explícitos y se re-aplican
-- igual para que la migración sea autocontenida (las otras dos nunca los tuvieron: no se tocan).

BEGIN;

CREATE OR REPLACE FUNCTION public.auth_tech_contract_machine_ids() RETURNS SETOF uuid
LANGUAGE sql SECURITY DEFINER STABLE
SET search_path = public, pg_catalog
AS $$
  -- Líneas de las incidencias asignadas al técnico (sin cambios)
  SELECT DISTINCT i.contract_machine_id FROM public.incidents i
  WHERE i.assigned_to = auth.uid()
    AND i.contract_machine_id IS NOT NULL
  UNION
  -- Líneas de las visitas de mantenimiento asignadas al técnico
  SELECT mv.contract_machine_id FROM public.maintenance_visits mv
  WHERE mv.assigned_to = auth.uid()
    AND mv.contract_machine_id IS NOT NULL;
$$;

REVOKE EXECUTE ON FUNCTION public.auth_tech_contract_machine_ids() FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.auth_tech_contract_machine_ids() TO service_role, authenticated;

CREATE OR REPLACE FUNCTION public.auth_tech_incident_contract_ids()
RETURNS SETOF uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$
  -- Contratos de las incidencias asignadas al técnico (sin cambios)
  SELECT DISTINCT cm.contract_id FROM incidents i
  JOIN contract_machines cm ON cm.id = i.contract_machine_id
  WHERE i.assigned_to = auth.uid()
  UNION
  -- Contratos de las líneas de sus visitas de mantenimiento
  SELECT cm.contract_id FROM maintenance_visits mv
  JOIN contract_machines cm ON cm.id = mv.contract_machine_id
  WHERE mv.assigned_to = auth.uid();
$$;

CREATE OR REPLACE FUNCTION public.auth_tech_assigned_client_ids()
RETURNS SETOF integer LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$
  -- Clientes de las incidencias asignadas al técnico (sin cambios)
  SELECT DISTINCT c.client_id FROM incidents i
  JOIN contract_machines cm ON cm.id = i.contract_machine_id
  JOIN contracts c ON c.id = cm.contract_id
  WHERE i.assigned_to = auth.uid()
  UNION
  -- Clientes de los contratos de sus visitas de mantenimiento
  SELECT c.client_id FROM maintenance_visits mv
  JOIN contract_machines cm ON cm.id = mv.contract_machine_id
  JOIN contracts c ON c.id = cm.contract_id
  WHERE mv.assigned_to = auth.uid();
$$;

-- Las tres funciones filtran ahora por `maintenance_visits.assigned_to` (como ya hacía
-- auth_tech_visit_ids): mismo índice que `incidents_assigned_to_idx` para incidencias.
CREATE INDEX IF NOT EXISTS maintenance_visits_assigned_to_idx
  ON public.maintenance_visits (assigned_to);

COMMIT;
