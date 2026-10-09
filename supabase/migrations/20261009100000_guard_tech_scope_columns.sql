-- F2 (escaneo de seguridad 2026-09-29): el técnico no puede cambiar las columnas de las que
-- sale su propio alcance RLS.
--
-- `tech_assigned_incidents_update` y `tech_update_visits` no limitan columnas, y las funciones
-- auth_tech_* calculan qué máquinas, líneas, contratos y clientes ve un técnico a partir de
-- `contract_machine_id`, `machine_id` y `assigned_to` de sus averías y visitas. Bastaba con
-- apuntar una avería propia a otra máquina (o mover una visita a otra línea) para que la RLS
-- le abriera esa máquina, sus visitas, su contrato y la ficha de su cliente.
--
-- La app nunca cambia esas columnas con la sesión de un técnico: el taller reasigna con
-- service_role (`atelier/actions.ts`), la oficina como admin, y el cierre de visitas va por la
-- RPC `close_maintenance_visit` (service_role). El técnico solo reenvía su propio `assigned_to`
-- al guardar la intervención, que no es un cambio.
--
-- Solo se vigilan las sesiones de usuario no admin (técnicos y clientes). Pasan service_role,
-- la oficina y las sesiones directas a la BD (SQL Editor, migraciones, pg_cron: sin JWT,
-- `auth.role()` es NULL).
--
-- Deshacer: docs/rollback-2026-10-09-f2.md

CREATE OR REPLACE FUNCTION public.guard_tech_scope_columns()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'pg_catalog', 'public'
AS $function$
BEGIN
  IF auth.role() IS DISTINCT FROM 'authenticated' OR public.is_admin() THEN
    RETURN NEW;
  END IF;

  IF NEW.contract_machine_id IS DISTINCT FROM OLD.contract_machine_id
     OR NEW.assigned_to IS DISTINCT FROM OLD.assigned_to THEN
    RAISE EXCEPTION 'Seul le bureau peut changer la machine ou l''affectation.'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  -- Ramas por tabla: `machine_id`, `opened_by` y `source` solo existen en incidents.
  IF TG_TABLE_NAME = 'incidents' THEN
    IF NEW.machine_id IS DISTINCT FROM OLD.machine_id
       OR NEW.opened_by IS DISTINCT FROM OLD.opened_by
       OR NEW.source IS DISTINCT FROM OLD.source THEN
      RAISE EXCEPTION 'Seul le bureau peut changer la machine ou l''affectation.'
        USING ERRCODE = 'insufficient_privilege';
    END IF;
  END IF;

  RETURN NEW;
END;
$function$;

CREATE TRIGGER trg_guard_tech_scope_columns
  BEFORE UPDATE ON public.incidents
  FOR EACH ROW EXECUTE FUNCTION public.guard_tech_scope_columns();

CREATE TRIGGER trg_guard_tech_scope_columns
  BEFORE UPDATE ON public.maintenance_visits
  FOR EACH ROW EXECUTE FUNCTION public.guard_tech_scope_columns();
