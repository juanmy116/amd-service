-- Fase 1: Índices para robustez post-refactor contratos N máquinas
-- Ningún DROP — migración puramente aditiva

BEGIN;

-- 1. Unicidad de contador activo por máquina y mes.
--    Sin este índice dos escrituras concurrentes (manual + Princity)
--    pueden crear dos relevés activos para el mismo mes.
CREATE UNIQUE INDEX IF NOT EXISTS machine_counters_one_active_per_month
  ON public.machine_counters (machine_id, year, month)
  WHERE status = 'actif';

-- 2. Rendimiento en listados de incidencias filtrados por línea de contrato.
CREATE INDEX IF NOT EXISTS incidents_contract_machine_id_idx
  ON public.incidents (contract_machine_id);

-- 3. Acelera getOpenLineForMachine(): búsqueda de línea abierta+activa por máquina.
CREATE INDEX IF NOT EXISTS contract_machines_open_active_idx
  ON public.contract_machines (contract_id, machine_id)
  WHERE date_fin IS NULL AND statut = 'actif';

COMMIT;
