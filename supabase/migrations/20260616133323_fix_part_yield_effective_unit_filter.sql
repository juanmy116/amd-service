-- Fix (review holístico): el filtro s.unit='copies_total' estaba en el ON de un
-- FULL JOIN, por lo que una ficha en otra unidad (p.ej. copies_color para tóner)
-- NO se descartaba: aparecía como fila 'fabricant' extra en magnitud equivocada y
-- DUPLICABA la pieza cuando había baseline → anomalías duplicadas/mal calculadas.
-- Solución: pre-filtrar las fichas a copies_total ANTES del join (descarte real,
-- alineado con la doc: la vista efectiva trabaja solo en copies_total).
CREATE OR REPLACE VIEW public.v_part_yield_effective
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
FULL OUTER JOIN (
  SELECT marque, modele, part_id, expected_yield
  FROM public.part_yield_specs
  WHERE unit = 'copies_total'
) s
  ON s.marque = b.marque AND s.modele = b.modele AND s.part_id = b.part_id
LEFT JOIN public.parts p ON p.id = COALESCE(s.part_id, b.part_id);
