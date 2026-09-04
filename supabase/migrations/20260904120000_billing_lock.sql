-- CAPA 1 — CANDADO DE FACTURACIÓN (fase de prueba del SAV, 2026-09-04).
--
-- Decisión de negocio: se arranca primero el SAV en producción y se prueba unos meses; la facturación
-- permanece APAGADA hasta validar que el SAV es sólido. Durante esa fase NO debe emitirse NINGUNA
-- factura, ni con «Émettre» ni con «Forcer» (que hoy emiten de forma definitiva en un solo clic).
--
-- El candado vive a nivel de BD (defensa en profundidad, mismo espíritu que tg_invoices_immutable):
-- un trigger BEFORE INSERT en invoices bloquea TODA creación de factura mientras
-- billing_settings.billing_enabled = false — aplica a TODOS los roles, incluido service_role. Así,
-- aunque el guard de la Server Action fallara, apareciera un nuevo camino de código, o alguien
-- llamara manualmente a emit_contract_invoice con la service_role key, la factura NO se crea.
-- La capa de aplicación además oculta los botones de emisión y muestra un aviso.
--
-- Para ENCENDER la facturación cuando el SAV se valide como sólido (un solo UPDATE):
--   UPDATE public.billing_settings SET billing_enabled = true, updated_at = now() WHERE id;
--
-- Seguro: hoy hay 0 facturas reales. No afecta a la anulación (es UPDATE, no INSERT) ni a la preview
-- (que se calcula en memoria y no inserta nada).

BEGIN;

-- ── Ajustes de facturación (fila única: patrón singleton id=true) ──
CREATE TABLE public.billing_settings (
  id              boolean PRIMARY KEY DEFAULT true,
  billing_enabled boolean NOT NULL DEFAULT false,
  updated_at      timestamptz NOT NULL DEFAULT now(),
  updated_by      uuid,
  CONSTRAINT billing_settings_singleton CHECK (id)
);

-- Estado inicial: APAGADO (fase de prueba del SAV).
INSERT INTO public.billing_settings (id, billing_enabled) VALUES (true, false);

-- RLS: la app lee el flag con service_role (ignora RLS); esta policy es higiene para que un
-- authenticated (admin en la UI) pueda leerlo y anon/otros roles no. La escritura queda solo para
-- SQL/service_role (no hay policy de INSERT/UPDATE/DELETE → nadie más puede tocar el candado).
ALTER TABLE public.billing_settings ENABLE ROW LEVEL SECURITY;
GRANT SELECT ON public.billing_settings TO authenticated;
CREATE POLICY billing_settings_admin_read ON public.billing_settings
  FOR SELECT TO authenticated USING (public.is_admin());

-- ── Guard a nivel de BD: bloquear la creación de facturas si el candado está echado. ──
CREATE OR REPLACE FUNCTION public.tg_guard_billing_enabled()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $$
BEGIN
  IF NOT COALESCE((SELECT billing_enabled FROM public.billing_settings WHERE id), false) THEN
    RAISE EXCEPTION 'billing_disabled';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_guard_billing_enabled ON public.invoices;
CREATE TRIGGER trg_guard_billing_enabled
  BEFORE INSERT ON public.invoices
  FOR EACH ROW EXECUTE FUNCTION public.tg_guard_billing_enabled();

COMMIT;
