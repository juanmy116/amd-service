-- BLOQUE D / P1-4 — cambiar el cliente de un contrato no debe reasignar el historial pasado.
-- Plan: docs/plan-correccion-core-facturacion-2026-06-08.md §Bloque D, punto 2.
--
-- Problema: update_contract_with_lines permitía cambiar contracts.client_id libremente. Las
-- líneas y relevés históricos siguen colgando del contrato → pasan a aparecer/facturarse bajo
-- el cliente nuevo (facturación pendiente de meses pasados al cliente incorrecto).
--
-- Política (confirmada por el dueño): BLOQUEAR el cambio de client_id si el contrato tiene
-- historial (≥1 línea de factura emitida O ≥1 relevé de contador). Se permite solo para
-- corregir un contrato recién creado sin historial. Para un cambio de cliente real → contrato
-- nuevo. Falla explícito con 'client_change_forbidden_history'.
--
-- ⚠️ COORDINACIÓN (regla de integridad del plan): esta función es CAMPO COMPARTIDO.
--   El Bloque C (Claude #2, P0-6: pertenencia de líneas por contract_id) reescribirá también
--   update_contract_with_lines. Como esta migración (banda motor 14xxxx) ya está en main, el
--   Bloque C debe construirse SOBRE esta versión (CREATE OR REPLACE incluyendo este guard
--   P1-4), no machacarla. Quien mergea después incorpora lo anterior. Fix-forward siempre.
--
-- Cuerpo IDÉNTICO al de 20260606000300 salvo: DECLARE v_old_client/v_new_client + el guard P1-4
-- justo antes del UPDATE contracts.

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

  FOR v_line IN SELECT * FROM jsonb_array_elements(v_lines) LOOP
    IF NULLIF(v_line->>'id','') IS NOT NULL THEN
      SELECT machine_id INTO v_existing
        FROM contract_machines WHERE id = (v_line->>'id')::uuid;
      IF v_existing IS DISTINCT FROM (v_line->>'machine_id') THEN
        RAISE EXCEPTION 'machine_id_immutable';
      END IF;
    END IF;
  END LOOP;

  -- P1-4: bloquear cambio de cliente si el contrato ya tiene historial (facturas o relevés).
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

REVOKE EXECUTE ON FUNCTION update_contract_with_lines(uuid, jsonb)  FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION update_contract_with_lines(uuid, jsonb)  TO service_role;
