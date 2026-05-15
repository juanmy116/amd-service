
-- client_profiles: ver y crear la propia fila
CREATE POLICY "client_own_profile_select" ON client_profiles
  FOR SELECT TO authenticated
  USING (profile_id = auth.uid());

CREATE POLICY "client_own_profile_insert" ON client_profiles
  FOR INSERT TO authenticated
  WITH CHECK (profile_id = auth.uid());

-- contracts: cliente ve los contratos de su client_id
CREATE POLICY "client_own_contracts_select" ON contracts
  FOR SELECT TO authenticated
  USING (
    client_id IN (
      SELECT client_id FROM client_profiles WHERE profile_id = auth.uid()
    )
  );

-- machines: cliente ve las máquinas de sus contratos
CREATE POLICY "client_own_machines_select" ON machines
  FOR SELECT TO authenticated
  USING (
    numero_serie IN (
      SELECT machine_id FROM contracts
      WHERE client_id IN (
        SELECT client_id FROM client_profiles WHERE profile_id = auth.uid()
      )
    )
  );

-- incidents: cliente ve y crea incidencias de sus contratos
CREATE POLICY "client_own_incidents_select" ON incidents
  FOR SELECT TO authenticated
  USING (
    contract_id IN (
      SELECT id FROM contracts
      WHERE client_id IN (
        SELECT client_id FROM client_profiles WHERE profile_id = auth.uid()
      )
    )
  );

CREATE POLICY "client_create_incidents" ON incidents
  FOR INSERT TO authenticated
  WITH CHECK (
    contract_id IN (
      SELECT id FROM contracts
      WHERE client_id IN (
        SELECT client_id FROM client_profiles WHERE profile_id = auth.uid()
      )
    )
  );

-- clients: cliente ve su propia empresa
CREATE POLICY "client_own_client_select" ON clients
  FOR SELECT TO authenticated
  USING (
    id IN (
      SELECT client_id FROM client_profiles WHERE profile_id = auth.uid()
    )
  );
