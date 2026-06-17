-- FASE 1 (PR-A) del rediseño "contadores anclados a fecha real + línea".
-- Spec: docs/superpowers/specs/2026-06-17-contadores-fecha-real-y-linea-design.md (v3.1).
--
-- Ancla 1 (fecha real): `day` obligatorio + `reading_date` (fecha real de la lectura) + unicidad por
--   (machine_id, reading_date) en vez de por (machine_id, year, month) → permite dos lecturas en el
--   mismo mes natural (días distintos) y bloquea solo el duplicado real (misma máquina y día).
-- Ancla 2 (línea): `machine_counters.contract_machine_id` = la línea/puesto al que pertenece la lectura.
-- Trazabilidad de la cadena: `invoice_lines` guarda la identidad de las lecturas/contadores facturados.
--
-- Seguro: 0 contadores y 0 facturas en prod (verificado) → sin migración de datos. El backfill de `day`
-- es defensivo (protege otros entornos). NO se aplica a prod en este PR; se valida en CI (BD efímera).

BEGIN;

-- ─────────────────────────────────────────────────────────────────────────────
-- 1) machine_counters: FECHA REAL obligatoria
-- ─────────────────────────────────────────────────────────────────────────────
UPDATE public.machine_counters SET day = 1 WHERE day IS NULL;   -- backfill defensivo (0 filas en prod)
ALTER TABLE public.machine_counters ALTER COLUMN day SET NOT NULL;

-- Fecha real de la lectura (generada de year/month/day). make_date rechaza fechas inválidas
-- (p. ej. 31 de febrero) → garantiza coherencia de la fecha al insertar.
ALTER TABLE public.machine_counters
  ADD COLUMN IF NOT EXISTS reading_date date GENERATED ALWAYS AS (make_date(year, month, day)) STORED;

COMMENT ON COLUMN public.machine_counters.reading_date IS
  'Fecha real de la lectura (year/month/day). Fuente para ordenar y atribuir; recorded_at queda solo como auditoría de registro.';

-- ─────────────────────────────────────────────────────────────────────────────
-- 2) Ancla a la LÍNEA de contrato vigente en la fecha de la lectura
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE public.machine_counters
  ADD COLUMN IF NOT EXISTS contract_machine_id uuid REFERENCES public.contract_machines(id) ON DELETE RESTRICT;

COMMENT ON COLUMN public.machine_counters.contract_machine_id IS
  'Línea/puesto (contract_machines) vigente en reading_date. Atribución del consumo por línea (no solo por máquina/contrato).';

-- ─────────────────────────────────────────────────────────────────────────────
-- 3) Unicidad por FECHA REAL (reemplaza la unicidad por mes calendario)
-- ─────────────────────────────────────────────────────────────────────────────
DROP INDEX IF EXISTS public.machine_counters_one_active_per_month;
CREATE UNIQUE INDEX IF NOT EXISTS machine_counters_one_active_per_day
  ON public.machine_counters (machine_id, reading_date)
  WHERE status = 'actif';

COMMENT ON INDEX public.machine_counters_one_active_per_day IS
  'Una lectura activa por máquina y día real. Permite varias lecturas en el mismo mes natural; otra del mismo día = corrección (anular la anterior).';

-- Apoyo: facturación/atribución por línea y selección del "último/anterior" por fecha real.
CREATE INDEX IF NOT EXISTS idx_mc_contract_machine ON public.machine_counters (contract_machine_id);
CREATE INDEX IF NOT EXISTS idx_mc_machine_reading_date ON public.machine_counters (machine_id, reading_date DESC);

-- ─────────────────────────────────────────────────────────────────────────────
-- 4) invoice_lines: IDENTIDAD de las lecturas/contadores facturados (trazabilidad de la cadena)
--    Referencias informativas (snapshot inmutable), sin FK — mismo patrón que contract_id/machine_id.
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE public.invoice_lines
  ADD COLUMN IF NOT EXISTS contract_machine_id   uuid,
  ADD COLUMN IF NOT EXISTS opening_counter_id    uuid,
  ADD COLUMN IF NOT EXISTS closing_counter_id    uuid,
  ADD COLUMN IF NOT EXISTS opening_reading_date  date,
  ADD COLUMN IF NOT EXISTS closing_reading_date  date,
  ADD COLUMN IF NOT EXISTS opening_counter_bw    int,
  ADD COLUMN IF NOT EXISTS opening_counter_color int,
  ADD COLUMN IF NOT EXISTS closing_counter_bw    int,
  ADD COLUMN IF NOT EXISTS closing_counter_color int;

COMMENT ON COLUMN public.invoice_lines.closing_counter_id IS
  'Lectura usada como CIERRE de esta línea (cadena mensual). No reutilizable como cierre de otra factura emise del mismo puesto (validado en emit).';

COMMIT;
