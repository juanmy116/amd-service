-- P2-4: borrado de contrato atómico.
-- Antes el borrado eran DOS operaciones separadas desde el servidor:
--   1) admin.rpc('can_delete_contract')  → comprueba dependencias
--   2) admin.from('contracts').delete()  → borra
-- Entre ambas (cientos de ms y dos round-trips de red) se podía crear una
-- dependencia (incidencia, relevé, plan) → ventana TOCTOU.
--
-- Esta RPC fusiona comprobación + borrado en UNA transacción de BD, colapsando
-- la ventana a microsegundos. Además bloquea el contrato con FOR UPDATE para
-- serializar borrados concurrentes del mismo contrato. Las FK RESTRICT que ya
-- existen (incidents.contract_machine_id, invoice_lines.contract_id) son la red
-- de seguridad final: si una incidencia/factura se colara entre el conteo y el
-- DELETE, la FK aborta toda la transacción y no se borra nada.
--
-- Devuelve jsonb: { deleted: true } o, si no se pudo, el desglose de dependencias
-- { deleted: false, incidents, counters, maintenance } (o { not_found: true }),
-- para que la UI muestre el mismo mensaje rico que daba can_delete_contract.

CREATE OR REPLACE FUNCTION public.delete_contract(p_contract_id uuid)
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

  -- Serializa con otros borrados del mismo contrato.
  PERFORM 1 FROM contracts WHERE id = p_contract_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('deleted', false, 'not_found', true);
  END IF;

  SELECT count(*) INTO v_incidents
    FROM incidents
    WHERE contract_machine_id IN (SELECT id FROM contract_machines WHERE contract_id = p_contract_id);

  SELECT count(*) INTO v_counters
    FROM machine_counters WHERE contract_id = p_contract_id;

  SELECT count(*) INTO v_maintenance
    FROM maintenance_plans WHERE contract_id = p_contract_id;

  IF v_incidents > 0 OR v_counters > 0 OR v_maintenance > 0 THEN
    RETURN jsonb_build_object(
      'deleted',     false,
      'incidents',   v_incidents,
      'counters',    v_counters,
      'maintenance', v_maintenance
    );
  END IF;

  -- Cascadea a contract_machines y demás hijas con ON DELETE CASCADE.
  DELETE FROM contracts WHERE id = p_contract_id;

  RETURN jsonb_build_object('deleted', true);
END;
$$;

REVOKE ALL ON FUNCTION public.delete_contract(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.delete_contract(uuid) TO service_role;
