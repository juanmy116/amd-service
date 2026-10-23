-- Las máquinas nunca se borran; se ponen «hors service» (plan de pulido 2026-10-23, punto 6).
--
-- Una máquina pasa de cliente en cliente, así que su historial (contratos, contadores, averías)
-- tiene que seguir ahí. El botón «Supprimer» de la ficha la borraba de verdad si nunca había
-- estado en un contrato (58 de 144 en prod el 2026-10-23). Solo se da de baja por obsolescencia,
-- y puede hacerlo cualquier admin (decisión del usuario).
--
-- «Hors service» es `machines.active = false`, la marca que ya usa toda la app (sin ella la
-- máquina no se ofrece para contratos ni se puede escanear). Lo nuevo:
--   1. Nadie borra máquinas desde la app: sin DELETE para `authenticated`.
--   2. No se puede poner hors service una máquina con contrato abierto: primero se retira o se
--      reemplaza.
--   3. Una máquina hors service no puede entrar en un contrato (ninguna puerta: formulario,
--      stock, reemplazo).
--   4. Quedan anotados la fecha, el motivo y quién lo hizo.
-- Compatible con la app anterior: su casilla «Machine active» sigue funcionando (con la regla 2).
--
-- Inversa: docs/rollback-2026-10-23-hors-service.md

BEGIN;

-- 1) Sin borrado desde la app. service_role (Edge Functions, tests, SQL de mantenimiento) conserva
--    el DELETE.
DROP POLICY IF EXISTS admin_all_machines ON public.machines;
CREATE POLICY admin_select_machines ON public.machines
  FOR SELECT TO authenticated USING (public.is_admin());
CREATE POLICY admin_insert_machines ON public.machines
  FOR INSERT TO authenticated WITH CHECK (public.is_admin());
CREATE POLICY admin_update_machines ON public.machines
  FOR UPDATE TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());
REVOKE DELETE ON public.machines FROM anon, authenticated;

-- 4) Rastro de la baja. `hors_service_by` sin FK a propósito: `machines` ya tiene una FK a
--    `profiles` (location_set_by) y una segunda haría ambiguo cualquier embed (PGRST201).
ALTER TABLE public.machines
  ADD COLUMN hors_service_at     timestamptz,
  ADD COLUMN hors_service_reason text,
  ADD COLUMN hors_service_by     uuid;

COMMENT ON COLUMN public.machines.hors_service_at     IS 'Date de mise hors service (active = false). NULL si en service.';
COMMENT ON COLUMN public.machines.hors_service_reason IS 'Motif de la mise hors service (obsolescence…).';
COMMENT ON COLUMN public.machines.hors_service_by     IS 'profiles.id de l''admin qui l''a mise hors service (sans FK, voir migration).';

-- 2) Regla al cambiar `active`.
CREATE OR REPLACE FUNCTION public.guard_machine_hors_service()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_catalog
AS $$
BEGIN
  IF NEW.active IS NOT DISTINCT FROM OLD.active THEN
    RETURN NEW;
  END IF;

  IF NOT NEW.active THEN
    IF EXISTS (SELECT 1 FROM contract_machines
                WHERE machine_id = NEW.numero_serie AND date_fin IS NULL) THEN
      RAISE EXCEPTION 'machine_in_contract';
    END IF;
    NEW.hors_service_at := COALESCE(NEW.hors_service_at, now());
  ELSE
    NEW.hors_service_at     := NULL;
    NEW.hors_service_reason := NULL;
    NEW.hors_service_by     := NULL;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_guard_machine_hors_service
  BEFORE UPDATE OF active ON public.machines
  FOR EACH ROW EXECUTE FUNCTION public.guard_machine_hors_service();

-- 3) Una máquina hors service no entra en ningún contrato.
CREATE OR REPLACE FUNCTION public.guard_line_machine_in_service()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_catalog
AS $$
BEGIN
  IF NEW.date_fin IS NULL
     AND EXISTS (SELECT 1 FROM machines WHERE numero_serie = NEW.machine_id AND NOT active) THEN
    RAISE EXCEPTION 'machine_hors_service';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_guard_line_machine_in_service
  BEFORE INSERT ON public.contract_machines
  FOR EACH ROW EXECUTE FUNCTION public.guard_line_machine_in_service();

COMMIT;
