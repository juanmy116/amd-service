-- El técnico no puede renombrar el número SAV de su avería.
--
-- `tech_assigned_incidents_update` no limita columnas, así que el técnico asignado podía cambiar
-- `numero_incident` (el identificador que ven la oficina, el cliente, los correos, la encuesta y
-- los avisos push). Desde 20261009130000 eso ya no atasca las altas (el contador se salta los
-- números ocupados), pero sí podía confundir o duplicar referencias de cara al cliente.
--
-- Se añade `numero_incident` a las columnas que vigila el trigger de F2 (20261009100000) en
-- `incidents`. El resto de la función no cambia: pasan la oficina, service_role y las sesiones
-- directas a la BD. La app nunca cambia el número con la sesión de un técnico.
--
-- Deshacer: docs/rollback-2026-10-09-numero-incident.md (sección «Guard del UPDATE»)

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

  -- Ramas por tabla: `machine_id`, `opened_by`, `source` y `numero_incident` solo existen en
  -- incidents.
  IF TG_TABLE_NAME = 'incidents' THEN
    IF NEW.machine_id IS DISTINCT FROM OLD.machine_id
       OR NEW.opened_by IS DISTINCT FROM OLD.opened_by
       OR NEW.source IS DISTINCT FROM OLD.source THEN
      RAISE EXCEPTION 'Seul le bureau peut changer la machine ou l''affectation.'
        USING ERRCODE = 'insufficient_privilege';
    END IF;
    IF NEW.numero_incident IS DISTINCT FROM OLD.numero_incident THEN
      RAISE EXCEPTION 'Seul le bureau peut changer le numéro de la panne.'
        USING ERRCODE = 'insufficient_privilege';
    END IF;
  END IF;

  RETURN NEW;
END;
$function$;
