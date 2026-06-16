-- Fase 3 — Agente de detección de anomalías de consumo.

-- Cola de anomalías (espejo conceptual de pending_counter_imports). admin-only.
CREATE TABLE public.machine_anomalies (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  machine_id   text NOT NULL REFERENCES public.machines(numero_serie),
  part_id      smallint REFERENCES public.parts(id),
  anomaly_type text NOT NULL,
  light        text NOT NULL CHECK (light IN ('amber','red')),
  reason       text NOT NULL,
  metrics      jsonb,
  status       text NOT NULL DEFAULT 'open' CHECK (status IN ('open','ack','dismissed','resolved')),
  detected_at  timestamptz NOT NULL DEFAULT now(),
  reviewed_by  uuid REFERENCES public.profiles(id),
  reviewed_at  timestamptz
);

-- Una sola anomalía ABIERTA por (máquina, pieza, tipo): el recálculo upserta.
CREATE UNIQUE INDEX uniq_open_machine_anomaly
  ON public.machine_anomalies (machine_id, part_id, anomaly_type) WHERE status = 'open';
CREATE INDEX idx_machine_anomalies_status ON public.machine_anomalies (status);

ALTER TABLE public.machine_anomalies ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.machine_anomalies TO authenticated;
CREATE POLICY "admin_all_machine_anomalies" ON public.machine_anomalies
  FOR ALL TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());

-- Inputs del agente: por (máquina, pieza) con un cambio registrado, las copias_total
-- transcurridas desde el ÚLTIMO cambio hasta la lectura más reciente, junto al
-- rendimiento esperado. Respeta reemplazos: solo cuenta si el último cambio y la
-- lectura actual están en la misma "época" de máquina (mismo nº de reinicios).
CREATE VIEW public.v_machine_part_consumption
WITH (security_invoker = true) AS
WITH last_change AS (
  SELECT DISTINCT ON (h.machine_id, h.part_id)
    h.machine_id, h.part_id, h.changed_at,
    (SELECT mc.counter_bw + mc.counter_color FROM public.machine_counters mc
       WHERE mc.machine_id = h.machine_id AND mc.status = 'actif' AND mc.recorded_at <= h.changed_at
       ORDER BY mc.recorded_at DESC LIMIT 1) AS counter_at_change,
    (SELECT count(*) FROM public.machine_counters mr
       WHERE mr.machine_id = h.machine_id AND mr.status = 'actif' AND mr.is_replacement_start AND mr.recorded_at <= h.changed_at) AS epoch_at_change
  FROM public.v_machine_parts_history h
  WHERE h.part_id IS NOT NULL
  ORDER BY h.machine_id, h.part_id, h.changed_at DESC
),
current_counter AS (
  SELECT DISTINCT ON (mc.machine_id)
    mc.machine_id, (mc.counter_bw + mc.counter_color) AS counter_now, mc.recorded_at,
    (SELECT count(*) FROM public.machine_counters mr
       WHERE mr.machine_id = mc.machine_id AND mr.status = 'actif' AND mr.is_replacement_start AND mr.recorded_at <= mc.recorded_at) AS epoch_now
  FROM public.machine_counters mc
  WHERE mc.status = 'actif'
  ORDER BY mc.machine_id, mc.recorded_at DESC
)
SELECT
  lc.machine_id, m.marque, m.modele, lc.part_id, p.name AS part_name,
  lc.changed_at                          AS last_change_at,
  (cc.counter_now - lc.counter_at_change) AS copies_since_change,
  eff.expected_yield_total, eff.yield_source, eff.historical_samples AS samples
FROM last_change lc
JOIN public.machines m         ON m.numero_serie = lc.machine_id
JOIN current_counter cc        ON cc.machine_id = lc.machine_id AND cc.epoch_now = lc.epoch_at_change
LEFT JOIN public.parts p       ON p.id = lc.part_id
LEFT JOIN public.v_part_yield_effective eff
       ON eff.marque = m.marque AND eff.modele = m.modele AND eff.part_id = lc.part_id
WHERE cc.counter_now IS NOT NULL AND lc.counter_at_change IS NOT NULL;

GRANT SELECT ON public.v_machine_part_consumption TO authenticated;
