-- Primera visita de mantenimiento para una máquina que entra en un contrato que YA tiene plan.
--
-- Las visitas solo se creaban al crear el plan (una por línea activa), al cerrar una visita (la
-- siguiente) y al reemplazar una máquina (se trasladan). Una máquina añadida después al contrato
-- se quedaba sin visita y nadie la mantenía (plan de pulido 2026-10-23, «Detalles que salieron»).
-- Va como trigger para cubrir todas las puertas: update_contract_with_lines, assign_machine_from_stock
-- y lo que venga.
--
-- Fecha (decisión del usuario): la PRÓXIMA visita pendiente del contrato, para que el técnico haga
-- todas las máquinas en el mismo viaje. Solo vale una fecha >= hoy y >= inicio de la línea (si no,
-- la visita nacería atrasada o antes de la instalación). Si no hay ninguna así: inicio de la línea
-- (u hoy, si la instalación es anterior) + 30 días (mensual) o 90 (trimestral), la misma regla que
-- close_maintenance_visit.
--
-- Inversa: docs/rollback-2026-10-23-primera-visita.md

BEGIN;

CREATE OR REPLACE FUNCTION public.schedule_first_visit_for_new_line()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
DECLARE
  v_plan_id   uuid;
  v_plan_freq text;
  v_from      date;
  v_date      date;
BEGIN
  -- Un reemplazo hereda las visitas pendientes de la saliente (replace_contract_machine); una línea
  -- ya cerrada no se mantiene.
  IF NEW.replaces_contract_machine_id IS NOT NULL OR NEW.date_fin IS NOT NULL THEN
    RETURN NEW;
  END IF;

  SELECT id, frequency INTO v_plan_id, v_plan_freq
    FROM maintenance_plans
   WHERE contract_id = NEW.contract_id AND active
   LIMIT 1;
  IF v_plan_id IS NULL THEN
    RETURN NEW;
  END IF;

  IF EXISTS (SELECT 1 FROM maintenance_visits
              WHERE contract_machine_id = NEW.id AND status <> 'fait') THEN
    RETURN NEW;
  END IF;

  v_from := GREATEST(NEW.date_debut, current_date);

  SELECT min(v.scheduled_date) INTO v_date
    FROM maintenance_visits v
    JOIN contract_machines cm ON cm.id = v.contract_machine_id
   WHERE v.plan_id = v_plan_id
     AND v.status <> 'fait'
     AND cm.date_fin IS NULL
     AND v.scheduled_date >= v_from;

  IF v_date IS NULL THEN
    v_date := v_from + CASE
      WHEN COALESCE(NEW.maintenance_frequency_override, v_plan_freq) = 'mensuel' THEN 30
      ELSE 90
    END;
  END IF;

  INSERT INTO maintenance_visits (plan_id, contract_machine_id, scheduled_date, status)
    VALUES (v_plan_id, NEW.id, v_date, 'planifié');

  RETURN NEW;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.schedule_first_visit_for_new_line() FROM PUBLIC, anon, authenticated;

COMMENT ON FUNCTION public.schedule_first_visit_for_new_line() IS
  'Primera visita para una línea nueva en un contrato con plan activo. Ver 20261023160000_first_visit_for_new_line.sql';

CREATE TRIGGER trg_schedule_first_visit_for_new_line
  AFTER INSERT ON public.contract_machines
  FOR EACH ROW EXECUTE FUNCTION public.schedule_first_visit_for_new_line();

COMMIT;
