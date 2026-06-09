-- P1-5 — Vigencia temporal de tarifas (planes + overrides por línea).
-- Plan: docs/plan-correccion-core-facturacion-2026-06-08.md §Bloque D, punto 1 (PR aparte).
--
-- Problema: planes y overrides son mutables. Al facturar un mes PASADO aún no facturado se usaban
-- los precios ACTUALES, no los que regían aquel mes. (Las facturas YA EMITIDAS son snapshot
-- inmutable y no cambian — esto solo protege los meses pasados todavía sin facturar.)
--
-- Solución: historial append-only de tarifas con vigencia por fecha. La facturación resuelve la
-- tarifa VIGENTE al inicio del ciclo facturado (asOf = period_start). El historial se captura por
-- TRIGGER (independiente del camino: RPC, UI o edición directa), así NO se toca
-- update_contract_with_lines (función compartida con el Bloque C) → cero colisión.
--
-- effective_from: en INSERT = fecha de alta (created_at del plan / date_debut de la línea);
-- en UPDATE = fecha del cambio (current_date). Las versiones backfilled reproducen los precios
-- actuales → comportamiento idéntico al de hoy hasta que haya un cambio real de precio.
-- Fuera de alcance (documentado): cambios de precio PROGRAMADOS a fecha futura (se podrían añadir
-- permitiendo un effective_from explícito); hoy el cambio rige desde la fecha en que se hace.

BEGIN;

-- ────────────────────────────────────────────────────────────────────────────
-- 1) Historial de precios de PLAN
-- ────────────────────────────────────────────────────────────────────────────
CREATE TABLE public.billing_plan_versions (
  id             uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  plan_id        uuid        NOT NULL REFERENCES public.billing_plans(id) ON DELETE CASCADE,
  effective_from date        NOT NULL,
  type           text        NOT NULL CHECK (type IN ('per_copy', 'hybrid', 'hybrid_tiered')),
  fixed_fee      numeric(10,4),
  price_bw       numeric(10,6),
  price_color    numeric(10,6),
  tiers          jsonb,
  created_at     timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT billing_plan_versions_unique UNIQUE (plan_id, effective_from)
);
CREATE INDEX idx_bpv_plan_eff ON public.billing_plan_versions (plan_id, effective_from);

COMMENT ON TABLE public.billing_plan_versions IS
  'P1-5: historial append-only de precios de cada billing_plan, con vigencia desde effective_from. La facturación resuelve la versión vigente al inicio del ciclo (period_start).';

-- ────────────────────────────────────────────────────────────────────────────
-- 2) Historial de OVERRIDES por línea de contrato
-- ────────────────────────────────────────────────────────────────────────────
CREATE TABLE public.contract_machine_override_versions (
  id                   uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  contract_machine_id  uuid        NOT NULL REFERENCES public.contract_machines(id) ON DELETE CASCADE,
  effective_from       date        NOT NULL,
  price_bw_override    numeric(10,6),
  price_color_override numeric(10,6),
  fixed_fee_override   numeric(10,4),
  created_at           timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT cm_override_versions_unique UNIQUE (contract_machine_id, effective_from)
);
CREATE INDEX idx_cmov_cm_eff ON public.contract_machine_override_versions (contract_machine_id, effective_from);

COMMENT ON TABLE public.contract_machine_override_versions IS
  'P1-5: historial append-only de los overrides de precio de cada línea contract_machines (snapshot completo de los 3 overrides por fecha de vigencia).';

-- ────────────────────────────────────────────────────────────────────────────
-- 3) RLS (admin read; el motor usa service_role y bypassa RLS; los triggers son SECURITY DEFINER)
-- ────────────────────────────────────────────────────────────────────────────
ALTER TABLE public.billing_plan_versions ENABLE ROW LEVEL SECURITY;
CREATE POLICY billing_plan_versions_admin_all ON public.billing_plan_versions
  FOR ALL TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());

ALTER TABLE public.contract_machine_override_versions ENABLE ROW LEVEL SECURITY;
CREATE POLICY cm_override_versions_admin_all ON public.contract_machine_override_versions
  FOR ALL TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());

-- ────────────────────────────────────────────────────────────────────────────
-- 4) Trigger: versiona el plan en INSERT (alta) y en UPDATE de campos tarifarios.
--    SECURITY DEFINER → inserta el historial sin importar quién dispare la edición.
-- ────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.tg_billing_plan_version()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
DECLARE
  v_eff date;
BEGIN
  IF TG_OP = 'UPDATE' THEN
    -- Solo versionar si cambió algún campo tarifario (renombrar/activar no crea versión).
    IF NEW.type        IS NOT DISTINCT FROM OLD.type
       AND NEW.fixed_fee   IS NOT DISTINCT FROM OLD.fixed_fee
       AND NEW.price_bw    IS NOT DISTINCT FROM OLD.price_bw
       AND NEW.price_color IS NOT DISTINCT FROM OLD.price_color
       AND NEW.tiers       IS NOT DISTINCT FROM OLD.tiers THEN
      RETURN NULL;
    END IF;
    v_eff := current_date;
  ELSE
    v_eff := COALESCE(NEW.created_at::date, current_date);
  END IF;

  INSERT INTO public.billing_plan_versions
    (plan_id, effective_from, type, fixed_fee, price_bw, price_color, tiers)
  VALUES
    (NEW.id, v_eff, NEW.type, NEW.fixed_fee, NEW.price_bw, NEW.price_color, NEW.tiers)
  ON CONFLICT (plan_id, effective_from) DO UPDATE SET
    type = EXCLUDED.type, fixed_fee = EXCLUDED.fixed_fee,
    price_bw = EXCLUDED.price_bw, price_color = EXCLUDED.price_color, tiers = EXCLUDED.tiers;

  RETURN NULL;
END;
$$;

CREATE TRIGGER billing_plan_version_ins
  AFTER INSERT ON public.billing_plans
  FOR EACH ROW EXECUTE FUNCTION public.tg_billing_plan_version();

CREATE TRIGGER billing_plan_version_upd
  AFTER UPDATE OF type, fixed_fee, price_bw, price_color, tiers ON public.billing_plans
  FOR EACH ROW EXECUTE FUNCTION public.tg_billing_plan_version();

-- ────────────────────────────────────────────────────────────────────────────
-- 5) Trigger: versiona los overrides de la línea en INSERT (si nace con override) y en
--    UPDATE de las columnas de override (solo si cambian de verdad).
-- ────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.tg_cm_override_version()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
DECLARE
  v_eff date;
BEGIN
  IF TG_OP = 'UPDATE' THEN
    IF NEW.price_bw_override    IS NOT DISTINCT FROM OLD.price_bw_override
       AND NEW.price_color_override IS NOT DISTINCT FROM OLD.price_color_override
       AND NEW.fixed_fee_override   IS NOT DISTINCT FROM OLD.fixed_fee_override THEN
      RETURN NULL;
    END IF;
    v_eff := current_date;
  ELSE
    -- INSERT: solo si la línea nace con algún override no nulo.
    IF NEW.price_bw_override IS NULL
       AND NEW.price_color_override IS NULL
       AND NEW.fixed_fee_override IS NULL THEN
      RETURN NULL;
    END IF;
    v_eff := NEW.date_debut;
  END IF;

  INSERT INTO public.contract_machine_override_versions
    (contract_machine_id, effective_from, price_bw_override, price_color_override, fixed_fee_override)
  VALUES
    (NEW.id, v_eff, NEW.price_bw_override, NEW.price_color_override, NEW.fixed_fee_override)
  ON CONFLICT (contract_machine_id, effective_from) DO UPDATE SET
    price_bw_override = EXCLUDED.price_bw_override,
    price_color_override = EXCLUDED.price_color_override,
    fixed_fee_override = EXCLUDED.fixed_fee_override;

  RETURN NULL;
END;
$$;

CREATE TRIGGER cm_override_version_ins
  AFTER INSERT ON public.contract_machines
  FOR EACH ROW EXECUTE FUNCTION public.tg_cm_override_version();

CREATE TRIGGER cm_override_version_upd
  AFTER UPDATE OF price_bw_override, price_color_override, fixed_fee_override ON public.contract_machines
  FOR EACH ROW EXECUTE FUNCTION public.tg_cm_override_version();

-- ────────────────────────────────────────────────────────────────────────────
-- 6) Backfill: versión inicial de cada plan y de cada override existente, con sus valores
--    ACTUALES → comportamiento idéntico al de hoy hasta el primer cambio real de precio.
-- ────────────────────────────────────────────────────────────────────────────
INSERT INTO public.billing_plan_versions
  (plan_id, effective_from, type, fixed_fee, price_bw, price_color, tiers)
SELECT id, COALESCE(created_at::date, current_date), type, fixed_fee, price_bw, price_color, tiers
FROM public.billing_plans
ON CONFLICT (plan_id, effective_from) DO NOTHING;

INSERT INTO public.contract_machine_override_versions
  (contract_machine_id, effective_from, price_bw_override, price_color_override, fixed_fee_override)
SELECT id, date_debut, price_bw_override, price_color_override, fixed_fee_override
FROM public.contract_machines
WHERE price_bw_override IS NOT NULL
   OR price_color_override IS NOT NULL
   OR fixed_fee_override IS NOT NULL
ON CONFLICT (contract_machine_id, effective_from) DO NOTHING;

COMMIT;
