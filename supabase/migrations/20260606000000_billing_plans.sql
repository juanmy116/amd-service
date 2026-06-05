-- supabase/migrations/20260606000000_billing_plans.sql

-- Catálogo de tipos de facturación AMD
CREATE TABLE billing_plans (
  id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  name         text        NOT NULL,
  type         text        NOT NULL CHECK (type IN ('per_copy', 'hybrid', 'hybrid_tiered')),
  fixed_fee    numeric(10,4),      -- cuota fija mensual en FCFA (null para per_copy)
  price_bw     numeric(10,6),      -- precio por copia B&N en FCFA (null para hybrid_tiered)
  price_color  numeric(10,6),      -- precio por copia color en FCFA (null para hybrid_tiered)
  tiers        jsonb,              -- [{up_to: N|null, price_bw: N, price_color: N}]
  active       boolean     NOT NULL DEFAULT true,
  created_at   timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT billing_plans_name_unique UNIQUE (name),

  -- per_copy: sin cuota fija, con precios planos, sin tramos
  CONSTRAINT billing_plans_per_copy_check CHECK (
    type != 'per_copy' OR (
      fixed_fee IS NULL AND
      price_bw IS NOT NULL AND price_color IS NOT NULL AND
      tiers IS NULL
    )
  ),
  -- hybrid: cuota fija + precios planos, sin tramos
  CONSTRAINT billing_plans_hybrid_check CHECK (
    type != 'hybrid' OR (
      fixed_fee IS NOT NULL AND
      price_bw IS NOT NULL AND price_color IS NOT NULL AND
      tiers IS NULL
    )
  ),
  -- hybrid_tiered: cuota fija + tramos, sin precios planos
  CONSTRAINT billing_plans_tiered_check CHECK (
    type != 'hybrid_tiered' OR (
      fixed_fee IS NOT NULL AND
      tiers IS NOT NULL AND
      price_bw IS NULL AND price_color IS NULL
    )
  )
);

ALTER TABLE billing_plans ENABLE ROW LEVEL SECURITY;

CREATE POLICY "billing_plans_admin_all" ON billing_plans
  FOR ALL TO authenticated
  USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
  );

CREATE INDEX idx_billing_plans_active_name ON billing_plans (active, name);

-- Nuevos campos en contract_machines
ALTER TABLE contract_machines
  ADD COLUMN billing_plan_id      uuid REFERENCES billing_plans(id) ON DELETE SET NULL,
  ADD COLUMN price_bw_override    numeric(10,6),
  ADD COLUMN price_color_override numeric(10,6),
  ADD COLUMN fixed_fee_override   numeric(10,4);

CREATE INDEX idx_cm_billing_plan ON contract_machines (billing_plan_id)
  WHERE billing_plan_id IS NOT NULL;

COMMENT ON TABLE billing_plans IS 'Catálogo de tipos de facturación AMD. Define estructura y precios base.';
COMMENT ON COLUMN contract_machines.billing_plan_id      IS 'Plan de facturación de esta línea. NULL = sin facturación automatizada.';
COMMENT ON COLUMN contract_machines.price_bw_override    IS 'Override precio B&N. NULL = usar el del plan.';
COMMENT ON COLUMN contract_machines.price_color_override IS 'Override precio color. NULL = usar el del plan.';
COMMENT ON COLUMN contract_machines.fixed_fee_override   IS 'Override cuota fija mensual. NULL = usar la del plan.';
