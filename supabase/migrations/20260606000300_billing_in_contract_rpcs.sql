-- supabase/migrations/20260606000300_billing_in_contract_rpcs.sql
-- Task 8: persistir billing_plan_id + overrides por línea de máquina.
-- Las líneas viajan como JSON en el payload de las RPC de contratos, así que se añaden
-- los 4 campos nuevos a los INSERT/UPDATE de contract_machines (mismo patrón que billing_day_override).
-- CREATE OR REPLACE de las dos RPC existentes (cuerpo idéntico salvo las columnas billing).

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
    INSERT INTO contract_machines (
      contract_id, machine_id, date_debut, statut,
      billing_day_override, maintenance_frequency_override, notes,
      billing_plan_id, price_bw_override, price_color_override, fixed_fee_override
    )
    SELECT
      v_contract_id,
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

  -- Actualizar líneas existentes (SOLO campos mutables, nunca machine_id)
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

REVOKE EXECUTE ON FUNCTION create_contract_with_lines(jsonb)        FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION update_contract_with_lines(uuid, jsonb)  FROM PUBLIC, anon, authenticated;
