
ALTER TABLE princity_alerts
  ADD COLUMN IF NOT EXISTS princity_alert_code    int,
  ADD COLUMN IF NOT EXISTS princity_device_id_raw text;

CREATE UNIQUE INDEX IF NOT EXISTS idx_princity_alerts_idempotency
  ON princity_alerts (princity_alert_code, princity_device_id_raw, received_at)
  WHERE princity_alert_code IS NOT NULL;
