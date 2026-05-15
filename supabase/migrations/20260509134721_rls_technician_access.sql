
-- Técnico ve y actualiza sus incidents asignados
CREATE POLICY "tech_assigned_incidents_select" ON incidents
  FOR SELECT TO authenticated
  USING (assigned_to = auth.uid());

CREATE POLICY "tech_assigned_incidents_update" ON incidents
  FOR UPDATE TO authenticated
  USING (assigned_to = auth.uid());

-- Técnico puede ver el historial de sus incidents
CREATE POLICY "tech_incident_history_select" ON incident_history
  FOR SELECT TO authenticated
  USING (
    incident_id IN (
      SELECT id FROM incidents WHERE assigned_to = auth.uid()
    )
  );

CREATE POLICY "tech_incident_history_insert" ON incident_history
  FOR INSERT TO authenticated
  WITH CHECK (changed_by = auth.uid());

-- Técnico ve las piezas de sus incidents
CREATE POLICY "tech_incident_parts_select" ON incident_parts
  FOR SELECT TO authenticated
  USING (
    incident_id IN (
      SELECT id FROM incidents WHERE assigned_to = auth.uid()
    )
  );

CREATE POLICY "tech_incident_parts_insert" ON incident_parts
  FOR INSERT TO authenticated
  WITH CHECK (
    incident_id IN (
      SELECT id FROM incidents WHERE assigned_to = auth.uid()
    )
  );

CREATE POLICY "tech_incident_parts_delete" ON incident_parts
  FOR DELETE TO authenticated
  USING (
    incident_id IN (
      SELECT id FROM incidents WHERE assigned_to = auth.uid()
    )
  );

-- Técnico ve los contratos y máquinas de sus incidents
CREATE POLICY "tech_contracts_select" ON contracts
  FOR SELECT TO authenticated
  USING (
    id IN (
      SELECT contract_id FROM incidents WHERE assigned_to = auth.uid()
    )
  );

CREATE POLICY "tech_machines_select" ON machines
  FOR SELECT TO authenticated
  USING (
    numero_serie IN (
      SELECT machine_id FROM incidents WHERE assigned_to = auth.uid()
    )
  );

-- Técnico ve los clientes de sus incidents
CREATE POLICY "tech_clients_select" ON clients
  FOR SELECT TO authenticated
  USING (
    id IN (
      SELECT c.client_id FROM contracts c
      INNER JOIN incidents i ON i.contract_id = c.id
      WHERE i.assigned_to = auth.uid()
    )
  );
