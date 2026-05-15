
-- Planes de mantenimiento (uno por contrato)
CREATE TABLE maintenance_plans (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  contract_id uuid NOT NULL REFERENCES contracts(id) ON DELETE CASCADE,
  frequency   text NOT NULL CHECK (frequency IN ('mensuel', 'trimestriel')),
  notes       text,
  active      boolean NOT NULL DEFAULT true,
  created_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (contract_id)
);

-- Visitas de mantenimiento individuales
CREATE TABLE maintenance_visits (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  plan_id          uuid NOT NULL REFERENCES maintenance_plans(id) ON DELETE CASCADE,
  scheduled_date   date NOT NULL,
  done_at          timestamptz,
  done_by          uuid REFERENCES profiles(id),
  status           text NOT NULL DEFAULT 'planifié' CHECK (status IN ('planifié', 'fait', 'en_retard')),
  qr_verified      boolean NOT NULL DEFAULT false,
  notes            text,
  matrix_notified  boolean NOT NULL DEFAULT false,
  created_at       timestamptz NOT NULL DEFAULT now()
);

-- Piezas reemplazadas durante una visita
CREATE TABLE maintenance_parts (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  visit_id    uuid NOT NULL REFERENCES maintenance_visits(id) ON DELETE CASCADE,
  part_id     smallint REFERENCES parts(id),
  description text,
  quantity    integer NOT NULL DEFAULT 1 CHECK (quantity > 0),
  created_at  timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT part_identified CHECK (part_id IS NOT NULL OR description IS NOT NULL)
);

-- Índices útiles
CREATE INDEX ON maintenance_visits (plan_id, status);
CREATE INDEX ON maintenance_visits (scheduled_date) WHERE status != 'fait';
CREATE INDEX ON maintenance_visits (matrix_notified) WHERE matrix_notified = false AND status = 'planifié';

-- RLS
ALTER TABLE maintenance_plans  ENABLE ROW LEVEL SECURITY;
ALTER TABLE maintenance_visits ENABLE ROW LEVEL SECURITY;
ALTER TABLE maintenance_parts  ENABLE ROW LEVEL SECURITY;

-- Admins: acceso total
CREATE POLICY "admin_all_plans"  ON maintenance_plans  FOR ALL TO authenticated USING (
  EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
);
CREATE POLICY "admin_all_visits" ON maintenance_visits FOR ALL TO authenticated USING (
  EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
);
CREATE POLICY "admin_all_parts"  ON maintenance_parts  FOR ALL TO authenticated USING (
  EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
);

-- Técnicos: pueden leer planes/visitas y actualizar/insertar en las suyas
CREATE POLICY "tech_read_plans"    ON maintenance_plans  FOR SELECT TO authenticated USING (
  EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'technician')
);
CREATE POLICY "tech_read_visits"   ON maintenance_visits FOR SELECT TO authenticated USING (
  EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'technician')
);
CREATE POLICY "tech_update_visits" ON maintenance_visits FOR UPDATE TO authenticated USING (
  EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'technician')
);
CREATE POLICY "tech_insert_parts"  ON maintenance_parts  FOR INSERT TO authenticated WITH CHECK (
  EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'technician')
);
CREATE POLICY "tech_read_parts"    ON maintenance_parts  FOR SELECT TO authenticated USING (
  EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'technician')
);
