-- BLOQUE C / P2-5 — invariantes estructurales de la cadena de reemplazos en BD.
-- Plan: docs/plan-correccion-core-facturacion-2026-06-08.md §Bloque C, punto 4.
--
-- El encadenado del puesto de servicio vive en contract_machines.replaces_contract_machine_id
-- (línea entrante -> línea saliente). El motor de facturación recorre la cadena para consolidar
-- el consumo; ante datos corruptos (ciclos, bifurcaciones, enlaces entre contratos distintos,
-- varias líneas reemplazando a la misma) la factura saldría mal. Blindamos las invariantes:
--   1. No autorreferencia (una línea no se reemplaza a sí misma).
--   2. No dos líneas reemplazando a la misma saliente (sin bifurcación).
--   3. El enlace queda DENTRO del mismo contrato.
--   4. Sin ciclos en la cadena.
-- (1) y (2) con constraint/índice; (3) y (4) con un trigger (requieren consultar otra fila).

BEGIN;

-- 1) No autorreferencia.
ALTER TABLE public.contract_machines
  ADD CONSTRAINT contract_machines_no_self_replace
  CHECK (replaces_contract_machine_id IS NULL OR replaces_contract_machine_id <> id);

-- 2) Una saliente solo puede ser reemplazada por UNA entrante (sin bifurcación de la cadena).
CREATE UNIQUE INDEX contract_machines_one_replacement_per_line
  ON public.contract_machines (replaces_contract_machine_id)
  WHERE replaces_contract_machine_id IS NOT NULL;

-- 3) + 4) Enlace dentro del mismo contrato y sin ciclos.
CREATE OR REPLACE FUNCTION public.tg_cm_replacement_invariants()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_target_contract uuid;
  v_cursor          uuid;
  v_steps           int := 0;
BEGIN
  IF NEW.replaces_contract_machine_id IS NULL THEN
    RETURN NEW;
  END IF;

  -- (3) La línea saliente debe existir y pertenecer al MISMO contrato.
  SELECT contract_id INTO v_target_contract
  FROM public.contract_machines
  WHERE id = NEW.replaces_contract_machine_id;

  IF v_target_contract IS NULL THEN
    RAISE EXCEPTION 'replacement_target_not_found';
  END IF;
  IF v_target_contract <> NEW.contract_id THEN
    RAISE EXCEPTION 'replacement_cross_contract';
  END IF;

  -- (4) Sin ciclos: recorrer la cadena hacia las salientes; si volvemos a NEW.id, hay ciclo.
  -- Cota dura por si los datos ya estuvieran corruptos (evita bucle infinito).
  v_cursor := NEW.replaces_contract_machine_id;
  WHILE v_cursor IS NOT NULL AND v_steps < 10000 LOOP
    IF v_cursor = NEW.id THEN
      RAISE EXCEPTION 'replacement_cycle';
    END IF;
    SELECT replaces_contract_machine_id INTO v_cursor
    FROM public.contract_machines WHERE id = v_cursor;
    v_steps := v_steps + 1;
  END LOOP;
  IF v_steps >= 10000 THEN
    RAISE EXCEPTION 'replacement_chain_too_long';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_cm_replacement_invariants ON public.contract_machines;
CREATE TRIGGER trg_cm_replacement_invariants
  BEFORE INSERT OR UPDATE OF replaces_contract_machine_id, contract_id
  ON public.contract_machines
  FOR EACH ROW EXECUTE FUNCTION public.tg_cm_replacement_invariants();

COMMIT;
