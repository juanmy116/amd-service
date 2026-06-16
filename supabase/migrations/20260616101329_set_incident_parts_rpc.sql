-- RPC atómico para reemplazar el conjunto de piezas de una incidencia.
-- Sustituye el patrón delete()+insert() no transaccional de la server action:
-- ahora el borrado y la reinserción ocurren en una sola transacción, así un
-- fallo en la inserción no deja la incidencia sin sus piezas.
-- SECURITY INVOKER: respeta las policies RLS existentes de incident_parts
-- (tech_incident_parts_* por incident_id; admin_all_incident_parts).
CREATE OR REPLACE FUNCTION public.set_incident_parts(p_incident_id uuid, p_parts jsonb)
RETURNS void
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
BEGIN
  DELETE FROM public.incident_parts WHERE incident_id = p_incident_id;

  INSERT INTO public.incident_parts (incident_id, part_id, quantity)
  SELECT p_incident_id,
         (elem->>'part_id')::smallint,
         (elem->>'quantity')::int
  FROM jsonb_array_elements(COALESCE(p_parts, '[]'::jsonb)) AS elem;
END;
$$;

REVOKE ALL ON FUNCTION public.set_incident_parts(uuid, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.set_incident_parts(uuid, jsonb) TO authenticated;
