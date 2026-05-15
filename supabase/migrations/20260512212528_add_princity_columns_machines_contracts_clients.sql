
-- machines: ID de dispositivo en Princity + flag de pendiente
ALTER TABLE machines
  ADD COLUMN IF NOT EXISTS princity_device_id text,
  ADD COLUMN IF NOT EXISTS princity_pending   boolean NOT NULL DEFAULT false;

-- contracts: día de facturación detectado automáticamente
ALTER TABLE contracts
  ADD COLUMN IF NOT EXISTS billing_day smallint CHECK (billing_day BETWEEN 1 AND 31);

-- clients: prefijo de empresa en Princity
ALTER TABLE clients
  ADD COLUMN IF NOT EXISTS princity_company_id text;

-- Índices para búsquedas frecuentes
CREATE INDEX IF NOT EXISTS idx_machines_princity_device_id
  ON machines (princity_device_id)
  WHERE princity_device_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_clients_princity_company_id
  ON clients (princity_company_id)
  WHERE princity_company_id IS NOT NULL;
