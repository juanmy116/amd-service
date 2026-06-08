-- BLOQUE B / P0-4 — punto inicial explícito de la línea al crear el contrato.
-- Plan: docs/plan-correccion-core-facturacion-2026-06-08.md §Bloque B, punto 2.
--
-- Problema: una línea que empieza dentro del mes sin start_counter facturaba "0 estimado" su
-- primer mes y el mes siguiente tomaba la lectura final como base → las copias del primer mes
-- se perdían para siempre. computeLineConsumption ya USA start_counter cuando existe; faltaba
-- que la RPC de creación de contrato lo persistiera.
--
-- Alcance deliberado: SOLO create_contract_with_lines (creación de contrato nuevo).
--  * Añadir una máquina a un contrato EXISTENTE desde stock ya tiene su RPC con lectura
--    obligatoria: assign_machine_from_stock (Bloque A).
--  * update_contract_with_lines NO se toca aquí: lo reescriben el Bloque C (P0-6, pertenencia
--    de líneas) y el Bloque D (P1-4, cambio de cliente). Evitar dos CREATE OR REPLACE en
--    paralelo sobre la misma función (uno machacaría al otro). Coordinación de timestamps:
--    docs/plan §Reglas de integridad, banda motor 20260608_12xxxx–15xxxx.
--
-- start_counter es OPCIONAL en el payload (NULLIF): la UI lo cablea por separado (Claude #2,
-- ContractForm). Sin él, el primer mes sigue marcándose estimado (visible), nunca pérdida
-- silenciosa. Cuerpo IDÉNTICO al de 20260606000300 salvo las 2 columnas start_counter.

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
      billing_plan_id, price_bw_override, price_color_override, fixed_fee_override,
      start_counter_bw, start_counter_color
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
      NULLIF(elem->>'fixed_fee_override','')::numeric,
      NULLIF(elem->>'start_counter_bw','')::int,      -- P0-4: punto inicial explícito
      NULLIF(elem->>'start_counter_color','')::int
    FROM jsonb_array_elements(v_lines) elem;
  EXCEPTION WHEN unique_violation THEN
    RAISE EXCEPTION 'machine_already_assigned';
  END;

  RETURN jsonb_build_object('ok', true, 'contract_id', v_contract_id);
END;
$$;

REVOKE EXECUTE ON FUNCTION create_contract_with_lines(jsonb) FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION create_contract_with_lines(jsonb) TO service_role;
