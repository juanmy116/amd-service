-- Hotfix Fase 3: cierre de mantenimiento atómico, idempotente y con RLS correcta.
-- Reemplaza la secuencia de operaciones sueltas de closeMaintenance por una transacción única.
-- Patrón de seguridad: SECURITY DEFINER + guard service_role (igual que Fase 2).

CREATE OR REPLACE FUNCTION close_maintenance_visit(
  p_visit_id      uuid,
  p_serie         text,
  p_done_by       uuid,
  p_notes         text,
  p_part_ids      int[],
  p_autres_pieces text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_machine_id   text;
  v_plan_id      uuid;
  v_cm_id        uuid;
  v_scheduled    date;
  v_freq_over    text;
  v_plan_freq    text;
  v_eff_freq     text;
  v_days         int;
  v_next         date;
  v_rows         int;
  v_part         int;
  v_marque       text;
  v_modele       text;
  v_numero_serie text;
  v_client       text;
  v_parts_count  int := 0;
BEGIN
  IF auth.role() <> 'service_role' THEN
    RAISE EXCEPTION 'permission_denied';
  END IF;

  SELECT
    cm.machine_id, mv.plan_id, mv.contract_machine_id, mv.scheduled_date,
    cm.maintenance_frequency_override, mp.frequency,
    m.marque, m.modele, m.numero_serie, cl.nom_client
  INTO
    v_machine_id, v_plan_id, v_cm_id, v_scheduled,
    v_freq_over, v_plan_freq,
    v_marque, v_modele, v_numero_serie, v_client
  FROM maintenance_visits mv
  JOIN contract_machines cm ON cm.id = mv.contract_machine_id
  JOIN maintenance_plans  mp ON mp.id = mv.plan_id
  JOIN machines  m  ON m.numero_serie = cm.machine_id
  JOIN contracts c  ON c.id = cm.contract_id
  LEFT JOIN clients cl ON cl.id = c.client_id
  WHERE mv.id = p_visit_id;

  IF v_machine_id IS NULL THEN
    RAISE EXCEPTION 'visit_not_found';
  END IF;

  IF v_machine_id <> p_serie THEN
    RAISE EXCEPTION 'visit_not_found';
  END IF;

  UPDATE maintenance_visits
    SET status = 'fait', done_at = now(), done_by = p_done_by,
        qr_verified = true, notes = p_notes
    WHERE id = p_visit_id AND status <> 'fait';
  GET DIAGNOSTICS v_rows = ROW_COUNT;
  IF v_rows = 0 THEN
    RAISE EXCEPTION 'already_closed';
  END IF;

  IF p_part_ids IS NOT NULL THEN
    FOREACH v_part IN ARRAY p_part_ids LOOP
      INSERT INTO maintenance_parts (visit_id, part_id, quantity)
        VALUES (p_visit_id, v_part, 1);
      v_parts_count := v_parts_count + 1;
    END LOOP;
  END IF;
  IF p_autres_pieces IS NOT NULL AND length(trim(p_autres_pieces)) > 0 THEN
    INSERT INTO maintenance_parts (visit_id, description, quantity)
      VALUES (p_visit_id, p_autres_pieces, 1);
    v_parts_count := v_parts_count + 1;
  END IF;

  v_eff_freq := COALESCE(v_freq_over, v_plan_freq);
  v_days := CASE WHEN v_eff_freq = 'mensuel' THEN 30 ELSE 90 END;
  v_next := v_scheduled + v_days;

  INSERT INTO maintenance_visits (plan_id, contract_machine_id, scheduled_date, status)
    VALUES (v_plan_id, v_cm_id, v_next, 'planifié');

  RETURN jsonb_build_object(
    'ok',           true,
    'next_date',    v_next,
    'marque',       v_marque,
    'modele',       v_modele,
    'numero_serie', v_numero_serie,
    'client',       v_client,
    'parts_count',  v_parts_count
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION close_maintenance_visit(uuid, text, uuid, text, int[], text) FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION close_maintenance_visit(uuid, text, uuid, text, int[], text) TO service_role;
