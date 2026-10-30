-- TÉCNICOS Y ATELIER CREAN AVERÍAS (tanda 6 del pulido, 2026-10-29).
--
-- 1. Categoría `recuperation`: la recogida de una máquina (llevarla al taller, fin de contrato,
--    cambio por otra) es una avería más con su etiqueta — misma columna del kiosko, asignación,
--    push, doble escaneo e informe de cierre. No saca la máquina del contrato.
--    `ADD VALUE` vale dentro de una transacción (PG ≥ 12) mientras el valor no se use en ella.
--
-- 2. Permiso `profiles.can_create_incidents`: qué técnicos pueden declarar una avería desde la
--    ficha de máquina del escáner. Mismo patrón que `is_dispatcher` / `can_bill`. La app crea la
--    avería con service_role tras comprobar el flag; no hay política INSERT nueva para técnicos.
--    El usuario ya no puede escribir la columna (GRANT UPDATE solo en full_name, phone desde
--    20260610100000); el trigger lo cierra también por si un GRANT futuro lo abriera. De paso
--    protege `can_bill`, que tenía solo la capa del GRANT (revisión del PR #213).
--
-- Compatible con la app publicada: no lee la columna y ninguna fila usa el valor nuevo.
-- Inversa: docs/rollback-2026-10-29-crear-averias.md

ALTER TYPE public.incident_category ADD VALUE IF NOT EXISTS 'recuperation';

ALTER TABLE public.profiles
  ADD COLUMN can_create_incidents boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.profiles.can_create_incidents IS
  'Permite a un técnico declarar una avería desde /tech/scan/[serie]. Entra nouveau y sin asignar.';

CREATE OR REPLACE FUNCTION public.tg_profiles_protect_privileged()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF auth.role() <> 'service_role' THEN
    IF NEW.role IS DISTINCT FROM OLD.role
       OR NEW.is_dispatcher IS DISTINCT FROM OLD.is_dispatcher
       OR NEW.can_bill IS DISTINCT FROM OLD.can_bill
       OR NEW.can_create_incidents IS DISTINCT FROM OLD.can_create_incidents THEN
      RAISE EXCEPTION 'forbidden: cannot change privileged columns';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;
