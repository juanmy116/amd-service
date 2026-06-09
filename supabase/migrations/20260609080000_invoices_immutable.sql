-- BLOQUE C / P0-5 — facturas realmente inmutables en BD.
-- Plan: docs/plan-correccion-core-facturacion-2026-06-08.md §Bloque C, punto 1.
--
-- Contexto post-motor: el Bloque E (en main) añadió a invoices las columnas contract_id,
-- period_start y period_end, y la RPC emit_contract_invoice (paralela a emit_invoice). Las
-- políticas RLS de invoices/invoice_lines son FOR ALL para admin, así que un admin (o cualquier
-- ruta service_role) podía UPDATE/DELETE directos saltándose la anulación auditada.
--
-- Blindaje a nivel de TRIGGER (aplica a TODOS los roles, incl. service_role):
--   · invoices: solo se permite la transición auditada emise -> annulee, y SOLO tocando los
--     campos de anulación. Cualquier otro UPDATE y todo DELETE se rechazan.
--   · invoice_lines: snapshot puro, ni UPDATE ni DELETE.
-- Las RPC de emisión (emit_invoice / emit_contract_invoice) solo INSERTan → no se ven afectadas
-- (los triggers son BEFORE UPDATE OR DELETE). La acción de anulación (factures/[id]/actions.ts)
-- hace exactamente emise->annulee + campos de anulación → sigue funcionando.

BEGIN;

-- ── invoices: bloquear UPDATE (salvo anulación auditada) y DELETE ──
-- Robusto ante columnas futuras: compara OLD vs NEW en jsonb tras quitar SOLO los campos que la
-- anulación puede cambiar. Cualquier columna nueva de invoices queda protegida automáticamente.
CREATE OR REPLACE FUNCTION public.tg_invoices_immutable()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'invoice_delete_forbidden: une facture ne peut pas être supprimée (uniquement annulée)';
  END IF;

  -- Una factura ya anulada es totalmente inmutable.
  IF OLD.status <> 'emise' THEN
    RAISE EXCEPTION 'invoice_immutable: facture déjà annulée, aucune modification possible';
  END IF;

  -- Única transición permitida: emise -> annulee.
  IF NEW.status <> 'annulee' THEN
    RAISE EXCEPTION 'invoice_immutable: seule l''annulation (emise -> annulee) est permise';
  END IF;

  -- Salvo status + campos de anulación, NADA puede cambiar (snapshot contable).
  IF (to_jsonb(OLD) - 'status' - 'annulled_by' - 'annulled_at' - 'annulation_reason')
     IS DISTINCT FROM
     (to_jsonb(NEW) - 'status' - 'annulled_by' - 'annulled_at' - 'annulation_reason') THEN
    RAISE EXCEPTION 'invoice_immutable: seuls les champs d''annulation peuvent être modifiés';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_invoices_immutable ON public.invoices;
CREATE TRIGGER trg_invoices_immutable
  BEFORE UPDATE OR DELETE ON public.invoices
  FOR EACH ROW EXECUTE FUNCTION public.tg_invoices_immutable();

-- ── invoice_lines: snapshot puro (ni UPDATE ni DELETE) ──
CREATE OR REPLACE FUNCTION public.tg_invoice_lines_immutable()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $$
BEGIN
  RAISE EXCEPTION 'invoice_line_immutable: les lignes de facture sont en lecture seule (snapshot)';
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS trg_invoice_lines_immutable ON public.invoice_lines;
CREATE TRIGGER trg_invoice_lines_immutable
  BEFORE UPDATE OR DELETE ON public.invoice_lines
  FOR EACH ROW EXECUTE FUNCTION public.tg_invoice_lines_immutable();

-- ── FK invoice_lines -> invoices: ON DELETE CASCADE (migración 100) ya no tiene sentido
-- (una factura no se puede borrar). Lo pasamos a RESTRICT como red de seguridad redundante
-- si algún día se retirara el trigger. ──
DO $$
DECLARE v_con text;
BEGIN
  SELECT conname INTO v_con
  FROM pg_constraint
  WHERE conrelid = 'public.invoice_lines'::regclass
    AND contype  = 'f'
    AND confrelid = 'public.invoices'::regclass;
  IF v_con IS NOT NULL THEN
    EXECUTE format('ALTER TABLE public.invoice_lines DROP CONSTRAINT %I', v_con);
  END IF;
END $$;

ALTER TABLE public.invoice_lines
  ADD CONSTRAINT invoice_lines_invoice_id_fkey
  FOREIGN KEY (invoice_id) REFERENCES public.invoices(id) ON DELETE RESTRICT;

COMMIT;
