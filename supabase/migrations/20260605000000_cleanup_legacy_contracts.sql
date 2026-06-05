-- Fase 4: cleanup de columnas y funciones legacy del refactor de contratos N máquinas.
-- Código que ya no usa estas columnas DESPLEGADO en producción (Vercel success en merge 4884fae)
-- ANTES de aplicar esta migración (orden inviolable, sin staging).
-- Datos verificados migrados: ningún DROP pierde información.
--
-- IMPORTANTE: 3 funciones SECURITY DEFINER derivaban de incidents.contract_id y estaban EN USO
-- por políticas RLS de técnicos (clients, contracts) y por la RPC can_delete_contract.
-- El inventario de código (0 invocaciones desde la app) no las detectó; la verificación de
-- dependencias en BD (pg_policy/pg_proc) sí. Se REESCRIBEN para derivar vía contract_machine_id
-- ANTES de dropear la columna, preservando el RLS de técnicos.

-- 1. Reescribir funciones de RLS técnico que derivaban de incidents.contract_id.
CREATE OR REPLACE FUNCTION public.auth_tech_incident_contract_ids()
RETURNS SETOF uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$
  SELECT DISTINCT cm.contract_id FROM incidents i
  JOIN contract_machines cm ON cm.id = i.contract_machine_id
  WHERE i.assigned_to = auth.uid();
$$;

CREATE OR REPLACE FUNCTION public.auth_tech_assigned_client_ids()
RETURNS SETOF integer LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$
  SELECT DISTINCT c.client_id FROM incidents i
  JOIN contract_machines cm ON cm.id = i.contract_machine_id
  JOIN contracts c ON c.id = cm.contract_id
  WHERE i.assigned_to = auth.uid();
$$;

-- 2. Reescribir can_delete_contract (RPC Fase 2): quitar la rama legacy incidents.contract_id.
CREATE OR REPLACE FUNCTION public.can_delete_contract(p_contract_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE
  v_incidents   int;
  v_counters    int;
  v_maintenance int;
BEGIN
  IF auth.role() <> 'service_role' THEN
    RAISE EXCEPTION 'permission_denied';
  END IF;

  SELECT count(*) INTO v_incidents
    FROM incidents
    WHERE contract_machine_id IN (SELECT id FROM contract_machines WHERE contract_id = p_contract_id);

  SELECT count(*) INTO v_counters
    FROM machine_counters WHERE contract_id = p_contract_id;

  SELECT count(*) INTO v_maintenance
    FROM maintenance_plans WHERE contract_id = p_contract_id;

  RETURN jsonb_build_object(
    'can_delete',  (v_incidents = 0 AND v_counters = 0 AND v_maintenance = 0),
    'incidents',   v_incidents,
    'counters',    v_counters,
    'maintenance', v_maintenance
  );
END;
$$;

-- 3. DROP RPCs legacy del modelo viejo (0 usos en código, insertaban en columnas legacy).
DROP FUNCTION IF EXISTS public.create_client_with_contract(text, text, text, text, text, text, boolean, text, text, date, date, text);
DROP FUNCTION IF EXISTS public.create_machine_with_contract(text, text, text, text, boolean, text, bigint, date, text, date, text);

-- 4. DROP columnas legacy (las FKs asociadas se eliminan en cascada con la columna).
ALTER TABLE incidents DROP COLUMN IF EXISTS contract_id;
ALTER TABLE contracts DROP COLUMN IF EXISTS machine_id;
ALTER TABLE contracts DROP COLUMN IF EXISTS lieu_installation;

-- Nota: auth_tech_incident_ids() (en uso, sin legacy) y auth_tech_incident_machine_ids()
-- (huérfana, usa incidents.machine_id que se mantiene) se dejan intactas.
