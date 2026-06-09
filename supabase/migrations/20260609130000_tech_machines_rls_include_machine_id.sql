-- Fix B — El técnico no veía la máquina de una incidencia pública (machine_id directo):
--   * 404 al escanear el QR (/tech/scan/[serie]) — la RLS de `machines` bloqueaba el SELECT.
--   * Sección Machines del PWA vacía (/tech/machines) — gobernada por la misma policy.
--
-- Causa: `auth_tech_assigned_machine_ids()` (que alimenta la policy `tech_machines_select`)
-- solo derivaba máquinas vía `contract_machine_id`, ignorando las incidencias públicas
-- (machine_id directo, sin línea de contrato). La propia página de scan ya contempla ambos
-- tipos de incidencia; solo faltaba que la RLS de `machines` hiciera lo mismo.
--
-- Solución: añadir un UNION con las máquinas de las incidencias `machine_id` asignadas al
-- técnico. CREATE OR REPLACE → idempotente; la policy `tech_machines_select` no se toca.

BEGIN;

CREATE OR REPLACE FUNCTION public.auth_tech_assigned_machine_ids() RETURNS SETOF text
LANGUAGE sql SECURITY DEFINER STABLE
SET search_path = public, pg_catalog
AS $$
  -- Máquinas vía línea de contrato (incidencias internas: contract_machine_id)
  SELECT DISTINCT cm.machine_id
  FROM public.contract_machines cm
  WHERE cm.id IN (SELECT public.auth_tech_contract_machine_ids())
  UNION
  -- Máquinas vía incidencia pública (machine_id directo, sin línea de contrato)
  SELECT DISTINCT i.machine_id
  FROM public.incidents i
  WHERE i.assigned_to = auth.uid()
    AND i.machine_id IS NOT NULL;
$$;

-- Re-aplicar grants (CREATE OR REPLACE preserva el ACL, pero los dejamos explícitos
-- para que la migración sea autocontenida).
REVOKE EXECUTE ON FUNCTION public.auth_tech_assigned_machine_ids() FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.auth_tech_assigned_machine_ids() TO service_role, authenticated;

COMMIT;
