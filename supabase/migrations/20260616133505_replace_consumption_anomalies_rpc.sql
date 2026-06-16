-- Fix (review holístico): el recálculo de anomalías hacía delete+insert en dos
-- llamadas no transaccionales. Lo hacemos atómico vía RPC (coherente con la
-- decisión de Fase 0 en set_incident_parts): borra las anomalías abiertas de tipo
-- consumo y reinserta el conjunto vigente en una sola transacción.
CREATE OR REPLACE FUNCTION public.replace_consumption_anomalies(p_rows jsonb)
RETURNS void
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
BEGIN
  DELETE FROM public.machine_anomalies
   WHERE status = 'open' AND anomaly_type = 'consumo_alto_sin_cambio';

  INSERT INTO public.machine_anomalies (machine_id, part_id, anomaly_type, light, reason, metrics)
  SELECT
    e->>'machine_id',
    (e->>'part_id')::smallint,
    e->>'anomaly_type',
    e->>'light',
    e->>'reason',
    e->'metrics'
  FROM jsonb_array_elements(COALESCE(p_rows, '[]'::jsonb)) AS e;
END $$;

REVOKE ALL ON FUNCTION public.replace_consumption_anomalies(jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.replace_consumption_anomalies(jsonb) TO service_role;
