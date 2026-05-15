
ALTER TABLE csat_responses
  ADD COLUMN IF NOT EXISTS created_at timestamptz NOT NULL DEFAULT now(),
  ADD COLUMN IF NOT EXISTS expires_at  timestamptz NOT NULL DEFAULT (now() + interval '7 days');

ALTER TABLE csat_responses
  DROP CONSTRAINT IF EXISTS csat_responses_incident_id_unique;

ALTER TABLE csat_responses
  ADD CONSTRAINT csat_responses_incident_id_unique UNIQUE (incident_id);
