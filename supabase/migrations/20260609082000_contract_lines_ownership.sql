-- BLOQUE C / P0-6 — update_contract_with_lines: toda operación por id de línea exige
-- pertenencia al contrato (contract_id = p_contract_id). Falla explícito ante IDs cruzados.
-- Plan: docs/plan-correccion-core-facturacion-2026-06-08.md §Bloque C, punto 3.
--
-- Antes: la RPC buscaba/actualizaba/retiraba líneas por id desde el JSON sin verificar a qué
-- contrato pertenecen → un payload manipulado o un form viejo con el UUID de una línea de OTRO
-- contrato podía editar tarifas/fechas/notas o terminar una línea ajena (corrupción cruzada).
--
-- ⚠️ CAMPO COMPARTIDO: el motor ya reescribió esta función (Bloque D, 20260608140100) para
-- añadir el guard P1-4 (bloquear cambio de cliente con historial). Esta migración construye
-- SOBRE esa versión (CREATE OR REPLACE conservando el guard P1-4) y solo añade los checks P0-6.

CREATE OR REPLACE FUNCTION update_contract_with_lines(p_contract_id uuid, payload jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_lines       jsonb;
  v_retire      jsonb;
  v_line        jsonb;
  v_ritem       jsonb;
  v_billing_day int;
  v_line_bill   int;
  v_total       int;
  v_distinct    int;
  v_existing    text;
  v_ldebut      date;
  v_lcontract   uuid;
  v_old_client  bigint;
  v_new_client  bigint;
BEGIN
  IF auth.role() <> 'service_role' THEN
    RAISE EXCEPTION 'permission_denied';
  END IF;

  v_lines  := COALESCE(payload->'lines',  '[]'::jsonb);
  v_retire := COALESCE(payload->'retire', '[]'::jsonb);

  v_billing_day := NULLIF(payload->>'billing_day','')::int;
  IF v_billing_day IS NOT NULL AND (v_billing_day < 1 OR v_billing_day > 31) THEN
    RAISE EXCEPTION 'invalid_billing_day';
  END IF;

  FOR v_line IN SELECT * FROM jsonb_array_elements(v_lines) LOOP
    v_line_bill := NULLIF(v_line->>'billing_day_override','')::int;
    IF v_line_bill IS NOT NULL AND (v_line_bill < 1 OR v_line_bill > 31) THEN
      RAISE EXCEPTION 'invalid_billing_day';
    END IF;
  END LOOP;

  SELECT count(*), count(DISTINCT elem->>'machine_id')
    INTO v_total, v_distinct
    FROM jsonb_array_elements(v_lines) elem;
  IF v_total <> v_distinct THEN
    RAISE EXCEPTION 'duplicate_machine_in_payload';
  END IF;

  -- P0-6 + machine_id inmutable: para cada línea EXISTENTE (con id), comprobar que pertenece a
  -- ESTE contrato y que no se intenta cambiar su machine_id. Un id de otro contrato → error.
  FOR v_line IN SELECT * FROM jsonb_array_elements(v_lines) LOOP
    IF NULLIF(v_line->>'id','') IS NOT NULL THEN
      SELECT machine_id, contract_id INTO v_existing, v_lcontract
        FROM contract_machines WHERE id = (v_line->>'id')::uuid;
      IF v_lcontract IS NULL OR v_lcontract <> p_contract_id THEN
        RAISE EXCEPTION 'line_not_in_contract';
      END IF;
      IF v_existing IS DISTINCT FROM (v_line->>'machine_id') THEN
        RAISE EXCEPTION 'machine_id_immutable';
      END IF;
    END IF;
  END LOOP;

  -- P0-6: las líneas a retirar también deben pertenecer a este contrato.
  FOR v_ritem IN SELECT * FROM jsonb_array_elements(v_retire) LOOP
    SELECT date_debut, contract_id INTO v_ldebut, v_lcontract
      FROM contract_machines WHERE id = (v_ritem->>'id')::uuid;
    IF v_lcontract IS NULL OR v_lcontract <> p_contract_id THEN
      RAISE EXCEPTION 'line_not_in_contract';
    END IF;
  END LOOP;

  -- P1-4 (guard del motor): bloquear cambio de cliente si el contrato ya tiene historial.
  SELECT client_id INTO v_old_client FROM contracts WHERE id = p_contract_id;
  v_new_client := (payload->>'client_id')::bigint;
  IF v_old_client IS DISTINCT FROM v_new_client THEN
    IF EXISTS (SELECT 1 FROM invoice_lines    WHERE contract_id = p_contract_id)
       OR EXISTS (SELECT 1 FROM machine_counters WHERE contract_id = p_contract_id) THEN
      RAISE EXCEPTION 'client_change_forbidden_history';
    END IF;
  END IF;

  UPDATE contracts SET
    client_id            = (payload->>'client_id')::bigint,
    date_debut           = (payload->>'date_debut')::date,
    date_renouvellement  = NULLIF(payload->>'date_renouvellement','')::date,
    statut               = (payload->>'statut')::contract_status,
    billing_day          = v_billing_day,
    maintenance_frequency = NULLIF(payload->>'maintenance_frequency','')
  WHERE id = p_contract_id;

  -- Insertar líneas nuevas (sin id)
  BEGIN
    INSERT INTO contract_machines (
      contract_id, machine_id, date_debut, statut,
      billing_day_override, maintenance_frequency_override, notes,
      billing_plan_id, price_bw_override, price_color_override, fixed_fee_override
    )
    SELECT
      p_contract_id,
      elem->>'machine_id',
      (elem->>'date_debut')::date,
      'actif'::contract_machine_status,
      NULLIF(elem->>'billing_day_override','')::int,
      NULLIF(elem->>'maintenance_frequency_override',''),
      NULLIF(elem->>'notes',''),
      NULLIF(elem->>'billing_plan_id','')::uuid,
      NULLIF(elem->>'price_bw_override','')::numeric,
      NULLIF(elem->>'price_color_override','')::numeric,
      NULLIF(elem->>'fixed_fee_override','')::numeric
    FROM jsonb_array_elements(v_lines) elem
    WHERE NULLIF(elem->>'id','') IS NULL;
  EXCEPTION WHEN unique_violation THEN
    RAISE EXCEPTION 'machine_already_assigned';
  END;

  -- Actualizar líneas existentes (SOLO campos mutables, nunca machine_id).
  -- P0-6: el WHERE incluye contract_id = p_contract_id como red de seguridad redundante.
  FOR v_line IN SELECT * FROM jsonb_array_elements(v_lines) LOOP
    IF NULLIF(v_line->>'id','') IS NOT NULL THEN
      UPDATE contract_machines SET
        date_debut                     = (v_line->>'date_debut')::date,
        billing_day_override           = NULLIF(v_line->>'billing_day_override','')::int,
        maintenance_frequency_override = NULLIF(v_line->>'maintenance_frequency_override',''),
        notes                          = NULLIF(v_line->>'notes',''),
        billing_plan_id                = NULLIF(v_line->>'billing_plan_id','')::uuid,
        price_bw_override              = NULLIF(v_line->>'price_bw_override','')::numeric,
        price_color_override           = NULLIF(v_line->>'price_color_override','')::numeric,
        fixed_fee_override             = NULLIF(v_line->>'fixed_fee_override','')::numeric
      WHERE id = (v_line->>'id')::uuid AND contract_id = p_contract_id;
    END IF;
  END LOOP;

  -- Retirar líneas con date_fin explícita (ya validada la pertenencia arriba).
  FOR v_ritem IN SELECT * FROM jsonb_array_elements(v_retire) LOOP
    SELECT date_debut INTO v_ldebut
      FROM contract_machines WHERE id = (v_ritem->>'id')::uuid;
    IF (v_ritem->>'date_fin')::date < v_ldebut THEN
      RAISE EXCEPTION 'invalid_date_fin';
    END IF;
    UPDATE contract_machines SET
      date_fin = (v_ritem->>'date_fin')::date,
      statut   = 'terminé'::contract_machine_status
    WHERE id = (v_ritem->>'id')::uuid AND contract_id = p_contract_id;
  END LOOP;

  RETURN jsonb_build_object('ok', true, 'contract_id', p_contract_id);
END;
$$;

REVOKE EXECUTE ON FUNCTION update_contract_with_lines(uuid, jsonb)  FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION update_contract_with_lines(uuid, jsonb)  TO service_role;
