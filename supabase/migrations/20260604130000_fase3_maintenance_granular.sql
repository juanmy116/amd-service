-- Fase 3: mantenimiento granular por máquina.
-- Producción tiene 0 visitas (verificado), por lo que contract_machine_id es NOT NULL directamente.

ALTER TABLE maintenance_visits
  ADD COLUMN contract_machine_id uuid NOT NULL REFERENCES contract_machines(id) ON DELETE CASCADE;

CREATE INDEX maintenance_visits_contract_machine_id_idx
  ON maintenance_visits (contract_machine_id);
