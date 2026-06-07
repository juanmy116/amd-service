-- supabase/migrations/20260606000200_machine_replacement.sql
-- FASE D — Política de reemplazo de máquina a mitad de mes.
-- Se factura el PUESTO DE SERVICIO, no la máquina física: cuando una máquina sustituye
-- a otra en un contrato, ambas líneas se encadenan y su consumo se consolida en la factura.

-- Encadenado del puesto de servicio: la línea entrante apunta a la saliente.
ALTER TABLE public.contract_machines
  ADD COLUMN replaces_contract_machine_id uuid NULL
    REFERENCES public.contract_machines(id) ON DELETE SET NULL;

CREATE INDEX idx_cm_replaces ON public.contract_machines (replaces_contract_machine_id)
  WHERE replaces_contract_machine_id IS NOT NULL;

COMMENT ON COLUMN public.contract_machines.replaces_contract_machine_id IS
  'Línea saliente a la que sustituye esta línea (encadenado del puesto de servicio). NULL = línea inicial.';

-- Marca de factura que incluyó al menos un puesto con reemplazo en el periodo.
ALTER TABLE public.invoices
  ADD COLUMN has_replacement boolean NOT NULL DEFAULT false;

-- ----------------------------------------------------------------------------
-- RPC transaccional de reemplazo. Cierra la línea saliente (con relevé de cierre A_out)
-- y abre la entrante (con relevé inicial B_in, is_replacement_start). Todo atómico.
-- Patrón create_contract_with_lines: SECURITY DEFINER + guard service_role + REVOKE.
-- p_payload: { out_cm_id, in_machine_id, date,
--              out_counter_bw, out_counter_color, in_counter_bw, in_counter_color,
--              billing_plan_id?, price_bw_override?, price_color_override?, fixed_fee_override? }
-- Devuelve el id de la nueva línea entrante.
-- ----------------------------------------------------------------------------
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

  -- 3) Abrir la línea entrante encadenada. H1: hereda el plan del puesto si no se pasa otro.
  INSERT INTO public.contract_machines (
    contract_id, machine_id, date_debut, statut, replaces_contract_machine_id,
    billing_plan_id, price_bw_override, price_color_override, fixed_fee_override
  ) VALUES (
    v_out.contract_id, v_in_serie, v_date, 'actif', v_out_id,
    COALESCE(NULLIF(p_payload->>'billing_plan_id','')::uuid, v_out.billing_plan_id),
    NULLIF(p_payload->>'price_bw_override','')::numeric,
    NULLIF(p_payload->>'price_color_override','')::numeric,
    NULLIF(p_payload->>'fixed_fee_override','')::numeric
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

-- ----------------------------------------------------------------------------
-- H6: emit_invoice se actualiza AQUÍ (migración 200) con CREATE OR REPLACE para leer e
-- insertar has_replacement. Editar la migración 100 (ya aplicada) no surtiría efecto.
-- Cuerpo IDÉNTICO al de la 100 salvo: DECLARE v_has_repl + columna has_replacement en el INSERT.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.emit_invoice(p_payload jsonb)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_client_id   bigint := (p_payload->>'client_id')::bigint;   -- clients.id es BIGINT
  v_year        int  := (p_payload->>'period_year')::int;
  v_month       int  := (p_payload->>'period_month')::int;
  v_has_est     bool := COALESCE((p_payload->>'has_estimated')::bool, false);
  v_has_repl    bool := COALESCE((p_payload->>'has_replacement')::bool, false);
  v_confirm     bool := COALESCE((p_payload->>'confirm_estimated')::bool, false);
  v_numero      text;
  v_invoice_id  uuid;
  v_line        jsonb;
BEGIN
  -- Guard: solo service_role (las Server Actions usan admin.rpc)
  IF auth.role() <> 'service_role' THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  IF v_has_est AND NOT v_confirm THEN
    RAISE EXCEPTION 'estimated_not_confirmed';
  END IF;

  -- No duplicar factura emise para el mismo cliente/periodo
  IF EXISTS (
    SELECT 1 FROM public.invoices
    WHERE client_id = v_client_id AND period_year = v_year
      AND period_month = v_month AND status = 'emise'
  ) THEN
    RAISE EXCEPTION 'already_issued';
  END IF;

  v_numero := public.next_invoice_number();

  INSERT INTO public.invoices (
    numero_facture, client_id, client_name, period_year, period_month,
    status, has_estimated, has_replacement, total_amount, issued_by
  ) VALUES (
    v_numero, v_client_id, p_payload->>'client_name', v_year, v_month,
    'emise', v_has_est, v_has_repl, (p_payload->>'total_amount')::numeric, (p_payload->>'issued_by')::uuid
  ) RETURNING id INTO v_invoice_id;

  FOR v_line IN SELECT * FROM jsonb_array_elements(p_payload->'lines')
  LOOP
    INSERT INTO public.invoice_lines (
      invoice_id, contract_id, numero_contrat, machine_id, machine_label,
      plan_name, billing_type, fixed_fee, price_bw, price_color, tiers,
      delta_bw, delta_color, is_estimated,
      amount_fixed, amount_bw, amount_color, amount_total
    ) VALUES (
      v_invoice_id,
      NULLIF(v_line->>'contract_id','')::uuid,
      v_line->>'numero_contrat',
      v_line->>'machine_id',
      v_line->>'machine_label',
      v_line->>'plan_name',
      v_line->>'billing_type',
      NULLIF(v_line->>'fixed_fee','')::numeric,
      NULLIF(v_line->>'price_bw','')::numeric,
      NULLIF(v_line->>'price_color','')::numeric,
      CASE WHEN v_line->'tiers' = 'null'::jsonb THEN NULL ELSE v_line->'tiers' END,
      COALESCE((v_line->>'delta_bw')::int, 0),
      COALESCE((v_line->>'delta_color')::int, 0),
      COALESCE((v_line->>'is_estimated')::bool, false),
      COALESCE((v_line->>'amount_fixed')::numeric, 0),
      COALESCE((v_line->>'amount_bw')::numeric, 0),
      COALESCE((v_line->>'amount_color')::numeric, 0),
      COALESCE((v_line->>'amount_total')::numeric, 0)
    );
  END LOOP;

  RETURN v_invoice_id;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.emit_invoice(jsonb) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.emit_invoice(jsonb) FROM anon;
REVOKE EXECUTE ON FUNCTION public.emit_invoice(jsonb) FROM authenticated;
