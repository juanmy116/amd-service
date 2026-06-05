-- supabase/migrations/20260606000100_invoices.sql
-- Sistema de facturación inmutable (Opción B): cabecera por cliente/mes + snapshot por máquina.

-- Numeración FACT-YYYY-NNNN (clon de incident_counters / next_incident_number)
CREATE TABLE IF NOT EXISTS public.invoice_counters (
  year        int  PRIMARY KEY,
  last_number int  NOT NULL DEFAULT 0
);
ALTER TABLE public.invoice_counters ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.next_invoice_number()
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_year int := EXTRACT(YEAR FROM now())::int;
  v_num  int;
BEGIN
  INSERT INTO public.invoice_counters (year, last_number)
       VALUES (v_year, 1)
  ON CONFLICT (year) DO UPDATE
       SET last_number = public.invoice_counters.last_number + 1
  RETURNING last_number INTO v_num;
  RETURN format('FACT-%s-%s', v_year, lpad(v_num::text, 4, '0'));
END;
$$;
REVOKE EXECUTE ON FUNCTION public.next_invoice_number() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.next_invoice_number() FROM anon;
REVOKE EXECUTE ON FUNCTION public.next_invoice_number() FROM authenticated;

-- Cabecera de factura (una por cliente/mes)
CREATE TABLE public.invoices (
  id               uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  numero_facture   text        NOT NULL UNIQUE,
  client_id        bigint      NOT NULL REFERENCES public.clients(id) ON DELETE RESTRICT,  -- clients.id es BIGINT
  client_name      text        NOT NULL,                      -- snapshot
  period_year      int         NOT NULL,
  period_month     int         NOT NULL CHECK (period_month BETWEEN 1 AND 12),
  status           text        NOT NULL DEFAULT 'emise' CHECK (status IN ('emise', 'annulee')),
  has_estimated    boolean     NOT NULL DEFAULT false,
  currency         text        NOT NULL DEFAULT 'XOF',
  total_amount     numeric(14,2) NOT NULL DEFAULT 0,
  issued_by        uuid        REFERENCES public.profiles(id),
  issued_at        timestamptz NOT NULL DEFAULT now(),
  annulled_by      uuid        REFERENCES public.profiles(id),
  annulled_at      timestamptz,
  annulation_reason text,
  created_at       timestamptz NOT NULL DEFAULT now()
);

-- Una sola factura "emise" por cliente y periodo (se puede reemitir tras anular)
CREATE UNIQUE INDEX invoices_client_period_emise_unique
  ON public.invoices (client_id, period_year, period_month)
  WHERE status = 'emise';

ALTER TABLE public.invoices ENABLE ROW LEVEL SECURITY;
CREATE POLICY "invoices_admin_all" ON public.invoices
  FOR ALL TO authenticated
  USING (public.is_admin()) WITH CHECK (public.is_admin());

-- Líneas inmutables (snapshot por máquina)
CREATE TABLE public.invoice_lines (
  id             uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id     uuid        NOT NULL REFERENCES public.invoices(id) ON DELETE CASCADE,
  contract_id    uuid,                                  -- ref informativa
  numero_contrat text        NOT NULL,                  -- snapshot
  machine_id     text,                                  -- ref informativa (numero_serie)
  machine_label  text        NOT NULL,                  -- snapshot "marque modele (serie)"
  plan_name      text        NOT NULL,                  -- snapshot
  billing_type   text        NOT NULL,                  -- snapshot
  fixed_fee      numeric(10,4),                         -- snapshot tarifa efectiva
  price_bw       numeric(10,6),
  price_color    numeric(10,6),
  tiers          jsonb,
  delta_bw       int         NOT NULL DEFAULT 0,
  delta_color    int         NOT NULL DEFAULT 0,
  is_estimated   boolean     NOT NULL DEFAULT false,    -- true si faltaba relevé
  amount_fixed   numeric(14,2) NOT NULL DEFAULT 0,
  amount_bw      numeric(14,2) NOT NULL DEFAULT 0,
  amount_color   numeric(14,2) NOT NULL DEFAULT 0,
  amount_total   numeric(14,2) NOT NULL DEFAULT 0,
  created_at     timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_invoice_lines_invoice ON public.invoice_lines (invoice_id);

ALTER TABLE public.invoice_lines ENABLE ROW LEVEL SECURITY;
CREATE POLICY "invoice_lines_admin_all" ON public.invoice_lines
  FOR ALL TO authenticated
  USING (public.is_admin()) WITH CHECK (public.is_admin());

COMMENT ON TABLE public.invoices      IS 'Facturas emitidas por cliente/mes. Inmutables salvo anulación.';
COMMENT ON TABLE public.invoice_lines IS 'Snapshot inmutable por máquina: tarifa y consumo congelados al emitir.';

-- RPC transaccional de emisión (resuelve N1 atomicidad, N4 numeración sin huecos, N9 permisos).
-- Patrón create_contract_with_lines: SECURITY DEFINER + guard service_role.
-- Recibe el draft YA calculado por el servidor (lib/invoicing) en p_payload:
--   { client_id, client_name, period_year, period_month, has_estimated, total_amount,
--     issued_by, confirm_estimated, lines: [ { ...campos de invoice_lines... } ] }
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
    status, has_estimated, total_amount, issued_by
  ) VALUES (
    v_numero, v_client_id, p_payload->>'client_name', v_year, v_month,
    'emise', v_has_est, (p_payload->>'total_amount')::numeric, (p_payload->>'issued_by')::uuid
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
