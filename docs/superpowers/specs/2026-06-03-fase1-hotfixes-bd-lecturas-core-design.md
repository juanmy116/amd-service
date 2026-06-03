# Fase 1 — Hotfixes BD + Lecturas Core

**Fecha:** 2026-06-03  
**Proyecto:** AMD Service SAV  
**Rama:** `fix/fase1-hotfixes-bd-lecturas-core`  
**Prerequisito:** PR #23 (`89ac2e8`) mergeado en main  
**Siguiente fase:** Fase 2 — RPCs atómicas contratos (spec independiente)

---

## Contexto

El refactor PR #23 introdujo `contract_machines` como tabla de líneas contrato-máquina (1:N). La BD tiene los guardrails correctos, pero la aplicación y las Edge Functions aún leen columnas legacy (`incidents.contract_id`, `incidents.machine_id`, `contracts.machine_id`). Esto provoca que incidencias creadas después del refactor aparezcan sin máquina ni cliente en los listados admin, que el CSAT no se envíe, y que los contadores no se agrupen correctamente.

Esta fase es puramente aditiva y correctiva: no modifica el modelo de datos, solo añade índices, corrige lecturas legacy y actualiza Edge Functions.

---

## Alcance

### Bloque A — Migración SQL (additive)

**Archivo:** `supabase/migrations/2026XXXX_fase1_indices_contadores.sql`

Tres índices nuevos, ningún DROP:

```sql
-- 1. Unicidad de contador activo por máquina y mes
-- Elimina la posibilidad de dos relevés activos concurrentes para la misma máquina/mes
CREATE UNIQUE INDEX IF NOT EXISTS machine_counters_one_active_per_month
  ON public.machine_counters (machine_id, year, month)
  WHERE status = 'actif';

-- 2. Rendimiento en listados de incidencias por línea de contrato
CREATE INDEX IF NOT EXISTS incidents_contract_machine_id_idx
  ON public.incidents (contract_machine_id);

-- 3. Aceleración de getOpenLineForMachine()
CREATE INDEX IF NOT EXISTS contract_machines_open_active_idx
  ON public.contract_machines (contract_id, machine_id)
  WHERE date_fin IS NULL AND statut = 'actif';
```

Los tres índices usan `IF NOT EXISTS` para que la migración sea idempotente en caso de reintento.

---

### Bloque B — App: incidencias

#### `src/lib/csat.ts`

**Problema:** `sendCsatForIncident` retorna temprano si `incident.contract_id` es null. Las incidencias nuevas tienen `contract_machine_id` y `contract_id=null`, por lo que nunca se envía el CSAT ni se cierra automáticamente la incidencia.

**Solución:** resolver el cliente en dos pasos:
1. Si `incident.contract_id` existe → flujo actual (fallback legacy)
2. Si no → resolver por `incident.contract_machine_id → contract_machines.contract_id → contracts.client_id`

La función debe devolver el mismo resultado en ambos casos; solo cambia la ruta de resolución.

#### `src/app/admin/incidents/page.tsx`

**Problema:** el SELECT usa `machine_id` y `contract_id`, ambos `null` en incidencias nuevas. Los listados muestran máquina y cliente en blanco. El filtro por cliente no encuentra incidencias nuevas.

**Solución:**
- Añadir al SELECT: `contract_machine_id, contract_machines(machine_id, machines(numero_serie, modele), contracts(client_id, clients(nom)))`
- Al mapear cada incidencia, priorizar los datos de `contract_machines` sobre los legacy de `machine_id`/`contract_id`
- El filtro por cliente debe buscar en ambas rutas: `contract_id` para legacy y `contract_machines.contracts.client_id` para nuevas

#### `src/app/admin/incidents/[id]/page.tsx`

**Problema:** el contexto (máquina, contrato, cliente) se resuelve solo por `incident.contract_id`. Para incidencias nuevas queda vacío.

**Solución:** resolver contexto en orden de prioridad:
1. `contract_machine_id → contract_machines(machine_id, machines, contracts(client_id, clients))` si existe
2. Fallback: `machine_id` directo (incidencias públicas QR legacy)
3. Fallback: `contract_id` (incidencias internas legacy pre-refactor)

---

### Bloque C — App: contadores

#### `src/app/admin/contadores/page.tsx`

**Problema:** carga máquinas con `contracts(statut, client_id, clients(...))` usando el join legacy `contracts.machine_id`. Las máquinas en contratos nuevos no aparecen agrupadas bajo su cliente porque `contracts.machine_id` es null.

**Solución:** construir el listado desde `contract_machines`:
```
contract_machines
  WHERE date_fin IS NULL AND statut = 'actif'
  JOIN machines(numero_serie, modele)
  JOIN contracts(client_id, clients(nom))
```
Incluir un grupo «Sin contrato activo» para máquinas sin línea abierta (query separada: `machines` que no aparecen en `contract_machines WHERE date_fin IS NULL`).

#### `src/app/admin/contadores/[serie]/page.tsx`

**Problema:** obtiene el contrato activo con `.from('contracts').eq('machine_id', numero_serie)`. Para contratos nuevos, `contracts.machine_id` es null — la tarjeta de contrato/cliente queda vacía.

**Solución:** usar `getOpenLineForMachine(numero_serie)` (ya existe en `src/lib/contract-machines.ts`) para obtener la línea abierta, luego cargar el contrato y cliente desde esa línea.

#### `src/app/admin/contadores/[serie]/actions.ts`

**Problema:** la verificación de duplicado (líneas 29–39) no es atómica frente a escrituras concurrentes. Tras añadir el índice único del Bloque A, un insert duplicado lanzará error Postgres `23505`.

**Solución:** capturar el error `23505` en el bloque try/catch y devolver un error de acción claro (`"Un relevé actif existe déjà pour ce mois"`) en lugar de dejar que explote con un error genérico de servidor.

---

### Bloque D — Edge Functions

#### `supabase/functions/princity-counters/index.ts`

**Problema 1:** no filtra `contract_machines.statut='actif'`. Una línea suspendida pero con `date_fin IS NULL` puede generar contadores.

**Problema 2:** usa siempre `contracts.billing_day`, ignorando `contract_machines.billing_day_override`.

**Problema 3:** la idempotencia se verifica con una consulta previa, no con el índice único — dos ejecuciones concurrentes del cron pueden insertar duplicados.

**Solución:**
- Añadir `statut: 'actif'` al filtro de líneas abiertas
- Calcular `effectiveBillingDay = line.billing_day_override ?? contract.billing_day`
- Usar `effectiveBillingDay` en la lógica de cierre de mes
- Capturar el error Postgres `23505` en el insert y tratarlo como idempotencia exitosa (no como error)

#### `supabase/functions/princity-alerts/index.ts`

**Problema:** al insertar la incidencia incluye `contract_id: openLine.contract_id` (campo legacy). Si el cleanup de Fase 4 elimina `incidents.contract_id`, esta inserción fallará.

**Solución:** eliminar `contract_id` del objeto de inserción. La incidencia ya lleva `contract_machine_id` y `machine_id=null` — suficiente para el modelo nuevo.

---

## Lo que NO entra en esta fase

- Portal lista incidencias muestra máquina vacía (cosmético, baja prioridad)
- `getOpenLineForMachine()` devuelve `null` en error silencioso (se corrige en Fase 2)
- Funciones RLS legacy `auth_tech_incident_*` basadas en `incidents.contract_id` (se eliminan en Fase 4)
- RPCs legacy `create_client_with_contract` / `create_machine_with_contract` (se revisan en Fase 4)
- Formulario `/api/contact` (spec independiente)

---

## Orden de ejecución dentro de la rama

1. Migración SQL (Bloque A) — aplicar primero para que el índice único esté activo antes de que la app lo capture
2. Bloque B (incidencias) — independiente entre sí, puede hacerse en cualquier orden
3. Bloque C (contadores) — independiente entre sí
4. Bloque D (Edge Functions) — deploy tras merge del PR

---

## Criterios de aceptación

- [ ] Intentar guardar manualmente un contador duplicado (mismo mes) devuelve error claro, no 500
- [ ] Incidencia interna nueva aparece en listado admin con máquina y cliente correctos
- [ ] Filtro por cliente en admin/incidents encuentra incidencias nuevas
- [ ] Detalle de incidencia nueva muestra máquina, contrato y cliente
- [ ] Al cerrar una incidencia nueva, el CSAT se envía al email del cliente
- [ ] `/admin/contadores` agrupa máquinas de contratos nuevos bajo su cliente
- [ ] `/admin/contadores/[serie]` muestra contrato activo correcto para contratos nuevos
- [ ] `princity-counters` no procesa líneas con `statut != 'actif'`
- [ ] `princity-counters` respeta `billing_day_override` cuando está definido
- [ ] `princity-alerts` crea incidencia visible en admin con contexto completo (máquina, cliente)

---

## Archivos afectados

**Migración:**
- `supabase/migrations/2026XXXX_fase1_indices_contadores.sql` (nuevo)

**App:**
- `src/lib/csat.ts`
- `src/app/admin/incidents/page.tsx`
- `src/app/admin/incidents/[id]/page.tsx`
- `src/app/admin/contadores/page.tsx`
- `src/app/admin/contadores/[serie]/page.tsx`
- `src/app/admin/contadores/[serie]/actions.ts`

**Edge Functions:**
- `supabase/functions/princity-counters/index.ts`
- `supabase/functions/princity-alerts/index.ts`
