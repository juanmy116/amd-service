-- PERMISO DE FACTURACIÓN — separar «administrar el SAV» de «facturar» (2026-09-11).
--
-- Contexto: hasta hoy el área /admin era todo-o-nada (`role = 'admin'` ⇒ ve TODO, incluida la
-- facturación). Al incorporar personal de AMD que debe gestionar el día a día del SAV (clientes,
-- máquinas, contadores, contratos, incidencias, mantenimiento) SIN ver la facturación, hace falta
-- un permiso aparte.
--
-- Solución: flag `profiles.can_bill` (mismo patrón que `profiles.is_dispatcher`, ya en uso).
-- Sigue siendo `role = 'admin'` — por tanto `is_admin()` NO cambia y TODAS las policies existentes
-- siguen funcionando igual. Lo único que `can_bill` gobierna es la facturación.
--
-- Alcance de la restricción (capas, mismo espíritu que el candado de facturación):
--   (1) UI: el grupo «Facturation» del Sidebar no se muestra.
--   (2) Rutas/Server Actions: `requireBilling()` en lugar de `requireAdmin()`.
--   (3) BD: las policies de abajo.
--
-- ⚠️ `billing_plans` es un caso especial: la página de CONTRATOS (que sí deben usar) lee los planes
-- para asignar la tarifa de cada línea. Por eso se separa LECTURA (cualquier admin) de ESCRITURA
-- (solo `can_bill`): pueden asignar un plan existente a un contrato, pero no crear/editar tarifas.
--
-- `billing_settings` se deja como está (lectura de admin): es un único booleano informativo y la app
-- lo lee con service_role (`isBillingEnabled()`), que ignora RLS.

BEGIN;

-- ── Permiso ──
ALTER TABLE public.profiles
  ADD COLUMN can_bill boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.profiles.can_bill IS
  'Permite acceder a la facturación (planes tarifarios, informe mensual, facturas). Solo aplica a role = admin.';

-- Los admin que ya existen conservan exactamente el acceso que tenían hasta ahora.
UPDATE public.profiles SET can_bill = true WHERE role = 'admin';

CREATE OR REPLACE FUNCTION public.can_bill()
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid() AND role = 'admin' AND can_bill
  );
$$;

-- ── invoices / invoice_lines: solo quien puede facturar ──
DROP POLICY IF EXISTS invoices_admin_all ON public.invoices;
CREATE POLICY invoices_billing_all
  ON public.invoices FOR ALL TO authenticated
  USING (public.can_bill()) WITH CHECK (public.can_bill());

DROP POLICY IF EXISTS invoice_lines_admin_all ON public.invoice_lines;
CREATE POLICY invoice_lines_billing_all
  ON public.invoice_lines FOR ALL TO authenticated
  USING (public.can_bill()) WITH CHECK (public.can_bill());

-- ── billing_plans: leer cualquier admin (lo necesitan los contratos), escribir solo can_bill ──
-- Las dos policies son permisivas y se combinan con OR: un admin sin can_bill pasa la de SELECT
-- (puede consultar y asignar tarifas) pero ninguna le autoriza INSERT/UPDATE/DELETE.
DROP POLICY IF EXISTS billing_plans_admin_all ON public.billing_plans;
CREATE POLICY billing_plans_admin_read
  ON public.billing_plans FOR SELECT TO authenticated
  USING (public.is_admin());
CREATE POLICY billing_plans_billing_write
  ON public.billing_plans FOR ALL TO authenticated
  USING (public.can_bill()) WITH CHECK (public.can_bill());

COMMIT;
