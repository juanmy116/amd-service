-- ROLLBACK del refactor contracts N machines.
-- NO se ejecuta automáticamente. Aplicar manualmente vía MCP execute_sql o supabase db push
-- SOLO en caso de emergencia tras descubrir un bug post-merge.
-- Limitación conocida: si un contrato tiene varias líneas (rotaciones), solo se preserva la activa actual.

BEGIN;

-- Si las columnas viejas ya se borraron (post-PR-cleanup), recrearlas
ALTER TABLE public.contracts ADD COLUMN IF NOT EXISTS machine_id text NULL REFERENCES public.machines(numero_serie);
ALTER TABLE public.contracts ADD COLUMN IF NOT EXISTS lieu_installation text NULL;
ALTER TABLE public.incidents ADD COLUMN IF NOT EXISTS contract_id uuid NULL REFERENCES public.contracts(id);

-- Restaurar contracts.machine_id desde la línea ACTIVA de cada contrato
UPDATE public.contracts c SET machine_id = cm.machine_id
FROM public.contract_machines cm
WHERE cm.contract_id = c.id
  AND cm.statut = 'actif'
  AND cm.date_fin IS NULL;

-- Restaurar incidents.contract_id y machine_id desde la línea
UPDATE public.incidents i
SET contract_id = cm.contract_id, machine_id = cm.machine_id
FROM public.contract_machines cm
WHERE i.contract_machine_id = cm.id;

ALTER TABLE public.incidents DROP CONSTRAINT IF EXISTS incidents_contract_or_machine_xor;
ALTER TABLE public.incidents DROP COLUMN IF EXISTS contract_machine_id;

ALTER TABLE public.contracts DROP COLUMN IF EXISTS maintenance_frequency;

DROP POLICY IF EXISTS admin_all_contract_machines ON public.contract_machines;
DROP POLICY IF EXISTS client_own_contract_machines_select ON public.contract_machines;
DROP POLICY IF EXISTS tech_assigned_contract_machines_select ON public.contract_machines;

DROP FUNCTION IF EXISTS public.auth_client_contract_machine_ids() CASCADE;
DROP FUNCTION IF EXISTS public.auth_tech_contract_machine_ids() CASCADE;
DROP FUNCTION IF EXISTS public.auth_tech_assigned_machine_ids() CASCADE;

-- Restaurar auth_client_machine_ids() a su forma vieja (derivada de contracts.machine_id)
CREATE OR REPLACE FUNCTION public.auth_client_machine_ids() RETURNS SETOF text
LANGUAGE sql SECURITY DEFINER STABLE
SET search_path = public, pg_catalog
AS $$
  SELECT c.machine_id FROM public.contracts c
  WHERE c.client_id IN (SELECT cp.client_id FROM public.client_profiles cp WHERE cp.profile_id = auth.uid())
    AND c.machine_id IS NOT NULL;
$$;

-- Restaurar políticas RLS de incidents que usaban contract_id
DROP POLICY IF EXISTS client_own_incidents_select ON public.incidents;
CREATE POLICY client_own_incidents_select ON public.incidents
  FOR SELECT USING (contract_id IN (SELECT public.auth_client_contract_ids()));

DROP POLICY IF EXISTS client_create_incidents ON public.incidents;
CREATE POLICY client_create_incidents ON public.incidents
  FOR INSERT WITH CHECK (contract_id IN (SELECT public.auth_client_contract_ids()));

DROP TABLE IF EXISTS public.contract_machines CASCADE;
DROP TYPE IF EXISTS public.contract_machine_status;

COMMIT;
