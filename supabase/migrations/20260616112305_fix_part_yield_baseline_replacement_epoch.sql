-- Fix (Fase 2): el baseline no debe restar contadores a través de un reemplazo
-- de máquina (el contador se reinicia bajo el mismo numero_serie). Particionamos
-- el cálculo por "época de reemplazo" = nº de reinicios (is_replacement_start)
-- ocurridos hasta cada cambio de pieza. Alinea con el principio del spec
-- (Fase 0 §2.2 / Fase 3 §5: no sumar copias a través de un cambio de equipo).
CREATE OR REPLACE VIEW public.v_part_yield_baseline
WITH (security_invoker = true) AS
WITH changes AS (
  SELECT
    h.machine_id, h.part_id, h.changed_at, m.marque, m.modele,
    (SELECT mc.counter_bw + mc.counter_color
       FROM public.machine_counters mc
      WHERE mc.machine_id = h.machine_id AND mc.status = 'actif'
        AND mc.recorded_at <= h.changed_at
      ORDER BY mc.recorded_at DESC LIMIT 1) AS counter_total,
    (SELECT count(*)
       FROM public.machine_counters mr
      WHERE mr.machine_id = h.machine_id AND mr.status = 'actif'
        AND mr.is_replacement_start AND mr.recorded_at <= h.changed_at) AS repl_epoch
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
