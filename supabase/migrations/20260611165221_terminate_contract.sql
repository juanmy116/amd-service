-- Tarea 8: terminación de contrato con cierre de líneas.
-- Marcar un contrato como 'terminé' NO cerraba sus líneas → la máquina seguía
-- "alquilada" en v_machine_park. Esta RPC cierra TODAS las líneas abiertas del
-- contrato en una transacción, exigiendo la lectura final del contador de cada una
-- (como return_machine_to_stock), y devuelve las máquinas al stock.
--
-- payload: {
--   contract_id: uuid,
--   date: date,                       -- fecha de fin (date_fin de las líneas)
--   lines: [{ cm_id, end_counter_bw, end_counter_color }]  -- una por línea abierta
-- }
-- Exige que `lines` cubra EXACTAMENTE las líneas abiertas del contrato (no se puede
-- terminar dejando una máquina sin lectura). Las visitas de mantenimiento futuras
-- no realizadas de esas líneas se borran (la máquina sale del parque).

CREATE OR REPLACE FUNCTION public.terminate_contract(p_payload jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE
  v_contract_id uuid := (p_payload->>'contract_id')::uuid;
  v_date        date := (p_payload->>'date')::date;
  v_lines       jsonb := p_payload->'lines';
  v_open_count  int;
  v_item        jsonb;
  v_cm          public.contract_machines%ROWTYPE;
  v_end_bw      int;
  v_end_color   int;
  v_ref_bw      int;
  v_ref_color   int;
  v_closed      uuid[] := '{}';
BEGIN
  IF auth.role() <> 'service_role' THEN
    RAISE EXCEPTION 'forbidden';
  END IF;
  IF v_contract_id IS NULL OR v_date IS NULL THEN
    RAISE EXCEPTION 'invalid_payload';
  END IF;

  -- Serializa con otras operaciones sobre el contrato.
  PERFORM 1 FROM public.contracts WHERE id = v_contract_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'contract_not_found';
  END IF;

  -- La lista debe cubrir EXACTAMENTE las líneas abiertas (no dejar ninguna sin lectura).
  SELECT count(*) INTO v_open_count
    FROM public.contract_machines
    WHERE contract_id = v_contract_id AND date_fin IS NULL;
  IF COALESCE(jsonb_array_length(v_lines), 0) <> v_open_count THEN
    RAISE EXCEPTION 'lines_mismatch';
  END IF;

  -- Cierra cada línea con su lectura final (misma validación que return_machine_to_stock).
  FOR v_item IN SELECT * FROM jsonb_array_elements(COALESCE(v_lines, '[]'::jsonb)) LOOP
    v_end_bw    := (v_item->>'end_counter_bw')::int;
    v_end_color := (v_item->>'end_counter_color')::int;
    IF v_end_bw IS NULL OR v_end_color IS NULL THEN
      RAISE EXCEPTION 'end_counter_required';
    END IF;
    IF v_end_bw < 0 OR v_end_color < 0 THEN
      RAISE EXCEPTION 'invalid_payload';
    END IF;

    SELECT * INTO v_cm FROM public.contract_machines
      WHERE id = (v_item->>'cm_id')::uuid FOR UPDATE;
    IF NOT FOUND OR v_cm.contract_id <> v_contract_id OR v_cm.date_fin IS NOT NULL THEN
      RAISE EXCEPTION 'line_invalid';
    END IF;
    IF v_date < v_cm.date_debut THEN
      RAISE EXCEPTION 'date_before_debut';
    END IF;

    -- La lectura final no puede ser inferior al último relevé ni al start_counter.
    SELECT counter_bw, counter_color INTO v_ref_bw, v_ref_color
      FROM public.machine_counters
      WHERE machine_id = v_cm.machine_id AND status = 'actif'
      ORDER BY year DESC, month DESC, recorded_at DESC
      LIMIT 1;
    v_ref_bw    := GREATEST(COALESCE(v_ref_bw,    0), COALESCE(v_cm.start_counter_bw,    0));
    v_ref_color := GREATEST(COALESCE(v_ref_color, 0), COALESCE(v_cm.start_counter_color, 0));
    IF v_end_bw < v_ref_bw OR v_end_color < v_ref_color THEN
      RAISE EXCEPTION 'closing_counter_too_low';
    END IF;

    UPDATE public.contract_machines
       SET date_fin          = v_date,
           statut            = 'terminé',
           end_counter_bw    = v_end_bw,
           end_counter_color = v_end_color
     WHERE id = v_cm.id;
    v_closed := array_append(v_closed, v_cm.id);
  END LOOP;

  -- Marca el contrato como terminado.
  UPDATE public.contracts SET statut = 'terminé' WHERE id = v_contract_id;

  -- Borra las visitas de mantenimiento futuras no realizadas de las líneas cerradas
  -- (la máquina sale del parque; las 'fait' históricas se conservan).
  DELETE FROM public.maintenance_visits
   WHERE contract_machine_id = ANY(v_closed)
     AND status <> 'fait'
     AND scheduled_date >= v_date;

  RETURN jsonb_build_object('terminated', true, 'closed_lines', COALESCE(array_length(v_closed, 1), 0));
END;
$$;

REVOKE ALL ON FUNCTION public.terminate_contract(jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.terminate_contract(jsonb) TO service_role;
