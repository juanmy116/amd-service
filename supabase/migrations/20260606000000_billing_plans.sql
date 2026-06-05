-- supabase/migrations/20260606000000_billing_plans.sql

-- Catálogo de tipos de facturación AMD
CREATE TABLE public.billing_plans (
  id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  name         text        NOT NULL,
  type         text        NOT NULL CHECK (type IN ('per_copy', 'hybrid', 'hybrid_tiered')),
  fixed_fee    numeric(10,4),
  price_bw     numeric(10,6),
  price_color  numeric(10,6),
  tiers        jsonb,
  active       boolean     NOT NULL DEFAULT true,
  created_at   timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT billing_plans_name_unique UNIQUE (name),

  CONSTRAINT billing_plans_per_copy_check CHECK (
    type != 'per_copy' OR (
      fixed_fee IS NULL AND price_bw IS NOT NULL AND price_color IS NOT NULL AND tiers IS NULL
    )
  ),
  CONSTRAINT billing_plans_hybrid_check CHECK (
    type != 'hybrid' OR (
      fixed_fee IS NOT NULL AND price_bw IS NOT NULL AND price_color IS NOT NULL AND tiers IS NULL
    )
  ),
  CONSTRAINT billing_plans_tiered_check CHECK (
    type != 'hybrid_tiered' OR (
      fixed_fee IS NOT NULL AND tiers IS NOT NULL AND price_bw IS NULL AND price_color IS NULL
    )
  ),

  -- No-negatividad (fix revisor #1)
  CONSTRAINT billing_plans_prices_nonneg CHECK (
    (fixed_fee   IS NULL OR fixed_fee   >= 0) AND
    (price_bw    IS NULL OR price_bw    >= 0) AND
    (price_color IS NULL OR price_color >= 0)
  )
);

ALTER TABLE public.billing_plans ENABLE ROW LEVEL SECURITY;

-- Policy admin con USING + WITH CHECK vía is_admin() (convención del repo, fix revisor #1)
CREATE POLICY "billing_plans_admin_all" ON public.billing_plans
  FOR ALL TO authenticated
  USING (public.is_admin()) WITH CHECK (public.is_admin());

CREATE INDEX idx_billing_plans_active_name ON public.billing_plans (active, name);

-- Nuevos campos en contract_machines
ALTER TABLE public.contract_machines
  ADD COLUMN billing_plan_id      uuid REFERENCES public.billing_plans(id) ON DELETE SET NULL,
  ADD COLUMN price_bw_override    numeric(10,6),
  ADD COLUMN price_color_override numeric(10,6),
  ADD COLUMN fixed_fee_override   numeric(10,4),
  ADD CONSTRAINT contract_machines_billing_override_nonneg CHECK (
    (price_bw_override    IS NULL OR price_bw_override    >= 0) AND
    (price_color_override IS NULL OR price_color_override >= 0) AND
    (fixed_fee_override   IS NULL OR fixed_fee_override   >= 0)
  );

CREATE INDEX idx_cm_billing_plan ON public.contract_machines (billing_plan_id)
  WHERE billing_plan_id IS NOT NULL;

COMMENT ON TABLE public.billing_plans IS 'Catálogo de tipos de facturación AMD. Define estructura y precios base.';
COMMENT ON COLUMN public.contract_machines.billing_plan_id      IS 'Plan de facturación de esta línea. NULL = sin facturación.';
COMMENT ON COLUMN public.contract_machines.price_bw_override    IS 'Override precio B&N. NULL = usar el del plan.';
COMMENT ON COLUMN public.contract_machines.price_color_override IS 'Override precio color. NULL = usar el del plan.';
COMMENT ON COLUMN public.contract_machines.fixed_fee_override   IS 'Override cuota fija. NULL = usar la del plan.';
