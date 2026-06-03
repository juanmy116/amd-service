-- Refactor contracts: 1 contrato = N máquinas
-- Spec: docs/superpowers/specs/2026-06-03-contracts-n-machines-design.md
-- NO toca las columnas viejas: contracts.machine_id, contracts.lieu_installation, incidents.contract_id.
-- Se borrarán en un PR-cleanup posterior (5-7 días después del merge).

BEGIN;

-- 1. Enum para el estado de la línea contract↔machine
CREATE TYPE contract_machine_status AS ENUM ('actif', 'suspendu', 'terminé');

-- 2. Tabla nueva
CREATE TABLE public.contract_machines (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  contract_id uuid NOT NULL REFERENCES public.contracts(id) ON DELETE CASCADE,
  machine_id text NOT NULL REFERENCES public.machines(numero_serie) ON DELETE RESTRICT,
  date_debut date NOT NULL,
  date_fin date NULL,
  statut contract_machine_status NOT NULL DEFAULT 'actif',
  billing_day_override smallint NULL CHECK (billing_day_override BETWEEN 1 AND 31),
  maintenance_frequency_override text NULL CHECK (maintenance_frequency_override IN ('mensuel', 'trimestriel')),
  notes text NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT contract_machines_date_fin_after_debut CHECK (date_fin IS NULL OR date_fin >= date_debut),
  CONSTRAINT contract_machines_termine_has_date_fin CHECK (statut <> 'terminé' OR date_fin IS NOT NULL)
);

-- Una máquina solo puede tener UNA línea sin date_fin (independiente del statut).
-- Una máquina suspendida sigue bloqueando la reasignación a otro contrato.
CREATE UNIQUE INDEX contract_machines_one_open_per_machine
  ON public.contract_machines (machine_id)
  WHERE date_fin IS NULL;

CREATE INDEX contract_machines_contract_id_idx ON public.contract_machines (contract_id);
CREATE INDEX contract_machines_machine_id_idx ON public.contract_machines (machine_id);

ALTER TABLE public.contract_machines ENABLE ROW LEVEL SECURITY;

-- 3. Añadir contracts.maintenance_frequency (default a nivel contrato)
ALTER TABLE public.contracts
  ADD COLUMN maintenance_frequency text NULL CHECK (maintenance_frequency IN ('mensuel', 'trimestriel'));

-- 4. Migrar datos del contrato existente
-- Cast explícito porque contracts.statut es contract_status y contract_machines.statut es contract_machine_status
-- (mismos valores de enum, pero PostgreSQL requiere cast explícito entre tipos distintos)
INSERT INTO public.contract_machines (contract_id, machine_id, date_debut, statut)
SELECT id, machine_id, date_debut, statut::text::contract_machine_status
FROM public.contracts
WHERE machine_id IS NOT NULL;

-- 5. Añadir contract_machine_id a incidents
ALTER TABLE public.incidents
  ADD COLUMN contract_machine_id uuid NULL REFERENCES public.contract_machines(id);

-- 5b. machine_id pasa a nullable para permitir el XOR (internas tendrán machine_id NULL)
ALTER TABLE public.incidents ALTER COLUMN machine_id DROP NOT NULL;

-- 6. Migrar incidencias internas (source IS DISTINCT FROM 'public')
UPDATE public.incidents AS i
SET contract_machine_id = cm.id
FROM public.contract_machines cm
WHERE i.contract_id = cm.contract_id
  AND i.machine_id = cm.machine_id
  AND i.source IS DISTINCT FROM 'public';

-- 7. Para las incidencias internas migradas, machine_id pasa a NULL
-- (la máquina se infiere ahora desde contract_machine_id → contract_machines.machine_id).
UPDATE public.incidents
SET machine_id = NULL
WHERE contract_machine_id IS NOT NULL;

-- 8. Validación dentro de la transacción
DO $$
DECLARE
  internal_incidents_without_link int;
  contracts_with_machine_id int;
  cm_rows int;
BEGIN
  SELECT COUNT(*) INTO internal_incidents_without_link
  FROM public.incidents
  WHERE source IS DISTINCT FROM 'public'
    AND contract_machine_id IS NULL;

  IF internal_incidents_without_link > 0 THEN
    RAISE EXCEPTION 'Migración abortada: % incidencias internas no encontraron su contract_machine', internal_incidents_without_link;
  END IF;

  SELECT COUNT(*) INTO contracts_with_machine_id FROM public.contracts WHERE machine_id IS NOT NULL;
  SELECT COUNT(*) INTO cm_rows FROM public.contract_machines;

  IF contracts_with_machine_id <> cm_rows THEN
    RAISE EXCEPTION 'Migración abortada: conteo no cuadra (% contracts viejos vs % líneas en contract_machines)', contracts_with_machine_id, cm_rows;
  END IF;
END $$;

-- 9. CHECK XOR en incidents: o contract_machine_id o machine_id, nunca ambos, nunca ninguno
ALTER TABLE public.incidents ADD CONSTRAINT incidents_contract_or_machine_xor
  CHECK ((contract_machine_id IS NULL) <> (machine_id IS NULL));

-- 10. Funciones SECURITY DEFINER nuevas
CREATE OR REPLACE FUNCTION public.auth_client_contract_machine_ids() RETURNS SETOF uuid
LANGUAGE sql SECURITY DEFINER STABLE
SET search_path = public, pg_catalog
AS $$
  SELECT cm.id FROM public.contract_machines cm
  WHERE cm.contract_id IN (SELECT public.auth_client_contract_ids());
$$;

CREATE OR REPLACE FUNCTION public.auth_tech_contract_machine_ids() RETURNS SETOF uuid
LANGUAGE sql SECURITY DEFINER STABLE
SET search_path = public, pg_catalog
AS $$
  SELECT DISTINCT i.contract_machine_id FROM public.incidents i
  WHERE i.assigned_to = auth.uid()
    AND i.contract_machine_id IS NOT NULL;
$$;

-- Sobrescribir auth_client_machine_ids() para derivar de contract_machines (activas)
CREATE OR REPLACE FUNCTION public.auth_client_machine_ids() RETURNS SETOF text
LANGUAGE sql SECURITY DEFINER STABLE
SET search_path = public, pg_catalog
AS $$
  SELECT DISTINCT cm.machine_id FROM public.contract_machines cm
  WHERE cm.contract_id IN (SELECT public.auth_client_contract_ids())
    AND cm.statut = 'actif'
    AND cm.date_fin IS NULL;
$$;

-- Helper para máquinas asignadas al técnico
CREATE OR REPLACE FUNCTION public.auth_tech_assigned_machine_ids() RETURNS SETOF text
LANGUAGE sql SECURITY DEFINER STABLE
SET search_path = public, pg_catalog
AS $$
  SELECT DISTINCT cm.machine_id FROM public.contract_machines cm
  WHERE cm.id IN (SELECT public.auth_tech_contract_machine_ids());
$$;

REVOKE EXECUTE ON FUNCTION public.auth_client_contract_machine_ids() FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.auth_client_contract_machine_ids() TO service_role, authenticated;

REVOKE EXECUTE ON FUNCTION public.auth_tech_contract_machine_ids() FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.auth_tech_contract_machine_ids() TO service_role, authenticated;

REVOKE EXECUTE ON FUNCTION public.auth_tech_assigned_machine_ids() FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.auth_tech_assigned_machine_ids() TO service_role, authenticated;

-- 11. RLS policies de contract_machines
CREATE POLICY admin_all_contract_machines ON public.contract_machines
  FOR ALL USING ((SELECT role FROM public.profiles WHERE id = auth.uid()) = 'admin');

CREATE POLICY client_own_contract_machines_select ON public.contract_machines
  FOR SELECT USING (id IN (SELECT public.auth_client_contract_machine_ids()));

CREATE POLICY tech_assigned_contract_machines_select ON public.contract_machines
  FOR SELECT USING (id IN (SELECT public.auth_tech_contract_machine_ids()));

-- 12. Actualizar políticas RLS de incidents
-- Las viejas usan contract_id; las nuevas usan contract_machine_id.

DROP POLICY IF EXISTS client_own_incidents_select ON public.incidents;
CREATE POLICY client_own_incidents_select ON public.incidents
  FOR SELECT USING (contract_machine_id IN (SELECT public.auth_client_contract_machine_ids()));

DROP POLICY IF EXISTS client_create_incidents ON public.incidents;
CREATE POLICY client_create_incidents ON public.incidents
  FOR INSERT WITH CHECK (contract_machine_id IN (SELECT public.auth_client_contract_machine_ids()));

-- Las políticas tech_assigned_incidents_* siguen filtrando por assigned_to = auth.uid(),
-- por lo que no requieren cambios.

COMMIT;
