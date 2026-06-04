# Fase 4 — Cleanup Legacy del Refactor de Contratos

**Fecha:** 2026-06-04 (escrito) · **Ejecución: ventana ≥ 2026-06-10**
**Proyecto:** AMD Service SAV
**Rama:** `refactor/fase4-cleanup-legacy`
**Prerequisito:** Fases 1-3 + hotfix mergeados (PRs #25, #26, #27, #28).
**Última fase del refactor de contratos N máquinas.**

---

## Contexto

El refactor PR #23 dejó columnas y funciones legacy en coexistencia para permitir un rollout seguro. Las Fases 1-3 migraron todas las lecturas operativas al modelo nuevo (`contract_machines`). Esta fase elimina los restos legacy.

**Estado de datos en producción (verificado 2026-06-04) — el cleanup es seguro sin pérdida:**
- 1 incidencia con `contract_id` no-null → **también tiene `contract_machine_id`** (migrada).
- 1 contrato con `machine_id` no-null → **tiene su línea en `contract_machines`** (migrada).
- `machine_counters.contract_id` → 0 valores; columna legítima, NO se toca.

**Regla de oro (sin staging):** el código que deja de usar las columnas debe estar desplegado en producción ANTES de aplicar los DROP. El orden es inviolable (ver §5).

---

## Decisiones de diseño (confirmadas)

1. **`lieu_installation` se reemplaza por `machines.localisation`** en las pantallas que lo mostraban (modelo N máquinas: cada máquina tiene su localización).
2. **El fallback legacy de incidencias por `contract_id` se elimina** — tras el cleanup, las incidencias se resuelven solo por `contract_machine_id` (internas) o `machine_id` (públicas QR).
3. **Las RPCs legacy `create_*_with_contract` se eliminan** (0 usos).

---

## Alcance — Qué se elimina y qué NO

### Se ELIMINA

**Columnas:**
- `contracts.machine_id`
- `contracts.lieu_installation`
- `incidents.contract_id`

**Funciones SECURITY DEFINER legacy (0 invocaciones en código):**
- `auth_tech_incident_contract_ids()`
- `auth_tech_incident_ids()`
- `auth_tech_incident_machine_ids()`

**RPCs legacy del modelo viejo (0 invocaciones en código):**
- `create_client_with_contract(...)`
- `create_machine_with_contract(...)`

### NO se toca (comparten nombre pero son del modelo nuevo o legítimas)
- **`contract_machines.contract_id`** — FK del modelo nuevo (línea → contrato). Fundamental.
- **`machine_counters.contract_id`** — referencia histórica legítima del contador a su contrato.
- Cualquier `openLine.contract_id` en código = `contract_machines.contract_id` (nuevo).

---

## Bloque A — Código: quitar lecturas de `incidents.contract_id`

Tras el DROP, `incidents` ya no tiene `contract_id`. Hay que eliminar todas las ramas de fallback legacy que lo leen.

#### `src/lib/csat.ts`
Quitar `contract_id` del SELECT y la rama de fallback `if (!clientId && incident.contract_id)`. El cliente se resuelve solo por `contract_machine_id`. (La resolución por `contract_machine_id` ya existe desde Fase 1.)

#### `src/app/admin/incidents/[id]/page.tsx`
Eliminar la rama `else if (incident.contract_id)` que hace el join legacy `contracts(numero_contrat, clients, machines(...))`. El contexto se resuelve por `contract_machine_id` (interna) y `machine_id` (pública QR). El SELECT de `incident` ya no debe pedir `contract_id`.

#### `src/app/admin/incidents/page.tsx`
- Quitar `contract_id` del SELECT de incidencias.
- Quitar la rama `contract_id.in.(...)` del filtro por cliente: ahora el filtro usa solo `contract_machine_id.in.(cmIds)`. Recalcular `cmIds` como hasta ahora; eliminar `contractIds` del OR (los `contractIds` se siguen usando para construir `cmIds`).
- Quitar la lectura `inc.contracts?...` del mapeo si ya solo aplica vía `contract_machines`.

#### `src/app/tech/incidents/[id]/page.tsx`
Eliminar la rama de fallback `if (incident.contract_id)` con su join legacy `contracts(...machines(...))`. Resolver por `contract_machine_id`/`machine_id`.

**Verificación:** ningún archivo debe leer `incidents.contract_id` tras este bloque. Las incidencias públicas (QR) siguen usando `machine_id` directo — intacto.

---

## Bloque B — Código: reemplazar `lieu_installation` por `machines.localisation`

#### `src/app/tech/planning/page.tsx`
En el SELECT de visitas, quitar `lieu_installation` del join a `contracts` y añadir `localisation` al join de `machines` (dentro de `contract_machines`). En `toRow`, leer `line?.machines?.localisation` en lugar de `line?.contracts?.lieu_installation`. El campo del grupo se renombra conceptualmente a la localización de la máquina (el render no cambia, solo la fuente del dato).

#### `src/app/tech/scan/[serie]/maintenance/[visitId]/page.tsx`
En el SELECT, quitar `lieu_installation` de `contracts` y usar `machines.localisation` (ya viene `machines` en el join). El prop `machineLocation` se alimenta de `line?.machines?.localisation`.

#### `src/app/tech/incidents/[id]/page.tsx`
Tras eliminar el join legacy (Bloque A), la localización viene de `contract_machines.machines.localisation`. Ajustar el tipo y la lectura.

---

## Bloque C — Código: eliminar joins legacy `contracts(...machines(...))`

Los únicos joins directos `contracts → machines` que quedan están en las ramas de fallback de incidencias (Bloque A los elimina como parte de quitar `contract_id`). Verificar con `rg` que no queda ninguno:
```
rg "contracts\s*\([^)]*machines" src/
```
Debe devolver 0 resultados activos tras los Bloques A y B.

---

## Bloque D — Verificación de superficies dudosas

`atelier/page.tsx` y los `AgendaPanel` (admin/tech) fueron señalados en la revisión de Fase 3 como posibles lectores del join legacy. El inventario sugiere que `atelier` ya no lo usa, pero hay que confirmarlo:
- Revisar `src/app/atelier/page.tsx`, `src/components/admin/AgendaPanel.tsx`, `src/components/tech/AgendaPanel.tsx`.
- Si alguno lee `contracts.machine_id`, `lieu_installation`, `incidents.contract_id` o el join legacy → corregir al modelo nuevo.
- Si ya están limpios → documentarlo y no tocar.

---

## Bloque E — `types.ts`

`src/lib/supabase/types.ts` declara las columnas/funciones legacy. Tras actualizar el código (Bloques A-D), editar `types.ts` para quitar:
- `machine_id` y `lieu_installation` de `contracts` (Row/Insert/Update) + su FK relationship.
- `contract_id` de `incidents` (Insert/Update) + su FK relationship.
- Las funciones `auth_tech_incident_*` y las RPCs `create_*_with_contract` del bloque `Functions`.

**`machine_counters.contract_id` y `contract_machines.contract_id` se MANTIENEN en types.ts.**

Editar a mano antes del DROP es seguro: un tipo que omite una columna que aún existe en BD no rompe nada en runtime (solo deja de exponerla), y el código ya no la usa.

---

## Bloque F — Migración SQL (DROP) — SE APLICA AL FINAL

**Archivo:** `supabase/migrations/2026XXXX_cleanup_legacy_contracts.sql` (timestamp el día de ejecución)

```sql
-- Fase 4: cleanup de columnas y funciones legacy del refactor de contratos N máquinas.
-- Prerequisito: el código que ya no usa estas columnas DEBE estar desplegado en producción.
-- Datos verificados migrados: ningún DROP pierde información.

BEGIN;

-- Funciones legacy (0 usos en código).
DROP FUNCTION IF EXISTS auth_tech_incident_contract_ids();
DROP FUNCTION IF EXISTS auth_tech_incident_ids();
DROP FUNCTION IF EXISTS auth_tech_incident_machine_ids();

-- RPCs legacy del modelo viejo (0 usos).
DROP FUNCTION IF EXISTS create_client_with_contract(text, text, text, text, text, text, boolean, text, text, date, date, text);
DROP FUNCTION IF EXISTS create_machine_with_contract(text, text, text, text, boolean, text, bigint, date, text, date, text);

-- Columnas legacy.
ALTER TABLE incidents  DROP COLUMN IF EXISTS contract_id;
ALTER TABLE contracts  DROP COLUMN IF EXISTS machine_id;
ALTER TABLE contracts  DROP COLUMN IF EXISTS lieu_installation;

COMMIT;
```

**Nota sobre firmas de funciones:** las firmas exactas de las RPCs `create_*_with_contract` deben confirmarse contra producción antes de aplicar (con `pg_get_function_identity_arguments`). Las funciones `auth_tech_incident_*` no tienen argumentos (`()`).

**Nota sobre dependencias:** si alguna política RLS aún referencia `incidents.contract_id` o las funciones legacy, el DROP fallará. El plan incluye un paso previo que lista dependencias (`pg_depend` / `pg_policies`) y las resuelve antes del DROP.

---

## Orden de ejecución (§5 — inviolable, sin staging)

1. **Bloques A-E** (todo el código + types.ts) en la rama. Build TypeScript limpio.
2. **PR + merge** → Vercel despliega el código que ya no usa las columnas legacy.
3. **Verificar producción** con el código nuevo (smoke: incidencias admin/tech, CSAT, planning, scan mantenimiento, contadores).
4. **Solo entonces:** confirmar firmas de funciones + listar dependencias + aplicar la migración DROP (Bloque F) vía Supabase MCP.
5. **Regenerar `types.ts`** desde la BD (mcp generate_typescript_types) y confirmar que coincide con la edición manual del Bloque E. Si difiere, ajustar y commitear.
6. Smoke final.

---

## Lo que NO entra

- Cambios funcionales (esta fase es puramente eliminación de legacy).
- Tocar `contract_machines.contract_id` ni `machine_counters.contract_id`.

---

## Criterios de aceptación

- [ ] `rg "incidents.*contract_id|\.contract_id"` sobre `src/` no devuelve lecturas de `incidents.contract_id` (sí puede haber `contract_machines.contract_id` y `machine_counters.contract_id`, que son válidas)
- [ ] `rg "lieu_installation" src/` → 0 resultados
- [ ] `rg "contracts\s*\([^)]*machines" src/` → 0 resultados
- [ ] Ninguna `.rpc('auth_tech_incident...` ni `.rpc('create_*_with_contract'` en `src/`
- [ ] Build TypeScript limpio con el código actualizado (antes del DROP)
- [ ] Tras el deploy: incidencias (admin + tech), CSAT, planning, scan mantenimiento y contadores funcionan
- [ ] Migración DROP aplicada sin error (dependencias resueltas)
- [ ] `types.ts` regenerado coincide con la BD post-DROP
- [ ] Smoke final OK

---

## Archivos afectados

**App:**
- `src/lib/csat.ts`
- `src/app/admin/incidents/[id]/page.tsx`
- `src/app/admin/incidents/page.tsx`
- `src/app/tech/incidents/[id]/page.tsx`
- `src/app/tech/planning/page.tsx`
- `src/app/tech/scan/[serie]/maintenance/[visitId]/page.tsx`
- `src/lib/supabase/types.ts`
- (verificar/posibles) `src/app/atelier/page.tsx`, `src/components/admin/AgendaPanel.tsx`, `src/components/tech/AgendaPanel.tsx`

**Migración (aplicar al final):**
- `supabase/migrations/2026XXXX_cleanup_legacy_contracts.sql` (nuevo)
