-- Limpieza: DROP de can_delete_contract, huérfana tras el borrado atómico.
-- La RPC delete_contract (20260611120000) fusiona comprobación + borrado en una
-- sola transacción y ya devuelve el desglose de dependencias, así que el antiguo
-- pre-check can_delete_contract dejó de usarse en la aplicación (0 usos en src/).
DROP FUNCTION IF EXISTS public.can_delete_contract(uuid);
