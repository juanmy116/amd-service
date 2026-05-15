
CREATE TABLE machine_counters (
  id                   UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  machine_id           TEXT        NOT NULL REFERENCES machines(numero_serie) ON DELETE RESTRICT,
  contract_id          UUID        REFERENCES contracts(id) ON DELETE SET NULL,
  client_id            BIGINT      REFERENCES clients(id) ON DELETE SET NULL,
  year                 INT         NOT NULL CHECK (year >= 2020 AND year <= 2100),
  month                INT         NOT NULL CHECK (month >= 1 AND month <= 12),
  counter_bw           INT         NOT NULL DEFAULT 0 CHECK (counter_bw >= 0),
  counter_color        INT         NOT NULL DEFAULT 0 CHECK (counter_color >= 0),
  status               TEXT        NOT NULL DEFAULT 'actif' CHECK (status IN ('actif', 'annule')),
  annule_by            UUID        REFERENCES profiles(id) ON DELETE SET NULL,
  annule_at            TIMESTAMPTZ,
  annulation_reason    TEXT,
  is_replacement_start BOOLEAN     NOT NULL DEFAULT FALSE,
  previous_machine_id  TEXT        REFERENCES machines(numero_serie) ON DELETE SET NULL,
  notes                TEXT,
  recorded_by          UUID        REFERENCES profiles(id) ON DELETE SET NULL,
  recorded_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE machine_counters ENABLE ROW LEVEL SECURITY;

CREATE POLICY "admins_machine_counters" ON machine_counters
  FOR ALL TO authenticated
  USING   (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'))
  WITH CHECK (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'));

CREATE INDEX idx_mc_machine   ON machine_counters(machine_id);
CREATE INDEX idx_mc_year_month ON machine_counters(year, month);
CREATE INDEX idx_mc_status     ON machine_counters(status);
