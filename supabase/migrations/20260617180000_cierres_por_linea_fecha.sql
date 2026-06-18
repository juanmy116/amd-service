-- PR-D.2 (FASE 4) — Cierres por LÍNEA y por FECHA REAL.
-- Spec: docs/superpowers/specs/2026-06-17-contadores-fecha-real-y-linea-design.md §6 «Cierres».
--
-- Las tres RPCs de cierre (return_machine_to_stock, terminate_contract,
-- replace_contract_machine) validan que el contador de cierre no sea inferior a la
-- última lectura real conocida. El modelo viejo elegía «el último contador de la
-- MÁQUINA» con `WHERE machine_id = ... ORDER BY year, month, recorded_at` y SIN
-- límite de fecha. Dos defectos de dinero (nota de Codex en PR-D.1):
--   1) cruzaba líneas: una lectura de OTRA línea de la misma máquina podía servir
--      de referencia (la atribución real es por línea, no por máquina). [P0-3]
--   2) no acotaba por la fecha de cierre: una lectura POSTERIOR a date_fin (captura
--      tardía de un periodo que la línea ya no cubre) hacía RECHAZAR un cierre válido.
--
-- Corrección (idéntica en las tres): la referencia = última lectura ACTIF de la MISMA
-- línea (contract_machine_id) con reading_date <= fecha de cierre, ordenada por
-- (reading_date, recorded_at) DESC. Si la línea no tiene lectura real → su start_counter.
-- Así, una lectura del mismo día que el cierre SÍ cuenta (reading_date <= date_fin):
-- el end_counter no puede ser inferior a ella (regla de oro de Codex).
--
-- Cuerpos idénticos a sus migraciones de origen salvo ese SELECT.

-- ─────────────────────────────────────────────────────────────────────────────
-- 1) return_machine_to_stock  (origen: 20260608120000_park_stock_model.sql)
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.return_machine_to_stock(p_payload jsonb)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_cm_id      uuid := (p_payload->>'cm_id')::uuid;
  v_date       date := (p_payload->>'date')::date;
  v_end_bw     int  := (p_payload->>'end_counter_bw')::int;
  v_end_color  int  := (p_payload->>'end_counter_color')::int;
  v_cm         public.contract_machines%ROWTYPE;
  v_ref_bw     int;
  v_ref_color  int;
BEGIN
  IF auth.role() <> 'service_role' THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  IF v_cm_id IS NULL OR v_date IS NULL THEN
    RAISE EXCEPTION 'invalid_payload';
  END IF;
  -- regla 3/5(a): la retirada exige la lectura real del contador al cerrar
  IF v_end_bw IS NULL OR v_end_color IS NULL THEN
    RAISE EXCEPTION 'end_counter_required';
  END IF;
  IF v_end_bw < 0 OR v_end_color < 0 THEN
    RAISE EXCEPTION 'invalid_payload';
  END IF;

  SELECT * INTO v_cm FROM public.contract_machines WHERE id = v_cm_id FOR UPDATE;
  IF NOT FOUND OR v_cm.date_fin IS NOT NULL THEN
    RAISE EXCEPTION 'line_invalid';
  END IF;
  IF v_date < v_cm.date_debut THEN
    RAISE EXCEPTION 'date_before_debut';
  END IF;

  -- El cierre no puede ser inferior a la última lectura real que el MOTOR atribuye a esta
  -- línea hasta la fecha de cierre (o su start_counter si no hay relevé). Mismo criterio que
  -- countersForLine (src/lib/invoicing.ts): relevé directo de la línea, O relevé legacy sin
  -- atribuir (contract_machine_id NULL) de la misma máquina dentro de la vigencia
  -- (reading_date > date_debut, límite inferior exclusivo, igual que el motor). Si el cierre
  -- no los viera y el motor sí, se cerraría por debajo de una lectura real y se cobraría de menos.
  SELECT counter_bw, counter_color INTO v_ref_bw, v_ref_color
  FROM public.machine_counters
  WHERE status = 'actif'
    AND reading_date <= v_date
    AND ( contract_machine_id = v_cm_id
          OR ( contract_machine_id IS NULL
               AND machine_id = v_cm.machine_id
               AND reading_date > v_cm.date_debut ) )
  ORDER BY reading_date DESC, recorded_at DESC, id DESC
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
   WHERE id = v_cm_id;

  RETURN v_cm_id;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.return_machine_to_stock(jsonb) FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.return_machine_to_stock(jsonb) TO service_role;

-- ─────────────────────────────────────────────────────────────────────────────
-- 2) terminate_contract  (origen: 20260611160000_terminate_contract.sql)
-- ─────────────────────────────────────────────────────────────────────────────
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

    -- La lectura final no puede ser inferior a la última lectura que el MOTOR atribuye a la
    -- línea hasta la fecha de cierre (ni a su start_counter). Mismo criterio que countersForLine:
    -- relevé directo de la línea O legacy NULL de la misma máquina dentro de la vigencia.
    SELECT counter_bw, counter_color INTO v_ref_bw, v_ref_color
      FROM public.machine_counters
      WHERE status = 'actif'
        AND reading_date <= v_date
        AND ( contract_machine_id = v_cm.id
              OR ( contract_machine_id IS NULL
                   AND machine_id = v_cm.machine_id
                   AND reading_date > v_cm.date_debut ) )
      ORDER BY reading_date DESC, recorded_at DESC, id DESC
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

-- ─────────────────────────────────────────────────────────────────────────────
-- 3) replace_contract_machine  (origen: 20260608140000_replace_inherit_overrides_and_maintenance.sql)
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.replace_contract_machine(p_payload jsonb)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_out_id     uuid := (p_payload->>'out_cm_id')::uuid;
  v_in_serie   text := p_payload->>'in_machine_id';
  v_date       date := (p_payload->>'date')::date;
  v_out        public.contract_machines%ROWTYPE;
  v_in_id      uuid;
  v_out_bw     int  := (p_payload->>'out_counter_bw')::int;
  v_out_color  int  := (p_payload->>'out_counter_color')::int;
  v_in_bw      int  := (p_payload->>'in_counter_bw')::int;
  v_in_color   int  := (p_payload->>'in_counter_color')::int;
  v_ref_bw     int;
  v_ref_color  int;
BEGIN
  IF auth.role() <> 'service_role' THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  IF v_out_id IS NULL OR v_in_serie IS NULL OR v_in_serie = '' OR v_date IS NULL THEN
    RAISE EXCEPTION 'invalid_payload';
  END IF;
  IF v_out_bw IS NULL OR v_out_color IS NULL OR v_in_bw IS NULL OR v_in_color IS NULL THEN
    RAISE EXCEPTION 'invalid_payload';
  END IF;
  IF v_out_bw < 0 OR v_out_color < 0 OR v_in_bw < 0 OR v_in_color < 0 THEN
    RAISE EXCEPTION 'invalid_payload';
  END IF;

  -- Bloquea PRIMERO el contrato de la línea saliente y LUEGO la línea, para alinear el
  -- orden de adquisición de locks (contrato → línea) con delete_contract y terminate_contract.
  -- Al abrir la línea entrante (más abajo) la FK toma FOR KEY SHARE sobre contracts; sin este
  -- lock previo, replace adquiría línea → contrato y podía formar deadlock con un
  -- delete_contract concurrente (que adquiere contrato → línea). P2 de concurrencia detectado
  -- por Codex al endurecer los guards (PR-D.3). El subselect lee el contract_id sin lock; si la
  -- línea no existe, el FOR UPDATE de v_out (abajo) produce el out_line_invalid de siempre.
  PERFORM 1 FROM public.contracts
    WHERE id = (SELECT contract_id FROM public.contract_machines WHERE id = v_out_id)
    FOR UPDATE;

  SELECT * INTO v_out FROM public.contract_machines WHERE id = v_out_id FOR UPDATE;
  IF NOT FOUND OR v_out.date_fin IS NOT NULL THEN
    RAISE EXCEPTION 'out_line_invalid';
  END IF;
  IF v_date < v_out.date_debut THEN
    RAISE EXCEPTION 'date_before_debut';
  END IF;

  -- La máquina entrante no puede tener otra línea abierta (también cubre in == out)
  IF EXISTS (
    SELECT 1 FROM public.contract_machines
    WHERE machine_id = v_in_serie AND date_fin IS NULL
  ) THEN
    RAISE EXCEPTION 'in_machine_busy';
  END IF;

  -- Referencia para validar el cierre: la última lectura que el MOTOR atribuye a la línea
  -- SALIENTE hasta la fecha de cierre (o su start_counter). Mismo criterio que countersForLine:
  -- relevé directo de la línea O legacy NULL de la misma máquina dentro de la vigencia.
  SELECT counter_bw, counter_color INTO v_ref_bw, v_ref_color
  FROM public.machine_counters
  WHERE status = 'actif'
    AND reading_date <= v_date
    AND ( contract_machine_id = v_out_id
          OR ( contract_machine_id IS NULL
               AND machine_id = v_out.machine_id
               AND reading_date > v_out.date_debut ) )
  ORDER BY reading_date DESC, recorded_at DESC, id DESC
  LIMIT 1;
  v_ref_bw    := GREATEST(COALESCE(v_ref_bw, 0),    COALESCE(v_out.start_counter_bw, 0));
  v_ref_color := GREATEST(COALESCE(v_ref_color, 0), COALESCE(v_out.start_counter_color, 0));
  IF v_out_bw < v_ref_bw OR v_out_color < v_ref_color THEN
    RAISE EXCEPTION 'closing_counter_too_low';
  END IF;

  -- 1) Cerrar la línea saliente con su contador de cierre
  UPDATE public.contract_machines
     SET date_fin          = v_date,
         statut            = 'terminé',
         end_counter_bw    = v_out_bw,
         end_counter_color = v_out_color
   WHERE id = v_out_id;

  -- 2) Abrir la línea entrante encadenada. P1-7: hereda plan + TODOS los overrides operativos
  --    del puesto (precio, día de facturación, frecuencia de mantenimiento, notas), con
  --    override opcional por payload.
  INSERT INTO public.contract_machines (
    contract_id, machine_id, date_debut, statut, replaces_contract_machine_id,
    billing_plan_id, price_bw_override, price_color_override, fixed_fee_override,
    billing_day_override, maintenance_frequency_override, notes,
    start_counter_bw, start_counter_color
  ) VALUES (
    v_out.contract_id, v_in_serie, v_date, 'actif', v_out_id,
    COALESCE(NULLIF(p_payload->>'billing_plan_id','')::uuid,         v_out.billing_plan_id),
    COALESCE(NULLIF(p_payload->>'price_bw_override','')::numeric,    v_out.price_bw_override),
    COALESCE(NULLIF(p_payload->>'price_color_override','')::numeric, v_out.price_color_override),
    COALESCE(NULLIF(p_payload->>'fixed_fee_override','')::numeric,   v_out.fixed_fee_override),
    COALESCE(NULLIF(p_payload->>'billing_day_override','')::smallint, v_out.billing_day_override),
    COALESCE(NULLIF(p_payload->>'maintenance_frequency_override',''), v_out.maintenance_frequency_override),
    COALESCE(NULLIF(p_payload->>'notes',''),                          v_out.notes),
    v_in_bw, v_in_color
  ) RETURNING id INTO v_in_id;

  -- 3) P1-8: las visitas de mantenimiento FUTURAS y no realizadas de la saliente pasan a la
  --    entrante (el puesto sigue; la máquina retirada va al taller). Las ya 'fait' no se tocan.
  UPDATE public.maintenance_visits
     SET contract_machine_id = v_in_id
   WHERE contract_machine_id = v_out_id
     AND status <> 'fait'
     AND scheduled_date >= v_date;

  RETURN v_in_id;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.replace_contract_machine(jsonb) FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.replace_contract_machine(jsonb) TO service_role;
