-- PR-D.2 (P0-2 de la revisión NO-GO de Codex) — Guard A3.
-- Spec §12 A3: una corrección de una lectura YA facturada (en una factura `emise`) exige
-- primero ANULAR esa factura (acción consciente de admin) y reemitir. El sistema debe
-- BLOQUEAR la anulación silenciosa de una lectura que ya cerró una factura emitida; si no,
-- la factura queda con un dato y la cadena futura arranca de un punto incoherente
-- (sobre/infra-cobro + rotura de auditabilidad).
--
-- Antes: cancelCounterAction hacía UPDATE status='annule' sin mirar invoice_lines.
-- Ahora: un trigger en BD (no se puede saltar por ninguna ruta) rechaza la transición a
-- 'annule' si la lectura aparece en una factura `emise`, tanto en el cierre top-level
-- (opening/closing_counter_id) como en el breakdown por tramo (reemplazos A→B).
--
-- Solo bloquea contra facturas `emise` (no `annulee`): tras anular la factura, su lectura
-- queda libre y la corrección/reemisión es posible (coherente con A2).

CREATE OR REPLACE FUNCTION public.prevent_annul_billed_counter()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Solo en la transición ACTIF → ANNULE.
  IF NEW.status = 'annule' AND OLD.status IS DISTINCT FROM 'annule' THEN
    IF EXISTS (
      SELECT 1
      FROM public.invoice_lines il
      JOIN public.invoices inv ON inv.id = il.invoice_id
      WHERE inv.status = 'emise'
        AND (
          il.opening_counter_id = OLD.id
          OR il.closing_counter_id = OLD.id
          OR EXISTS (
            SELECT 1
            FROM jsonb_array_elements(COALESCE(il.breakdown, '[]'::jsonb)) AS e
            WHERE e->>'opening_counter_id' = OLD.id::text
               OR e->>'closing_counter_id' = OLD.id::text
          )
        )
    ) THEN
      RAISE EXCEPTION 'counter_used_by_emised_invoice';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_prevent_annul_billed_counter ON public.machine_counters;
CREATE TRIGGER trg_prevent_annul_billed_counter
  BEFORE UPDATE ON public.machine_counters
  FOR EACH ROW
  EXECUTE FUNCTION public.prevent_annul_billed_counter();
