-- PR-D.3 (FASE 4) — guards por LÍNEA.
-- Spec 2026-06-17-contadores-fecha-real-y-linea-design.md §6 «Guards».
--
-- delete_contract y el guard de cambio de cliente (update_contract_with_lines)
-- contaban el historial de lecturas SOLO por `machine_counters.contract_id`. Con el
-- rediseño la atribución canónica de una lectura pasa a la LÍNEA
-- (`contract_machine_id`), columna que puede estar poblada con `contract_id NULL`
-- — exactamente lo que produce Princity (ver P0-1b de PR-D.2). Esa lectura era
-- invisible a ambos guards:
--   - delete_contract: contaba 0 contadores → DELETE → la cascada a contract_machines
--     choca con la FK machine_counters.contract_machine_id (ON DELETE RESTRICT) → la
--     transacción aborta con un error de FK crudo (el guard «mintió»: prometió borrable).
--   - cambio de cliente: no veía historial → permitía reasignar el contrato a otro
--     cliente → las facturas futuras de esa línea se cobrarían al cliente equivocado.
--
-- Fix (simétrico al P0-1b de PR-D.2): ambos guards cuentan también las lecturas atadas
-- por contract_machine_id a una línea del contrato. El OR no duplica la cuenta:
-- count(*) sobre el predicado es una fila por contador, lo cumpla por una vía u otra.
--
-- CREATE OR REPLACE sobre las versiones vigentes:
--   - delete_contract:           20260611120000_delete_contract_atomic.sql
--   - update_contract_with_lines: 20260610101000_update_contract_lines_counter_guards.sql
-- (resto del cuerpo idéntico; solo cambia el conteo/EXISTS de machine_counters).

-- ─────────────────────────────────────────────────────────────────────────────
-- 1) delete_contract
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.delete_contract(p_contract_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE
  v_incidents   int;
  v_counters    int;
  v_maintenance int;
  v_invoices    int;
BEGIN
  IF auth.role() <> 'service_role' THEN
    RAISE EXCEPTION 'permission_denied';
  END IF;

  -- Serializa con otros borrados del mismo contrato.
  PERFORM 1 FROM contracts WHERE id = p_contract_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('deleted', false, 'not_found', true);
  END IF;

  SELECT count(*) INTO v_incidents
    FROM incidents
    WHERE contract_machine_id IN (SELECT id FROM contract_machines WHERE contract_id = p_contract_id);

  -- Por contrato (legacy) O por línea (atribución canónica del rediseño; incluye las
  -- lecturas con contract_id NULL que Princity ata solo por contract_machine_id).
  SELECT count(*) INTO v_counters
    FROM machine_counters
    WHERE contract_id = p_contract_id
       OR contract_machine_id IN (SELECT id FROM contract_machines WHERE contract_id = p_contract_id);

  SELECT count(*) INTO v_maintenance
    FROM maintenance_plans WHERE contract_id = p_contract_id;

  -- Facturas: invoices.contract_id es FK RESTRICT → sin este guard, un contrato facturado
  -- pasaría las otras comprobaciones (p.ej. factura solo-fijo sin lecturas) y el DELETE
  -- abortaría con un error de FK crudo. Además, una factura es un registro contable
  -- INMUTABLE: un contrato con CUALQUIER factura (emise o annulee) nunca debe borrarse.
  SELECT count(*) INTO v_invoices
    FROM invoices WHERE contract_id = p_contract_id;

  IF v_incidents > 0 OR v_counters > 0 OR v_maintenance > 0 OR v_invoices > 0 THEN
    RETURN jsonb_build_object(
      'deleted',     false,
      'incidents',   v_incidents,
      'counters',    v_counters,
      'maintenance', v_maintenance,
      'invoices',    v_invoices
    );
  END IF;

  -- Cascadea a contract_machines y demás hijas con ON DELETE CASCADE.
  DELETE FROM contracts WHERE id = p_contract_id;

  RETURN jsonb_build_object('deleted', true);
END;
$$;

REVOKE ALL    ON FUNCTION public.delete_contract(uuid) FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.delete_contract(uuid) TO service_role;

-- ─────────────────────────────────────────────────────────────────────────────
-- 2) update_contract_with_lines  (solo cambia el guard P1-4 de cambio de cliente)
-- ─────────────────────────────────────────────────────────────────────────────
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
  v_lfin        date;
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
  -- WP-2 (corrección 2): además, rechazar el retiro de una línea YA cerrada (date_fin not null).
  FOR v_ritem IN SELECT * FROM jsonb_array_elements(v_retire) LOOP
    SELECT date_debut, date_fin, contract_id INTO v_ldebut, v_lfin, v_lcontract
      FROM contract_machines WHERE id = (v_ritem->>'id')::uuid;
    IF v_lcontract IS NULL OR v_lcontract <> p_contract_id THEN
      RAISE EXCEPTION 'line_not_in_contract';
    END IF;
    IF v_lfin IS NOT NULL THEN
      RAISE EXCEPTION 'line_already_closed';
    END IF;
  END LOOP;

  -- P1-4 (guard del motor): bloquear cambio de cliente si el contrato ya tiene historial.
  -- PR-D.3: el historial de contadores se mira por contract_id (legacy) O por línea
  -- (contract_machine_id), porque la atribución canónica pasó a la línea y Princity ata
  -- lecturas con contract_id NULL solo por contract_machine_id.
  SELECT client_id INTO v_old_client FROM contracts WHERE id = p_contract_id;
  v_new_client := (payload->>'client_id')::bigint;
  IF v_old_client IS DISTINCT FROM v_new_client THEN
    IF EXISTS (SELECT 1 FROM invoice_lines WHERE contract_id = p_contract_id)
       OR EXISTS (
         SELECT 1 FROM machine_counters
         WHERE contract_id = p_contract_id
            OR contract_machine_id IN (SELECT id FROM contract_machines WHERE contract_id = p_contract_id)
       ) THEN
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

  -- Insertar líneas nuevas (sin id).
  -- WP-2 (corrección 1): persistir start_counter_bw/color (antes se perdían).
  BEGIN
    INSERT INTO contract_machines (
      contract_id, machine_id, date_debut, statut,
      billing_day_override, maintenance_frequency_override, notes,
      billing_plan_id, price_bw_override, price_color_override, fixed_fee_override,
      start_counter_bw, start_counter_color
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
      NULLIF(elem->>'fixed_fee_override','')::numeric,
      NULLIF(elem->>'start_counter_bw','')::int,
      NULLIF(elem->>'start_counter_color','')::int
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

  -- Retirar líneas con date_fin explícita (pertenencia y "no ya cerrada" validadas arriba).
  -- WP-2 (corrección 3): persistir end_counter_bw/color si llegan en el payload (antes se ignoraban).
  FOR v_ritem IN SELECT * FROM jsonb_array_elements(v_retire) LOOP
    SELECT date_debut INTO v_ldebut
      FROM contract_machines WHERE id = (v_ritem->>'id')::uuid;
    IF (v_ritem->>'date_fin')::date < v_ldebut THEN
      RAISE EXCEPTION 'invalid_date_fin';
    END IF;
    UPDATE contract_machines SET
      date_fin         = (v_ritem->>'date_fin')::date,
      statut           = 'terminé'::contract_machine_status,
      end_counter_bw   = COALESCE(NULLIF(v_ritem->>'end_counter_bw','')::int,    end_counter_bw),
      end_counter_color= COALESCE(NULLIF(v_ritem->>'end_counter_color','')::int, end_counter_color)
    WHERE id = (v_ritem->>'id')::uuid AND contract_id = p_contract_id;
  END LOOP;

  RETURN jsonb_build_object('ok', true, 'contract_id', p_contract_id);
END;
$$;

REVOKE EXECUTE ON FUNCTION update_contract_with_lines(uuid, jsonb)  FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION update_contract_with_lines(uuid, jsonb)  TO service_role;
