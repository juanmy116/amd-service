-- Refinamiento (Fase 3) tras verificación adversarial:
-- (1) GREATEST(0, …) para no exponer copies_since_change negativo a futuros consumidores
--     (lecturas que retroceden / edición manual). La regla ya descartaba <=0, esto limpia la vista.
-- (2) Desempate determinista en los DISTINCT ON (source_id / mc.id) para que lecturas o
--     cambios con el mismo timestamp elijan una fila estable, no arbitraria.
CREATE OR REPLACE VIEW public.v_machine_part_consumption
WITH (security_invoker = true) AS
WITH last_change AS (
  SELECT DISTINCT ON (h.machine_id, h.part_id)
    h.machine_id, h.part_id, h.changed_at,
    (SELECT mc.counter_bw + mc.counter_color FROM public.machine_counters mc
       WHERE mc.machine_id = h.machine_id AND mc.status = 'actif' AND mc.recorded_at <= h.changed_at
       ORDER BY mc.recorded_at DESC, mc.id DESC LIMIT 1) AS counter_at_change,
    (SELECT count(*) FROM public.machine_counters mr
       WHERE mr.machine_id = h.machine_id AND mr.status = 'actif' AND mr.is_replacement_start AND mr.recorded_at <= h.changed_at) AS epoch_at_change
  FROM public.v_machine_parts_history h
  WHERE h.part_id IS NOT NULL
  ORDER BY h.machine_id, h.part_id, h.changed_at DESC, h.source_id DESC
),
current_counter AS (
  SELECT DISTINCT ON (mc.machine_id)
    mc.machine_id, (mc.counter_bw + mc.counter_color) AS counter_now, mc.recorded_at,
    (SELECT count(*) FROM public.machine_counters mr
       WHERE mr.machine_id = mc.machine_id AND mr.status = 'actif' AND mr.is_replacement_start AND mr.recorded_at <= mc.recorded_at) AS epoch_now
  FROM public.machine_counters mc
  WHERE mc.status = 'actif'
  ORDER BY mc.machine_id, mc.recorded_at DESC, mc.id DESC
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
