-- Fase 2: RPCs atómicas para contratos.
-- Patrón de seguridad idéntico a 20260517000000_fix_rpc_privilege_escalation.sql:
-- SECURITY DEFINER + guard service_role + REVOKE de roles no privilegiados.
--
-- NOTA (Step 1 producción): NO existe el tipo enum `maintenance_frequency`.
-- Las columnas contracts.maintenance_frequency y
-- contract_machines.maintenance_frequency_override son TEXT en producción,
-- por lo que se insertan/actualizan como texto (sin cast a enum).

-- ─────────────────────────────────────────────────────────────
-- RPC 1: create_contract_with_lines
-- ─────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION create_contract_with_lines(payload jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_contract_id uuid;
  v_lines       jsonb;
  v_line        jsonb;
  v_total       int;
  v_distinct    int;
  v_billing_day int;
  v_line_bill   int;
BEGIN
  IF auth.role() <> 'service_role' THEN
    RAISE EXCEPTION 'permission_denied';
  END IF;

  v_lines := payload->'lines';

  IF v_lines IS NULL OR jsonb_array_length(v_lines) < 1 THEN
    RAISE EXCEPTION 'no_lines';
  END IF;

  SELECT count(*), count(DISTINCT elem->>'machine_id')
    INTO v_total, v_distinct
    FROM jsonb_array_elements(v_lines) elem;
  IF v_total <> v_distinct THEN
    RAISE EXCEPTION 'duplicate_machine_in_payload';
  END IF;

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

  BEGIN
    INSERT INTO contracts (numero_contrat, client_id, date_debut, date_renouvellement, statut, billing_day, maintenance_frequency)
    VALUES (
      payload->>'numero_contrat',
      (payload->>'client_id')::bigint,
      (payload->>'date_debut')::date,
      NULLIF(payload->>'date_renouvellement','')::date,
      (payload->>'statut')::contract_status,
      v_billing_day,
      NULLIF(payload->>'maintenance_frequency','')
    )
    RETURNING id INTO v_contract_id;
  EXCEPTION WHEN unique_violation THEN
    RAISE EXCEPTION 'numero_contrat_exists';
  END;

  BEGIN
    INSERT INTO contract_machines (contract_id, machine_id, date_debut, statut, billing_day_override, maintenance_frequency_override, notes)
    SELECT
      v_contract_id,
      elem->>'machine_id',
      (elem->>'date_debut')::date,
      'actif'::contract_machine_status,
      NULLIF(elem->>'billing_day_override','')::int,
      NULLIF(elem->>'maintenance_frequency_override',''),
      NULLIF(elem->>'notes','')
    FROM jsonb_array_elements(v_lines) elem;
  EXCEPTION WHEN unique_violation THEN
    RAISE EXCEPTION 'machine_already_assigned';
  END;

  RETURN jsonb_build_object('ok', true, 'contract_id', v_contract_id);
END;
$$;

-- ─────────────────────────────────────────────────────────────
-- RPC 2: update_contract_with_lines
-- ─────────────────────────────────────────────────────────────
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

  -- Inmutabilidad de machine_id en líneas existentes
  FOR v_line IN SELECT * FROM jsonb_array_elements(v_lines) LOOP
    IF NULLIF(v_line->>'id','') IS NOT NULL THEN
      SELECT machine_id INTO v_existing
        FROM contract_machines WHERE id = (v_line->>'id')::uuid;
      IF v_existing IS DISTINCT FROM (v_line->>'machine_id') THEN
        RAISE EXCEPTION 'machine_id_immutable';
      END IF;
    END IF;
  END LOOP;

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
    INSERT INTO contract_machines (contract_id, machine_id, date_debut, statut, billing_day_override, maintenance_frequency_override, notes)
    SELECT
      p_contract_id,
      elem->>'machine_id',
      (elem->>'date_debut')::date,
      'actif'::contract_machine_status,
      NULLIF(elem->>'billing_day_override','')::int,
      NULLIF(elem->>'maintenance_frequency_override',''),
      NULLIF(elem->>'notes','')
    FROM jsonb_array_elements(v_lines) elem
    WHERE NULLIF(elem->>'id','') IS NULL;
  EXCEPTION WHEN unique_violation THEN
    RAISE EXCEPTION 'machine_already_assigned';
  END;

  -- Actualizar líneas existentes (SOLO campos mutables, nunca machine_id)
  FOR v_line IN SELECT * FROM jsonb_array_elements(v_lines) LOOP
    IF NULLIF(v_line->>'id','') IS NOT NULL THEN
      UPDATE contract_machines SET
        date_debut                     = (v_line->>'date_debut')::date,
        billing_day_override           = NULLIF(v_line->>'billing_day_override','')::int,
        maintenance_frequency_override = NULLIF(v_line->>'maintenance_frequency_override',''),
        notes                          = NULLIF(v_line->>'notes','')
      WHERE id = (v_line->>'id')::uuid;
    END IF;
  END LOOP;

  -- Retirar líneas con date_fin explícita
  FOR v_ritem IN SELECT * FROM jsonb_array_elements(v_retire) LOOP
    SELECT date_debut INTO v_ldebut
      FROM contract_machines WHERE id = (v_ritem->>'id')::uuid;
    IF (v_ritem->>'date_fin')::date < v_ldebut THEN
      RAISE EXCEPTION 'invalid_date_fin';
    END IF;
    UPDATE contract_machines SET
      date_fin = (v_ritem->>'date_fin')::date,
      statut   = 'terminé'::contract_machine_status
    WHERE id = (v_ritem->>'id')::uuid;
  END LOOP;

  RETURN jsonb_build_object('ok', true, 'contract_id', p_contract_id);
END;
$$;

-- ─────────────────────────────────────────────────────────────
-- RPC 3: can_delete_contract (solo lectura)
-- ─────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION can_delete_contract(p_contract_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_incidents   int;
  v_counters    int;
  v_maintenance int;
BEGIN
  IF auth.role() <> 'service_role' THEN
    RAISE EXCEPTION 'permission_denied';
  END IF;

  SELECT count(*) INTO v_incidents
    FROM incidents
    WHERE contract_id = p_contract_id
       OR contract_machine_id IN (SELECT id FROM contract_machines WHERE contract_id = p_contract_id);

  SELECT count(*) INTO v_counters
    FROM machine_counters WHERE contract_id = p_contract_id;

  SELECT count(*) INTO v_maintenance
    FROM maintenance_plans WHERE contract_id = p_contract_id;

  RETURN jsonb_build_object(
    'can_delete',  (v_incidents = 0 AND v_counters = 0 AND v_maintenance = 0),
    'incidents',   v_incidents,
    'counters',    v_counters,
    'maintenance', v_maintenance
  );
END;
$$;

-- ─────────────────────────────────────────────────────────────
-- Permisos: solo service_role
-- ─────────────────────────────────────────────────────────────
REVOKE EXECUTE ON FUNCTION create_contract_with_lines(jsonb)        FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION update_contract_with_lines(uuid, jsonb)  FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION can_delete_contract(uuid)               FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION create_contract_with_lines(jsonb)        TO service_role;
GRANT EXECUTE ON FUNCTION update_contract_with_lines(uuid, jsonb)  TO service_role;
GRANT EXECUTE ON FUNCTION can_delete_contract(uuid)               TO service_role;
