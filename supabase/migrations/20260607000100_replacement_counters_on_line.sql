-- supabase/migrations/20260607000100_replacement_counters_on_line.sql
-- Fix H-D5 (rediseño): el modelo de la FASE D insertaba el relevé de cierre de la saliente
-- y el inicial de la entrante como filas de machine_counters, lo que VIOLA el índice
-- machine_counters_one_active_per_month (UNIQUE (machine_id,year,month) WHERE status='actif').
-- Eso hacía imposible: encadenar reemplazos en un mes, reemplazar una máquina con relevé del
-- mes ya registrado, y capturar el consumo de la entrante en su primer mes.
--
-- Rediseño: los contadores de inicio/cierre del reemplazo viven en la línea contract_machines.
-- machine_counters conserva un único relevé mensual normal por máquina (sin colisión).

ALTER TABLE public.contract_machines
  ADD COLUMN start_counter_bw    int CHECK (start_counter_bw    IS NULL OR start_counter_bw    >= 0),
  ADD COLUMN start_counter_color int CHECK (start_counter_color IS NULL OR start_counter_color >= 0),
  ADD COLUMN end_counter_bw      int CHECK (end_counter_bw      IS NULL OR end_counter_bw      >= 0),
  ADD COLUMN end_counter_color   int CHECK (end_counter_color   IS NULL OR end_counter_color   >= 0);

COMMENT ON COLUMN public.contract_machines.start_counter_bw  IS 'Lectura B&N al abrir la línea por reemplazo (punto inicial del consumo). NULL = línea no nacida de reemplazo.';
COMMENT ON COLUMN public.contract_machines.end_counter_bw    IS 'Lectura B&N al cerrar la línea por reemplazo (punto final del consumo). NULL = línea no cerrada por reemplazo.';

-- ----------------------------------------------------------------------------
-- RPC de reemplazo (rediseñada). Cierra la saliente (date_fin + end_counter) y abre la
-- entrante (start_counter), TODO en contract_machines. Ya NO toca machine_counters, así que
-- no puede violar one_active_per_month. Hereda plan + overrides del puesto (H1/H-D1).
-- p_payload: { out_cm_id, in_machine_id, date,
--              out_counter_bw, out_counter_color, in_counter_bw, in_counter_color,
--              billing_plan_id?, price_bw_override?, price_color_override?, fixed_fee_override? }
-- ----------------------------------------------------------------------------
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

  -- Referencia para validar el cierre: la mayor lectura conocida de la saliente, que es el
  -- máximo entre su último relevé normal y su propio start_counter (si nació de un reemplazo
  -- en el mismo mes, aún sin relevé normal). El cierre no puede ser inferior.
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

  -- 2) Abrir la línea entrante encadenada con su contador inicial.
  --    Hereda plan + overrides del puesto si no se pasan (H1 / H-D1).
  INSERT INTO public.contract_machines (
    contract_id, machine_id, date_debut, statut, replaces_contract_machine_id,
    billing_plan_id, price_bw_override, price_color_override, fixed_fee_override,
    start_counter_bw, start_counter_color
  ) VALUES (
    v_out.contract_id, v_in_serie, v_date, 'actif', v_out_id,
    COALESCE(NULLIF(p_payload->>'billing_plan_id','')::uuid,         v_out.billing_plan_id),
    COALESCE(NULLIF(p_payload->>'price_bw_override','')::numeric,    v_out.price_bw_override),
    COALESCE(NULLIF(p_payload->>'price_color_override','')::numeric, v_out.price_color_override),
    COALESCE(NULLIF(p_payload->>'fixed_fee_override','')::numeric,   v_out.fixed_fee_override),
    v_in_bw, v_in_color
  ) RETURNING id INTO v_in_id;

  RETURN v_in_id;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.replace_contract_machine(jsonb) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.replace_contract_machine(jsonb) FROM anon;
REVOKE EXECUTE ON FUNCTION public.replace_contract_machine(jsonb) FROM authenticated;
