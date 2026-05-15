
CREATE TABLE IF NOT EXISTS princity_api_logs (
  id                uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  function_name     text        NOT NULL,
  endpoint_called   text,
  executed_at       timestamptz NOT NULL DEFAULT now(),
  status            text        NOT NULL CHECK (status IN ('success', 'partial', 'error')),
  records_processed int         NOT NULL DEFAULT 0,
  records_created   int         NOT NULL DEFAULT 0,
  error_message     text
);

ALTER TABLE princity_api_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "admins pueden leer logs"
  ON princity_api_logs FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
        AND profiles.role = 'admin'
    )
  );
