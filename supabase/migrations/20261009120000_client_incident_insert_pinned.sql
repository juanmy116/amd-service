-- F3 (escaneo de seguridad 2026-09-29): un cliente del portal solo crea averías como las crea el
-- portal.
--
-- `client_create_incidents` solo comprobaba que la línea fuese del cliente. Nada impedía que el
-- cliente se asignase la avería (`assigned_to = su uid`): las políticas `tech_*` y las funciones
-- `auth_tech_*` no miran el rol, solo `assigned_to = auth.uid()`, así que heredaba el alcance de
-- un técnico sobre esa máquina, sus visitas, su contrato y su ficha. También podía crearla ya
-- en curso o cerrada, o firmarla en nombre de otro usuario.
--
-- Ahora la fila nueva tiene que ser la del portal (`portal/incidents/new/actions.ts`): estado
-- `nouveau`, sin técnico, sin informe ni resolución, y `opened_by` el propio cliente o vacío
-- (vacío lo usan los tests de `geolocation.test.ts` y no da ningún permiso). El sello QR ya lo
-- fuerza a «sin sellar» el trigger `guard_field_evidence`.
--
-- No hay que limpiar datos: en producción no existe ninguna cuenta de cliente (2026-10-09).
--
-- Deshacer: docs/rollback-2026-10-09-f3.md

DROP POLICY IF EXISTS client_create_incidents ON public.incidents;
CREATE POLICY client_create_incidents ON public.incidents
  FOR INSERT
  WITH CHECK (
    contract_machine_id IN (SELECT public.auth_client_contract_machine_ids())
    AND assigned_to IS NULL
    AND status = 'nouveau'
    AND (opened_by IS NULL OR opened_by = (SELECT auth.uid()))
    AND rapport_intervention IS NULL
    AND resolved_via IS NULL
    AND resolution_reason IS NULL
    AND resolution_note IS NULL
    AND resolved_at IS NULL
    AND closed_at IS NULL
  );
