-- PR-C (FASE 3/6) — vistas de piezas/anomalías por FECHA REAL de la lectura, no por recorded_at.
-- Spec: docs/superpowers/specs/2026-06-17-contadores-fecha-real-y-linea-design.md §6.
--
-- POR QUÉ: «el contador a la fecha del cambio de pieza» y «el contador actual» deben elegirse por la
-- FECHA REAL de la lectura (reading_date), no por recorded_at (fecha de REGISTRO). Una lectura que se
-- carga tarde (email/OCR días después) tiene recorded_at posterior pero pertenece a una fecha anterior;
-- con recorded_at se elegía el contador equivocado. reading_date (columna generada, mig. 20260617130000)
-- es la fuente. recorded_at e id quedan SOLO como desempate determinista. Idéntica lógica de épocas de
-- reemplazo; solo cambia el criterio temporal. Vistas analíticas (no tocan emisión de facturas).

BEGIN;

-- ─────────────────────────────────────────────────────────────────────────────
-- v_part_yield_baseline — media de copias entre cambios de pieza (por época de reemplazo).
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE VIEW public.v_part_yield_baseline
WITH (security_invoker = true) AS
WITH changes AS (
  SELECT
    h.machine_id, h.part_id, h.changed_at, m.marque, m.modele,
    (SELECT mc.counter_bw + mc.counter_color
       FROM public.machine_counters mc
      WHERE mc.machine_id = h.machine_id AND mc.status = 'actif'
        AND mc.reading_date <= h.changed_at::date
      ORDER BY mc.reading_date DESC, mc.recorded_at DESC, mc.id DESC LIMIT 1) AS counter_total,
    (SELECT count(*)
       FROM public.machine_counters mr
      WHERE mr.machine_id = h.machine_id AND mr.status = 'actif'
        AND mr.is_replacement_start AND mr.reading_date <= h.changed_at::date) AS repl_epoch
  FROM public.v_machine_parts_history h
  JOIN public.machines m ON m.numero_serie = h.machine_id
  WHERE h.part_id IS NOT NULL
),
intervals AS (
  SELECT marque, modele, part_id,
    counter_total - LAG(counter_total) OVER (
      PARTITION BY machine_id, part_id, repl_epoch ORDER BY changed_at
    ) AS copies_between
  FROM changes
)
SELECT marque, modele, part_id,
  round(avg(copies_between))::int AS avg_yield_total,
  count(*)::int                   AS samples
FROM intervals
WHERE copies_between IS NOT NULL AND copies_between > 0
GROUP BY marque, modele, part_id;

-- ─────────────────────────────────────────────────────────────────────────────
-- v_machine_part_consumption — copias acumuladas desde el último cambio de cada pieza.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE VIEW public.v_machine_part_consumption
WITH (security_invoker = true) AS
WITH last_change AS (
  SELECT DISTINCT ON (h.machine_id, h.part_id)
    h.machine_id, h.part_id, h.changed_at,
    (SELECT mc.counter_bw + mc.counter_color FROM public.machine_counters mc
       WHERE mc.machine_id = h.machine_id AND mc.status = 'actif' AND mc.reading_date <= h.changed_at::date
       ORDER BY mc.reading_date DESC, mc.recorded_at DESC, mc.id DESC LIMIT 1) AS counter_at_change,
    (SELECT count(*) FROM public.machine_counters mr
       WHERE mr.machine_id = h.machine_id AND mr.status = 'actif' AND mr.is_replacement_start AND mr.reading_date <= h.changed_at::date) AS epoch_at_change
  FROM public.v_machine_parts_history h
  WHERE h.part_id IS NOT NULL
  ORDER BY h.machine_id, h.part_id, h.changed_at DESC, h.source_id DESC
),
current_counter AS (
  SELECT DISTINCT ON (mc.machine_id)
    mc.machine_id, (mc.counter_bw + mc.counter_color) AS counter_now, mc.reading_date,
    (SELECT count(*) FROM public.machine_counters mr
       WHERE mr.machine_id = mc.machine_id AND mr.status = 'actif' AND mr.is_replacement_start AND mr.reading_date <= mc.reading_date) AS epoch_now
  FROM public.machine_counters mc
  WHERE mc.status = 'actif'
  ORDER BY mc.machine_id, mc.reading_date DESC, mc.recorded_at DESC, mc.id DESC
)
SELECT
  lc.machine_id, m.marque, m.modele, lc.part_id, p.name AS part_name,
  lc.changed_at                                    AS last_change_at,
  GREATEST(0, cc.counter_now - lc.counter_at_change) AS copies_since_change,
  eff.expected_yield_total, eff.yield_source, eff.historical_samples AS samples
FROM last_change lc
JOIN public.machines m         ON m.numero_serie = lc.machine_id
JOIN current_counter cc        ON cc.machine_id = lc.machine_id AND cc.epoch_now = lc.epoch_at_change
LEFT JOIN public.parts p       ON p.id = lc.part_id
LEFT JOIN public.v_part_yield_effective eff
       ON eff.marque = m.marque AND eff.modele = m.modele AND eff.part_id = lc.part_id
WHERE cc.counter_now IS NOT NULL AND lc.counter_at_change IS NOT NULL;

COMMIT;
