-- Nuevo tipo de plan de facturación: `tiered_total` (la tarifa REAL de AMD).
--
-- A diferencia de `hybrid_tiered` (tramos MARGINALES: cada bloque a su precio), en `tiered_total`
-- el VOLUMEN TOTAL del mes determina UN único precio por copia que se aplica a TODAS las copias
-- ("fixe + copie dégressive au volume"). Estructura de datos IDÉNTICA a hybrid_tiered
-- (fixed_fee + tiers JSONB, sin price_bw/price_color); solo cambia la aritmética, que vive en TS.
--
-- Cambios:
--  1) Ampliar el CHECK de `type` (billing_plans y billing_plan_versions) para admitir el valor.
--  2) Añadir el CHECK de coherencia de columnas para tiered_total (mismo patrón que tiered_check).
-- El trigger de versionado (tg_billing_plan_version) ya copia type+tiers → soporta el tipo sin tocarlo.

BEGIN;

-- 1) billing_plans: ampliar el dominio de `type`
ALTER TABLE public.billing_plans DROP CONSTRAINT billing_plans_type_check;
ALTER TABLE public.billing_plans ADD CONSTRAINT billing_plans_type_check
  CHECK (type IN ('per_copy', 'hybrid', 'hybrid_tiered', 'tiered_total'));

-- 2) billing_plans: coherencia de columnas para tiered_total
--    (forfait + tramos obligatorios; sin precios planos) — idéntico a billing_plans_tiered_check.
ALTER TABLE public.billing_plans ADD CONSTRAINT billing_plans_tiered_total_check CHECK (
  type != 'tiered_total' OR (
    fixed_fee IS NOT NULL AND tiers IS NOT NULL AND price_bw IS NULL AND price_color IS NULL
  )
);

-- 3) billing_plan_versions (historial de tarifas): ampliar el dominio de `type`.
--    La tabla no tiene CHECK de coherencia por tipo (es snapshot histórico) → solo el dominio.
ALTER TABLE public.billing_plan_versions DROP CONSTRAINT billing_plan_versions_type_check;
ALTER TABLE public.billing_plan_versions ADD CONSTRAINT billing_plan_versions_type_check
  CHECK (type IN ('per_copy', 'hybrid', 'hybrid_tiered', 'tiered_total'));

COMMIT;
