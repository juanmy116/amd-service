
-- ============================================================
-- FIX: Infinite recursion between contracts ↔ incidents RLS
-- Root cause: tech_contracts_select queries incidents,
--             client_own_incidents_select queries contracts
--             → mutual recursion → ALL queries on both tables fail
--
-- Solution: SECURITY DEFINER helper functions that bypass RLS
--           in subqueries, breaking the recursive cycle.
-- ============================================================

-- Step 1: Create SECURITY DEFINER helper functions
-- Each function runs as postgres (table owner, bypasses RLS)
-- so subqueries inside don't re-trigger RLS policies.

CREATE OR REPLACE FUNCTION auth_tech_incident_ids()
RETURNS SETOF uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT id FROM incidents WHERE assigned_to = auth.uid();
$$;

CREATE OR REPLACE FUNCTION auth_tech_incident_contract_ids()
RETURNS SETOF uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT DISTINCT contract_id FROM incidents
  WHERE assigned_to = auth.uid() AND contract_id IS NOT NULL;
$$;

CREATE OR REPLACE FUNCTION auth_tech_incident_machine_ids()
RETURNS SETOF text LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT DISTINCT machine_id FROM incidents
  WHERE assigned_to = auth.uid() AND machine_id IS NOT NULL;
$$;

CREATE OR REPLACE FUNCTION auth_tech_assigned_client_ids()
RETURNS SETOF integer LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT DISTINCT c.client_id FROM contracts c
  JOIN incidents i ON i.contract_id = c.id
  WHERE i.assigned_to = auth.uid();
$$;

CREATE OR REPLACE FUNCTION auth_client_contract_ids()
RETURNS SETOF uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT c.id FROM contracts c
  JOIN client_profiles cp ON cp.client_id = c.client_id
  WHERE cp.profile_id = auth.uid();
$$;

CREATE OR REPLACE FUNCTION auth_client_machine_ids()
RETURNS SETOF text LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT DISTINCT c.machine_id FROM contracts c
  JOIN client_profiles cp ON cp.client_id = c.client_id
  WHERE cp.profile_id = auth.uid() AND c.machine_id IS NOT NULL;
$$;

-- Step 2: Rebuild all policies that caused recursion

-- contracts
DROP POLICY IF EXISTS tech_contracts_select ON contracts;
CREATE POLICY tech_contracts_select ON contracts FOR SELECT TO authenticated
  USING (id IN (SELECT auth_tech_incident_contract_ids()));

DROP POLICY IF EXISTS client_own_contracts_select ON contracts;
CREATE POLICY client_own_contracts_select ON contracts FOR SELECT TO authenticated
  USING (id IN (SELECT auth_client_contract_ids()));

-- incidents
DROP POLICY IF EXISTS client_own_incidents_select ON incidents;
CREATE POLICY client_own_incidents_select ON incidents FOR SELECT TO authenticated
  USING (contract_id IN (SELECT auth_client_contract_ids()));

DROP POLICY IF EXISTS client_create_incidents ON incidents;
CREATE POLICY client_create_incidents ON incidents FOR INSERT TO authenticated
  WITH CHECK (contract_id IN (SELECT auth_client_contract_ids()));

-- machines
DROP POLICY IF EXISTS tech_machines_select ON machines;
CREATE POLICY tech_machines_select ON machines FOR SELECT TO authenticated
  USING (numero_serie IN (SELECT auth_tech_incident_machine_ids()));

DROP POLICY IF EXISTS client_own_machines_select ON machines;
CREATE POLICY client_own_machines_select ON machines FOR SELECT TO authenticated
  USING (numero_serie IN (SELECT auth_client_machine_ids()));

-- clients
DROP POLICY IF EXISTS tech_clients_select ON clients;
CREATE POLICY tech_clients_select ON clients FOR SELECT TO authenticated
  USING (id IN (SELECT auth_tech_assigned_client_ids()));

DROP POLICY IF EXISTS client_own_client_select ON clients;
CREATE POLICY client_own_client_select ON clients FOR SELECT TO authenticated
  USING (id IN (SELECT cp.client_id FROM client_profiles cp WHERE cp.profile_id = auth.uid()));

-- incident_history
DROP POLICY IF EXISTS tech_incident_history_select ON incident_history;
CREATE POLICY tech_incident_history_select ON incident_history FOR SELECT TO authenticated
  USING (incident_id IN (SELECT auth_tech_incident_ids()));

DROP POLICY IF EXISTS tech_incident_history_insert ON incident_history;
CREATE POLICY tech_incident_history_insert ON incident_history FOR INSERT TO authenticated
  WITH CHECK (changed_by = auth.uid());

-- incident_parts
DROP POLICY IF EXISTS tech_incident_parts_select ON incident_parts;
CREATE POLICY tech_incident_parts_select ON incident_parts FOR SELECT TO authenticated
  USING (incident_id IN (SELECT auth_tech_incident_ids()));

DROP POLICY IF EXISTS tech_incident_parts_insert ON incident_parts;
CREATE POLICY tech_incident_parts_insert ON incident_parts FOR INSERT TO authenticated
  WITH CHECK (incident_id IN (SELECT auth_tech_incident_ids()));

DROP POLICY IF EXISTS tech_incident_parts_delete ON incident_parts;
CREATE POLICY tech_incident_parts_delete ON incident_parts FOR DELETE TO authenticated
  USING (incident_id IN (SELECT auth_tech_incident_ids()));
