-- Fase 2 — Referencia de "lo normal": rendimiento esperado de cada pieza.
-- Tres piezas: (1) fichas del fabricante, (2) baseline aprendido del histórico,
-- (3) rendimiento efectivo que combina ambos (prioriza fabricante).

-- 1) Fichas del fabricante (cargadas a mano por SQL/CSV; admin-only).
CREATE TABLE public.part_yield_specs (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  marque         text NOT NULL,
  modele         text NOT NULL,
  part_id        smallint NOT NULL REFERENCES public.parts(id),
  expected_yield int  NOT NULL CHECK (expected_yield > 0),
  unit           text NOT NULL CHECK (unit IN ('copies_bw','copies_color','copies_total','mois')),
  source         text NOT NULL DEFAULT 'fabricant' CHECK (source IN ('fabricant','estimé')),
  notes          text,
  created_at     timestamptz NOT NULL DEFAULT now(),
  UNIQUE (marque, modele, part_id, unit)
);

ALTER TABLE public.part_yield_specs ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.part_yield_specs TO authenticated;
CREATE POLICY "admin_all_part_yield_specs" ON public.part_yield_specs
  FOR ALL TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());

-- 2) Baseline aprendido: copias_total transcurridas entre cambios consecutivos de
--    la misma pieza en la misma máquina, promediado por (marque, modele, part_id).
--    security_invoker → hereda RLS (machine_counters es admin-only): solo admin/service_role ven datos.
CREATE VIEW public.v_part_yield_baseline
WITH (security_invoker = true) AS
WITH changes AS (
  SELECT
    h.machine_id, h.part_id, h.changed_at, m.marque, m.modele,
    (SELECT mc.counter_bw + mc.counter_color
       FROM public.machine_counters mc
      WHERE mc.machine_id = h.machine_id AND mc.status = 'actif'
        AND mc.recorded_at <= h.changed_at
      ORDER BY mc.recorded_at DESC LIMIT 1) AS counter_total
  FROM public.v_machine_parts_history h
  JOIN public.machines m ON m.numero_serie = h.machine_id
  WHERE h.part_id IS NOT NULL
),
intervals AS (
  SELECT marque, modele, part_id,
    counter_total - LAG(counter_total) OVER (
      PARTITION BY machine_id, part_id ORDER BY changed_at
    ) AS copies_between
  FROM changes
)
SELECT marque, modele, part_id,
  round(avg(copies_between))::int AS avg_yield_total,
  count(*)::int                   AS samples
FROM intervals
WHERE copies_between IS NOT NULL AND copies_between > 0
GROUP BY marque, modele, part_id;

GRANT SELECT ON public.v_part_yield_baseline TO authenticated;

-- 3) Rendimiento efectivo (en copies_total): prioriza la ficha del fabricante
--    (unit='copies_total') y, si no existe, cae al baseline aprendido. Marca el origen.
CREATE VIEW public.v_part_yield_effective
WITH (security_invoker = true) AS
SELECT
  COALESCE(s.marque, b.marque)   AS marque,
  COALESCE(s.modele, b.modele)   AS modele,
  COALESCE(s.part_id, b.part_id) AS part_id,
  p.name                         AS part_name,
  COALESCE(s.expected_yield, b.avg_yield_total) AS expected_yield_total,
  CASE
    WHEN s.expected_yield   IS NOT NULL THEN 'fabricant'
    WHEN b.avg_yield_total  IS NOT NULL THEN 'historique'
  END                            AS yield_source,
  b.samples                      AS historical_samples
FROM public.v_part_yield_baseline b
FULL OUTER JOIN public.part_yield_specs s
  ON s.marque = b.marque AND s.modele = b.modele AND s.part_id = b.part_id AND s.unit = 'copies_total'
LEFT JOIN public.parts p ON p.id = COALESCE(s.part_id, b.part_id);

GRANT SELECT ON public.v_part_yield_effective TO authenticated;
