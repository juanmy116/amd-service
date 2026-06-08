-- BLOQUE D / P1-7 + P1-8 — el reemplazo conserva las propiedades operativas del puesto.
-- Plan: docs/plan-correccion-core-facturacion-2026-06-08.md §Bloque D, puntos 4 y 5.
--
-- P1-7: la línea entrante de replace_contract_machine heredaba plan + overrides de PRECIO,
--       pero NO billing_day_override, maintenance_frequency_override ni notes → cambio
--       silencioso del día de captura, de la frecuencia de mantenimiento y pérdida de
--       instrucciones operativas. Ahora también se heredan (con override opcional por payload).
-- P1-8: el reemplazo cierra/abre líneas pero dejaba las visitas de mantenimiento FUTURAS
--       apuntando a la línea saliente (máquina retirada al taller) → se programaban
--       mantenimientos sobre una máquina que ya no está. Ahora migran a la línea entrante.
--
-- Cuerpo IDÉNTICO al de 20260607000100 salvo: 3 columnas heredadas en el INSERT entrante y el
-- UPDATE de maintenance_visits al final. machine_counters NO se toca (cortes en la línea, H-D5).

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

  -- Referencia para validar el cierre: la mayor lectura conocida de la saliente.
  SELECT counter_bw, counter_color INTO v_ref_bw, v_ref_color
  FROM public.machine_counters
  WHERE machine_id = v_out.machine_id AND status = 'actif'
  ORDER BY year DESC, month DESC, recorded_at DESC
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
