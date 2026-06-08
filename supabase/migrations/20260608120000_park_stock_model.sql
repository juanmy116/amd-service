-- BLOQUE A — Modelo de parque y stock (base del core de facturación)
-- Plan: docs/plan-correccion-core-facturacion-2026-06-08.md §Bloque A
--
-- Decisiones (confirmadas por el dueño, 2026-06-08):
--  * Estado alquilada/stock DERIVADO de contract_machines (una sola fuente de verdad):
--      alquilada ⟺ existe línea con date_fin IS NULL ; en stock ⟺ ninguna línea abierta.
--    NO se materializa un campo de estado en machines (evita desincronización — es dinero).
--  * Dos motivos de retirada (regla 5):
--      (a) resiliación  → return_machine_to_stock: cierra la línea con su end_counter real,
--          la máquina vuelve al stock. NO encadena, NO factura mientras está en stock.
--      (b) reparación en taller → replace_contract_machine (ya existe): encadena el puesto.
--  * Asignar desde stock (rotación de parque, cliente nuevo): assign_machine_from_stock
--    EXIGE la lectura real del contador (regla 3) como start_counter. NO encadena.
--
-- machine_counters NO se toca: los puntos de corte (start/end) viven en la línea
-- contract_machines, así que el índice machine_counters_one_active_per_month nunca colisiona
-- aunque haya rotación A→stock→B dentro del mismo mes.

BEGIN;

-- ────────────────────────────────────────────────────────────────────────────
-- 1) Vista del parque DERIVADA. Única fuente de verdad = contract_machines.
--    security_invoker=true → respeta la RLS de las tablas base según el rol que consulta.
-- ────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE VIEW public.v_machine_park
WITH (security_invoker = true) AS
SELECT
  m.numero_serie,
  m.marque,
  m.modele,
  m.type,
  m.localisation,
  m.active,
  (cm.id IS NOT NULL)  AS louee,          -- TRUE = alquilada ; FALSE = en stock
  cm.id                AS open_line_id,
  cm.contract_id       AS open_contract_id,
  cm.date_debut        AS open_date_debut,
  c.numero_contrat     AS numero_contrat,
  c.client_id          AS client_id
FROM public.machines m
LEFT JOIN public.contract_machines cm
  ON cm.machine_id = m.numero_serie AND cm.date_fin IS NULL
LEFT JOIN public.contracts c
  ON c.id = cm.contract_id;

COMMENT ON VIEW public.v_machine_park IS
  'Estado del parque DERIVADO (Bloque A): louee = la máquina tiene una línea contract_machines con date_fin IS NULL; en stock = no tiene ninguna línea abierta. Única fuente de verdad: contract_machines.';

REVOKE ALL ON public.v_machine_park FROM PUBLIC, anon;
GRANT SELECT ON public.v_machine_park TO authenticated, service_role;

-- ────────────────────────────────────────────────────────────────────────────
-- 2) RPC return_machine_to_stock — motivo (a) resiliación.
--    Cierra la línea del cliente con su end_counter REAL (lectura al retirar) y la deja
--    sin date_fin → la máquina queda en stock. NO crea línea nueva, NO encadena.
--    p_payload: { cm_id, date, end_counter_bw, end_counter_color }
-- ────────────────────────────────────────────────────────────────────────────
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

  -- El cierre no puede ser inferior a la mayor lectura conocida de la línea (último relevé
  -- normal o su propio start_counter si nació de un reemplazo en el mismo mes sin relevé aún).
  SELECT counter_bw, counter_color INTO v_ref_bw, v_ref_color
  FROM public.machine_counters
  WHERE machine_id = v_cm.machine_id AND status = 'actif'
  ORDER BY year DESC, month DESC, recorded_at DESC
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

-- ────────────────────────────────────────────────────────────────────────────
-- 3) RPC assign_machine_from_stock — rotación de parque (cliente nuevo).
--    La máquina debe estar EN STOCK (sin línea abierta). EXIGE start_counter real (regla 3).
--    Abre una línea NUEVA, NO encadenada (replaces_contract_machine_id = NULL): es un alquiler
--    independiente, no un reemplazo.
--    p_payload: { contract_id, machine_id, date_debut, start_counter_bw, start_counter_color,
--                 billing_plan_id?, price_bw_override?, price_color_override?, fixed_fee_override?,
--                 billing_day_override?, maintenance_frequency_override?, notes? }
-- ────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.assign_machine_from_stock(p_payload jsonb)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_contract_id uuid := (p_payload->>'contract_id')::uuid;
  v_machine_id  text := p_payload->>'machine_id';
  v_date        date := (p_payload->>'date_debut')::date;
  v_start_bw    int  := (p_payload->>'start_counter_bw')::int;
  v_start_color int  := (p_payload->>'start_counter_color')::int;
  v_bill_day    int  := NULLIF(p_payload->>'billing_day_override','')::int;
  v_new_id      uuid;
BEGIN
  IF auth.role() <> 'service_role' THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  IF v_contract_id IS NULL OR v_machine_id IS NULL OR v_machine_id = '' OR v_date IS NULL THEN
    RAISE EXCEPTION 'invalid_payload';
  END IF;
  -- regla 3: lectura real obligatoria al asignar desde stock (puede no ser 0)
  IF v_start_bw IS NULL OR v_start_color IS NULL THEN
    RAISE EXCEPTION 'start_counter_required';
  END IF;
  IF v_start_bw < 0 OR v_start_color < 0 THEN
    RAISE EXCEPTION 'invalid_payload';
  END IF;
  IF v_bill_day IS NOT NULL AND (v_bill_day < 1 OR v_bill_day > 31) THEN
    RAISE EXCEPTION 'invalid_billing_day';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.machines WHERE numero_serie = v_machine_id) THEN
    RAISE EXCEPTION 'machine_not_found';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.contracts WHERE id = v_contract_id) THEN
    RAISE EXCEPTION 'contract_not_found';
  END IF;
  -- La máquina debe estar en stock (sin línea abierta). El índice único one_open_per_machine
  -- es la red de seguridad última; aquí damos un error explícito y legible.
  IF EXISTS (
    SELECT 1 FROM public.contract_machines
    WHERE machine_id = v_machine_id AND date_fin IS NULL
  ) THEN
    RAISE EXCEPTION 'machine_busy';
  END IF;

  INSERT INTO public.contract_machines (
    contract_id, machine_id, date_debut, statut, replaces_contract_machine_id,
    billing_plan_id, price_bw_override, price_color_override, fixed_fee_override,
    billing_day_override, maintenance_frequency_override, notes,
    start_counter_bw, start_counter_color
  ) VALUES (
    v_contract_id, v_machine_id, v_date, 'actif', NULL,   -- NO encadena: alquiler independiente
    NULLIF(p_payload->>'billing_plan_id','')::uuid,
    NULLIF(p_payload->>'price_bw_override','')::numeric,
    NULLIF(p_payload->>'price_color_override','')::numeric,
    NULLIF(p_payload->>'fixed_fee_override','')::numeric,
    v_bill_day,
    NULLIF(p_payload->>'maintenance_frequency_override',''),
    NULLIF(p_payload->>'notes',''),
    v_start_bw, v_start_color
  ) RETURNING id INTO v_new_id;

  RETURN v_new_id;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.assign_machine_from_stock(jsonb) FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.assign_machine_from_stock(jsonb) TO service_role;

COMMIT;
