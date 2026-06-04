# Fase 2 — RPCs Atómicas para Contratos

**Fecha:** 2026-06-04
**Proyecto:** AMD Service SAV
**Rama:** `fix/fase2-rpcs-atomicas-contratos`
**Prerequisito:** Fase 1 mergeada (PR #25, `0742daa`)
**Siguiente fase:** Fase 3 — Mantenimiento granular (spec independiente)

---

## Contexto

La creación y edición de contratos en la app realiza múltiples operaciones PostgREST sin transacción:

- **Crear** (`new/actions.ts`): inserta cabecera `contracts`, luego inserta líneas `contract_machines`. Si las líneas fallan, hace un rollback manual borrando el contrato — pero si ese borrado también falla, queda un contrato huérfano sin máquinas (el propio código lo reconoce en su mensaje de error: *"contrat créé sans machines"*).
- **Editar** (`[id]/actions.ts`): actualiza cabecera, luego inserta líneas nuevas, hace upsert de existentes, y cierra retiradas — todo en operaciones separadas que pueden quedar parcialmente aplicadas.

Además, el modelo actual tiene tres debilidades que las decisiones de diseño de esta fase corrigen:

1. El upsert de edición permite **cambiar el `machine_id`** de una línea existente, lo que reescribe la historia y corrompe la atribución de contadores/incidencias.
2. El retiro de máquinas usa siempre **la fecha de hoy** como `date_fin`, ignorando cuándo se retiró realmente.
3. El borrado de contrato hace **DELETE directo** con cascade, que destruye toda la historia de líneas aunque haya incidencias, contadores o mantenimientos asociados.

Esta fase mueve toda la lógica transaccional a funciones Postgres `SECURITY DEFINER`, dejando las Server Actions como capas finas de validación de formato + invocación.

---

## Decisiones de diseño (confirmadas)

1. **Cambio de máquina en línea existente:** BLOQUEADO. Para sustituir una máquina hay que cerrar la línea actual (con `date_fin`) y abrir una nueva. La RPC de update rechaza cualquier cambio de `machine_id` sobre una línea con `id` existente → error `machine_id_immutable`.
2. **Fecha de retiro:** el formulario incluye un selector de fecha de fin. La línea retirada recibe esa fecha como `date_fin`, no la de hoy.
3. **Borrado de contrato:** BLOQUEADO si el contrato tiene incidencias, contadores o mantenimientos asociados. Se informa al admin de qué lo impide.

---

## Arquitectura

```
ContractForm.tsx (cliente)
   │  serializa cabecera + líneas (con date_fin explícito al retirar)
   ▼
new/actions.ts / [id]/actions.ts (Server Action)
   │  requireAdmin() → valida rol admin
   │  valida formato (campos, billing_day 1-31)
   │  createAdminClient() → invoca RPC con service_role
   ▼
RPC SECURITY DEFINER (Postgres)
   │  guard auth.role() = 'service_role'
   │  validaciones de negocio + inserción/actualización ATÓMICA
   ▼
Devuelve { ok: true, contract_id } o lanza excepción tipada
```

Las RPC siguen el patrón de `20260517000000_fix_rpc_privilege_escalation.sql`: `SECURITY DEFINER`, `SET search_path = public`, guard interno `IF auth.role() <> 'service_role' THEN RAISE EXCEPTION`, REVOKE de PUBLIC/anon/authenticated, GRANT a service_role.

---

## Alcance

### Bloque A — Migración SQL: 3 RPCs

**Archivo:** `supabase/migrations/20260604120000_fase2_rpcs_contratos.sql`

#### RPC 1 — `create_contract_with_lines(payload jsonb)`

Recibe un único `jsonb` con cabecera y array de líneas:
```json
{
  "numero_contrat": "AMD-2026-001",
  "client_id": 42,
  "date_debut": "2026-06-01",
  "date_renouvellement": null,
  "statut": "actif",
  "billing_day": 5,
  "maintenance_frequency": "mensuel",
  "lines": [
    { "machine_id": "SN123", "date_debut": "2026-06-01", "billing_day_override": null, "maintenance_frequency_override": null, "notes": null }
  ]
}
```

Lógica (todo dentro de la transacción implícita de la función plpgsql):
1. Guard `service_role`.
2. Validar `jsonb_array_length(lines) >= 1` → si no, `RAISE EXCEPTION 'no_lines'`.
3. Validar que no hay `machine_id` duplicado dentro del array → `RAISE EXCEPTION 'duplicate_machine_in_payload'`.
4. Validar `billing_day` del contrato entre 1 y 31 (si no es null) → `invalid_billing_day`.
5. Validar `billing_day_override` de cada línea entre 1 y 31 (si no es null) → `invalid_billing_day`.
6. Insertar cabecera en `contracts`. Capturar `unique_violation` → `RAISE EXCEPTION 'numero_contrat_exists'`.
7. Insertar todas las líneas en `contract_machines` con `statut='actif'`. El índice `contract_machines_one_open_per_machine` lanzará `unique_violation` si alguna máquina ya tiene línea abierta → capturar y `RAISE EXCEPTION 'machine_already_assigned'`.
8. `RETURN jsonb_build_object('ok', true, 'contract_id', v_contract_id)`.

Como es una función plpgsql, cualquier `RAISE EXCEPTION` revierte automáticamente todos los inserts previos de la llamada — no se necesita rollback manual.

#### RPC 2 — `update_contract_with_lines(p_contract_id uuid, payload jsonb)`

Recibe el `jsonb` con cabecera + array de líneas. Las líneas existentes llevan `id`; las nuevas no. Las retiradas NO vienen en el array (se detectan por diferencia) y el payload incluye un mapa opcional de fechas de fin.

Estructura del payload:
```json
{
  "client_id": 42,
  "date_debut": "2026-06-01",
  "date_renouvellement": null,
  "statut": "actif",
  "billing_day": 5,
  "maintenance_frequency": "mensuel",
  "lines": [
    { "id": "uuid-existente", "machine_id": "SN123", "date_debut": "2026-06-01", "billing_day_override": null, "maintenance_frequency_override": null, "notes": null },
    { "machine_id": "SN999", "date_debut": "2026-06-15", "billing_day_override": null, "maintenance_frequency_override": null, "notes": null }
  ],
  "retire": [
    { "id": "uuid-a-retirar", "date_fin": "2026-05-31" }
  ]
}
```

Lógica:
1. Guard `service_role`.
2. Validar `billing_day` contrato y overrides (igual que RPC 1).
3. Validar duplicados de `machine_id` entre las líneas activas resultantes → `duplicate_machine_in_payload`.
4. **Validar inmutabilidad de machine_id:** para cada línea con `id`, comparar su `machine_id` contra el actual en BD. Si difiere → `RAISE EXCEPTION 'machine_id_immutable'`.
5. Actualizar cabecera `contracts`.
6. Insertar líneas nuevas (sin `id`) con `statut='actif'`. Capturar `unique_violation` → `machine_already_assigned`.
7. Actualizar líneas existentes (con `id`): SOLO campos mutables (`date_debut`, `billing_day_override`, `maintenance_frequency_override`, `notes`). NUNCA `machine_id`.
8. Retirar las líneas del array `retire`: `date_fin = <fecha del payload>`, `statut='terminé'`. Validar que cada `date_fin >= date_debut` de la línea → `invalid_date_fin`.
9. `RETURN jsonb_build_object('ok', true, 'contract_id', p_contract_id)`.

#### RPC 3 — `can_delete_contract(p_contract_id uuid)`

Función de solo lectura que cuenta dependencias:
1. Guard `service_role`.
2. Contar incidencias asociadas a las líneas del contrato (`incidents` vía `contract_machine_id IN (líneas del contrato)` + legacy `contract_id = p_contract_id`).
3. Contar contadores (`machine_counters.contract_id = p_contract_id`).
4. Contar mantenimientos (`maintenance_plans.contract_id = p_contract_id`).
5. `RETURN jsonb_build_object('can_delete', <bool>, 'incidents', n1, 'counters', n2, 'maintenance', n3)`.

No borra nada — solo informa. El borrado real lo sigue haciendo `deleteContractAction` con un DELETE directo, pero solo si `can_delete` es `true`.

**GRANTs:** las 3 funciones REVOKE de PUBLIC/anon/authenticated, GRANT a service_role.

---

### Bloque B — Server Actions

#### `src/app/admin/contracts/new/actions.ts`

Reescribir `createContractAction`:
- Mantener la validación de formato existente (campos obligatorios, billing_day 1-31, parseo de líneas).
- Construir el `payload` jsonb.
- Invocar `createAdminClient().rpc('create_contract_with_lines', { payload })`.
- Mapear los errores tipados de la RPC a mensajes en francés:
  - `numero_contrat_exists` → "Ce numéro de contrat existe déjà."
  - `machine_already_assigned` → "Une ou plusieurs machines sont déjà assignées à un autre contrat actif."
  - `duplicate_machine_in_payload` → "Une machine apparaît en double dans le contrat."
  - `invalid_billing_day` → "Le jour de facturation doit être entre 1 et 31."
  - `no_lines` → "Veuillez ajouter au moins une machine au contrat."
  - genérico → "Une erreur est survenue lors de la création du contrat."
- En éxito: `redirect('/admin/contracts')`.

#### `src/app/admin/contracts/[id]/actions.ts`

Reescribir `updateContractAction`:
- Validación de formato + parseo de `lines` y `retire`.
- Invocar `createAdminClient().rpc('update_contract_with_lines', { p_contract_id: id, payload })`.
- Mapear errores (incluye los de arriba + `machine_id_immutable` → "Impossible de changer la machine d'une ligne existante. Retirez la machine et ajoutez-en une nouvelle." + `invalid_date_fin` → "La date de fin doit être postérieure à la date de début.").

Reescribir `deleteContractAction`:
- Invocar `createAdminClient().rpc('can_delete_contract', { p_contract_id: id })`.
- Si `can_delete === false`: NO borrar; devolver/propagar un mensaje que liste los bloqueos (incidencias, contadores, mantenimientos). Como la action actual devuelve `void` y hace redirect, cambiar su firma a `Promise<{ error: string } | void>` para poder mostrar el error en el formulario.
- Si `can_delete === true`: DELETE directo (como ahora) + redirect.

---

### Bloque C — ContractForm.tsx

1. **Selector de fecha de fin al retirar:** cuando el usuario pulsa "Retirer" sobre una línea EXISTENTE (con `id`), en lugar de eliminarla del array sin más, mostrar un input `date` para la `date_fin` y mover esa línea a un estado `retired` que se serializa en el campo `retire`. Las líneas nuevas (sin `id`) se siguen eliminando directamente del array.
2. **Bloqueo de cambio de máquina en líneas existentes:** el `<select>` de máquina de una línea con `id` pasa a ser de solo lectura (mostrar el `machine_id` actual como texto, no como selector editable). Añadir un botón "Remplacer la machine" que retira la línea actual (con fecha) y añade una línea nueva vacía.
3. Serializar dos campos hidden: `lines` (activas) y `retire` (retiradas con su `date_fin`).

El componente `deleteAction` ahora puede devolver error → mostrar el mensaje de bloqueo en el área de error existente.

---

### Bloque D — Páginas que invocan el formulario

- `src/app/admin/contracts/[id]/page.tsx`: si `deleteAction` cambia de firma (devuelve error), ajustar el wiring para mostrar el error. Verificar que `initialLines` sigue pasándose correctamente.
- `src/app/admin/contracts/new/page.tsx`: sin cambios de lógica esperados (verificar que compila).

---

## Lo que NO entra en esta fase

- `record_machine_counter(...)` RPC (opcional en la auditoría — el índice único de Fase 1 ya cubre la concurrencia de contadores)
- Cleanup de columnas legacy (Fase 4)
- Mantenimiento granular por máquina (Fase 3)
- RPCs legacy `create_client_with_contract` / `create_machine_with_contract` (se revisan en Fase 4)

---

## Seguridad y RLS

- Las 3 RPCs son `SECURITY DEFINER` con guard `service_role` — no invocables por clientes/técnicos directamente.
- Las Server Actions validan `requireAdmin()` ANTES de invocar la RPC con `createAdminClient()`.
- El patrón es idéntico a `fix_rpc_privilege_escalation` — no introduce nueva superficie de ataque.

---

## Criterios de aceptación

- [ ] Crear contrato con 2 máquinas → cabecera + 2 líneas creadas atómicamente
- [ ] Crear contrato con una máquina ya asignada a otro contrato abierto → error `machine_already_assigned`, NO se crea contrato huérfano
- [ ] Crear contrato con la misma máquina dos veces en el form → error `duplicate_machine_in_payload`
- [ ] Crear contrato con numero_contrat existente → error claro, sin líneas huérfanas
- [ ] Editar contrato e intentar cambiar el machine_id de una línea existente → bloqueado en UI (solo lectura) y en RPC (`machine_id_immutable`)
- [ ] Retirar una máquina con fecha de fin pasada → la línea se cierra con esa fecha, no con hoy
- [ ] Retirar con fecha de fin anterior a date_debut → error `invalid_date_fin`
- [ ] "Remplacer la machine" → cierra línea actual con fecha y abre línea nueva
- [ ] Borrar contrato sin dependencias → se borra correctamente
- [ ] Borrar contrato con incidencias/contadores/mantenimientos → bloqueado con mensaje que lista los bloqueos
- [ ] Build TypeScript limpio

---

## Archivos afectados

**Migración:**
- `supabase/migrations/20260604120000_fase2_rpcs_contratos.sql` (nuevo)

**App:**
- `src/app/admin/contracts/new/actions.ts`
- `src/app/admin/contracts/[id]/actions.ts`
- `src/components/admin/ContractForm.tsx`
- `src/app/admin/contracts/[id]/page.tsx`
- `src/app/admin/contracts/new/page.tsx` (verificación)
