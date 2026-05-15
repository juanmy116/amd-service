
ALTER TABLE clients
  ADD COLUMN IF NOT EXISTS princity_id   bigint UNIQUE,
  ADD COLUMN IF NOT EXISTS princity_prefix text;

COMMENT ON COLUMN clients.princity_id     IS 'ID interno de la empresa en Princity (para sincronización API)';
COMMENT ON COLUMN clients.princity_prefix IS 'Prefijo de empresa en Princity (usado para filtrar dispositivos via API)';
