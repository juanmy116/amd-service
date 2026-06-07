-- supabase/migrations/20260607000000_replacement_inherit_overrides.sql
-- Fix H-D1: replace_contract_machine debe heredar los OVERRIDES de precio de la línea
-- saliente, no solo el billing_plan_id. Se factura el "puesto de servicio", así que la
-- tarifa efectiva (incluidos precios negociados vía override) debe mantenerse al sustituir
-- la máquina. Antes los overrides quedaban NULL en la entrante → la factura del puesto
-- usaba el precio base del plan en vez del negociado.
--
-- CREATE OR REPLACE: la migración 200 ya está aplicada; editarla no surte efecto.
-- Cuerpo IDÉNTICO al de la 200 salvo el paso 3 (INSERT de la línea entrante): cada override
-- ahora es COALESCE(<override del payload>, <override de la saliente>).
CREATE OR REPLACE FUNCTION public.replace_contract_machine(p_payload jsonb)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_out_id    uuid := (p_payload->>'out_cm_id')::uuid;
  v_in_serie  text := p_payload->>'in_machine_id';
  v_date      date := (p_payload->>'date')::date;
  v_out       public.contract_machines%ROWTYPE;
  v_in_id     uuid;
  v_last_bw   int;
  v_last_col  int;
  v_client_id bigint;   -- H2: machine_counters.client_id es BIGINT (= contracts.client_id)
BEGIN
  -- Guard: solo service_role (las Server Actions usan admin.rpc). Alineado con emit_invoice.
  IF auth.role() <> 'service_role' THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  -- Validar payload mínimo
  IF v_out_id IS NULL OR v_in_serie IS NULL OR v_in_serie = '' OR v_date IS NULL THEN
    RAISE EXCEPTION 'invalid_payload';
  END IF;

  -- Bloquear y validar la línea saliente (debe existir y estar abierta)
  SELECT * INTO v_out FROM public.contract_machines WHERE id = v_out_id FOR UPDATE;
  IF NOT FOUND OR v_out.date_fin IS NOT NULL THEN
    RAISE EXCEPTION 'out_line_invalid';
  END IF;
  IF v_date < v_out.date_debut THEN
    RAISE EXCEPTION 'date_before_debut';
  END IF;

  -- H2: client_id del contrato para rellenar los relevés (como el flujo normal de contadores)
  SELECT client_id INTO v_client_id FROM public.contracts WHERE id = v_out.contract_id;

  -- La máquina entrante no puede tener otra línea abierta (también cubre in == out)
  IF EXISTS (
    SELECT 1 FROM public.contract_machines
    WHERE machine_id = v_in_serie AND date_fin IS NULL
  ) THEN
    RAISE EXCEPTION 'in_machine_busy';
  END IF;

  -- El relevé de cierre A_out no puede ser menor que el último relevé activo de la saliente
  SELECT counter_bw, counter_color INTO v_last_bw, v_last_col
  FROM public.machine_counters
  WHERE machine_id = v_out.machine_id AND status = 'actif'
  ORDER BY year DESC, month DESC, recorded_at DESC
  LIMIT 1;
  IF v_last_bw IS NOT NULL AND (
       (p_payload->>'out_counter_bw')::int   < v_last_bw OR
       (p_payload->>'out_counter_color')::int < v_last_col
     ) THEN
    RAISE EXCEPTION 'closing_counter_too_low';
  END IF;

  -- 1) Relevé de cierre de la saliente (status 'actif' — CHECK admite actif/annule)
  INSERT INTO public.machine_counters (
    machine_id, contract_id, client_id, year, month, day,
    counter_bw, counter_color, status
  ) VALUES (
    v_out.machine_id, v_out.contract_id, v_client_id,
    EXTRACT(YEAR  FROM v_date)::int,
    EXTRACT(MONTH FROM v_date)::int,
    EXTRACT(DAY   FROM v_date)::int,
    (p_payload->>'out_counter_bw')::int,
    (p_payload->>'out_counter_color')::int,
    'actif'
  );

  -- 2) Cerrar la línea saliente
  UPDATE public.contract_machines
     SET date_fin = v_date, statut = 'terminé'
   WHERE id = v_out_id;

  -- 3) Abrir la línea entrante encadenada.
  -- H1: hereda el plan del puesto si no se pasa otro.
  -- H-D1: hereda TAMBIÉN cada override de la saliente si el payload no lo trae,
  --       para mantener la tarifa efectiva del puesto (precios negociados).
  INSERT INTO public.contract_machines (
    contract_id, machine_id, date_debut, statut, replaces_contract_machine_id,
    billing_plan_id, price_bw_override, price_color_override, fixed_fee_override
  ) VALUES (
    v_out.contract_id, v_in_serie, v_date, 'actif', v_out_id,
    COALESCE(NULLIF(p_payload->>'billing_plan_id','')::uuid,      v_out.billing_plan_id),
    COALESCE(NULLIF(p_payload->>'price_bw_override','')::numeric,    v_out.price_bw_override),
    COALESCE(NULLIF(p_payload->>'price_color_override','')::numeric, v_out.price_color_override),
    COALESCE(NULLIF(p_payload->>'fixed_fee_override','')::numeric,   v_out.fixed_fee_override)
  ) RETURNING id INTO v_in_id;

  -- 4) Relevé inicial de la entrante (reseteo de contador, no facturable como delta propio)
  INSERT INTO public.machine_counters (
    machine_id, contract_id, client_id, year, month, day,
    counter_bw, counter_color, status, is_replacement_start, previous_machine_id
  ) VALUES (
    v_in_serie, v_out.contract_id, v_client_id,
    EXTRACT(YEAR  FROM v_date)::int,
    EXTRACT(MONTH FROM v_date)::int,
    EXTRACT(DAY   FROM v_date)::int,
    (p_payload->>'in_counter_bw')::int,
    (p_payload->>'in_counter_color')::int,
    'actif', true, v_out.machine_id
  );

  RETURN v_in_id;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.replace_contract_machine(jsonb) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.replace_contract_machine(jsonb) FROM anon;
REVOKE EXECUTE ON FUNCTION public.replace_contract_machine(jsonb) FROM authenticated;
