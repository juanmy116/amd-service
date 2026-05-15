
CREATE TABLE IF NOT EXISTS princity_health (
  function_name      text        PRIMARY KEY,
  last_success_at    timestamptz,
  last_error_at      timestamptz,
  last_error_message text,
  alert_sent         boolean     NOT NULL DEFAULT false
);

ALTER TABLE princity_health ENABLE ROW LEVEL SECURITY;

CREATE POLICY "admins pueden leer health"
  ON princity_health FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
        AND profiles.role = 'admin'
    )
  );

-- Filas iniciales — una por función
INSERT INTO princity_health (function_name) VALUES
  ('princity-alerts'),
  ('princity-sync'),
  ('princity-counters')
ON CONFLICT DO NOTHING;
