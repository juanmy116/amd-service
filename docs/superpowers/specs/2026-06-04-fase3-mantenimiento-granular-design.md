# Fase 3 — Mantenimiento Granular por Máquina

**Fecha:** 2026-06-04
**Proyecto:** AMD Service SAV
**Rama:** `fix/fase3-mantenimiento-granular`
**Prerequisito:** Fase 2 mergeada (PR #26, `25b3faf`)
**Siguiente fase:** Fase 4 — Cleanup legacy (ventana ≥ 2026-06-10)

---

## Contexto

El sistema de mantenimiento se diseñó para el modelo `1 contrato = 1 máquina`:

- `maintenance_plans` tiene `UNIQUE(contract_id)` — un plan por contrato.
- `maintenance_visits` solo tiene `plan_id` — no sabe a qué máquina corresponde.
- El cierre por QR (`closeMaintenance`) verifica la máquina comparando el `serie` escaneado contra `contracts.machines.numero_serie` (join legacy).
- El cron de notificaciones (`maintenance-cron`) lee la máquina vía `maintenance_plans → contracts → machines`.

Tras el refactor de contratos N-máquinas (`contracts.machine_id` ahora es `NULL` en contratos nuevos), ambos joins legacy devuelven `NULL`. **El mantenimiento está roto para todos los contratos creados con el modelo nuevo:**
- El cierre por QR falla siempre (`machineSerie !== serie` → "Visite introuvable").
- Las notificaciones del cron muestran la máquina vacía.

Esta fase no es solo una mejora estructural — **repara un flujo roto**.

**Estado de producción:** 0 planes y 0 visitas de mantenimiento. No hay datos que migrar.

---

## Decisiones de diseño (confirmadas)

1. **Modelo híbrido:** las visitas son por máquina en BD (`contract_machine_id`), pero se agrupan por contrato/sede en la UI. Trazabilidad individual + comodidad de gestión.
2. **Frecuencia:** al auto-programar la siguiente visita de una máquina se usa `contract_machines.maintenance_frequency_override` si está definido, si no la frecuencia del plan. Reutiliza `resolveMaintenanceFrequency()`.
3. **`contract_machine_id` NOT NULL:** como no hay datos legacy, la columna es obligatoria desde el inicio — sin fallbacks de lectura.

---

## Arquitectura

```
maintenance_plans (1 por contrato)  ─┐  define frecuencia base + notas
                                     │
maintenance_visits (N, por máquina) ─┴─ contract_machine_id NOT NULL
   │  cada visita = una máquina de una línea de contrato
   ▼
Cierre QR (técnico): valida visita ↔ máquina escaneada vía contract_machine_id
Cron: notifica leyendo máquina vía contract_machines, no join legacy
UI admin: agrupa visitas por contrato/sede
```

---

## Alcance

### Bloque A — Migración SQL

**Archivo:** `supabase/migrations/20260604130000_fase3_maintenance_granular.sql`

```sql
-- Fase 3: mantenimiento granular por máquina.
-- Producción tiene 0 visitas, por lo que contract_machine_id puede ser NOT NULL directamente.

ALTER TABLE maintenance_visits
  ADD COLUMN contract_machine_id uuid NOT NULL REFERENCES contract_machines(id) ON DELETE CASCADE;

CREATE INDEX maintenance_visits_contract_machine_id_idx
  ON maintenance_visits (contract_machine_id);
```

`ON DELETE CASCADE`: si se borra la línea de contrato, sus visitas se borran con ella (coherente con el cascade de `contract_machines` desde `contracts`).

> **Nota de seguridad:** el guard `ADD COLUMN ... NOT NULL` sin DEFAULT falla si la tabla tiene filas. Producción está vacía (verificado), así que es seguro. Si por cualquier motivo hubiera filas al aplicar, la migración abortará limpiamente sin dejar estado parcial — en ese caso habría que añadir la columna nullable, poblarla y luego `SET NOT NULL`.

---

### Bloque B — Creación de plan: una visita por línea activa

#### `src/app/admin/maintenance/new/actions.ts`

**Problema:** `createMaintenancePlanAction` crea el plan y UNA sola visita con `plan_id`, sin máquina.

**Solución:**
1. Insertar el plan (igual que ahora).
2. Cargar las líneas activas del contrato con `getActiveLinesForContract(supabase, contract_id)` (ya existe en `src/lib/contract-machines.ts`).
3. Si no hay líneas activas → error `'Ce contrat n'a aucune machine active.'` y rollback del plan (borrar el plan recién creado).
4. Insertar una visita por cada línea activa, todas con la misma `scheduled_date` (`first_visit`), `status='planifié'`, y su `contract_machine_id`.

---

### Bloque C — Cierre por QR (técnico)

#### `src/app/tech/scan/[serie]/maintenance/[visitId]/actions.ts`

**Problema:** la verificación visita ↔ máquina usa `contracts.machines.numero_serie` (legacy, roto). El auto-programado usa la frecuencia del plan sin override.

**Solución — reescribir el SELECT y las validaciones:**
1. Cargar la visita con join a `contract_machines(machine_id, maintenance_frequency_override, machines(numero_serie, marque, modele), contracts(numero_contrat, maintenance_frequency, clients(nom_client)))`.
2. Verificar pertenencia: `visit.contract_machines.machine_id === serie` (en lugar del join legacy). Si no coincide → "Visite introuvable."
3. Cerrar la visita igual que ahora (status, done_at, done_by, qr_verified, notes).
4. Guardar piezas igual que ahora.
5. **Auto-programar siguiente visita:** misma `contract_machine_id`, `plan_id` igual, frecuencia resuelta con `resolveMaintenanceFrequency({ maintenance_frequency_override }, { maintenance_frequency })` → 30 días si `mensuel`, 90 si `trimestriel`. Si la frecuencia resuelta es `null`, usar el comportamiento actual del plan como fallback (frecuencia del plan).
6. Notificación Matrix: tomar máquina/cliente de la línea cargada, no del join legacy.

---

### Bloque D — Cron de notificaciones

#### `supabase/functions/maintenance-cron/index.ts`

**Problema:** el SELECT de visitas usa `maintenance_plans → contracts → machines` (legacy).

**Solución:** cambiar el SELECT a:
```
maintenance_visits
  → contract_machines(machine_id, machines(numero_serie, marque, modele),
                      contracts(numero_contrat, clients(nom_client)))
  → maintenance_plans(frequency, notes)
```
Las notificaciones leen la máquina/cliente de `contract_machines`. El resto de la lógica (marcar atrasadas, ventana de 3 días, matrix_notified) no cambia.

---

### Bloque E — UI admin: agrupación híbrida

#### `src/app/admin/maintenance/page.tsx` (lista de planes)

**Cambio:** cada plan muestra el número de máquinas/visitas y el estado agregado del ciclo actual (cuántas visitas abiertas/atrasadas tiene). Cargar las visitas vía `maintenance_plans → maintenance_visits` y contar por estado. El conteo de máquinas viene de las líneas activas del contrato.

#### `src/app/admin/maintenance/[id]/page.tsx` (detalle del plan)

**Cambio:** listar las visitas del plan agrupadas, mostrando por cada máquina (vía `contract_machine_id → machines`) su próxima visita y estado. Reemplazar cualquier lectura legacy de `contracts.machines` por la lectura vía `contract_machines`.

#### `src/app/tech/scan/[serie]/page.tsx` (ficha de máquina escaneada)

**Problema:** la visita pendiente se busca por `plan_id` sin filtrar por máquina (línea ~114). Con N visitas en un plan, al escanear la máquina A puede mostrarse la visita de otra máquina. El archivo ya usa `getOpenLineForMachine()` (Fase 1), por lo que tiene `openLine.id` (= `contract_machine_id`).

**Solución:** añadir `.eq('contract_machine_id', openLine.id)` a la query de `maintenance_visits`. Así la ficha muestra solo la visita pendiente de la máquina escaneada.

#### `src/app/tech/planning/page.tsx` (planning técnico)

**Problema:** lista visitas con join legacy `maintenance_plans → contracts → machines` (devuelve `NULL` en contratos nuevos).

**Solución:** cambiar el SELECT a leer la máquina vía `maintenance_visits → contract_machines(machine_id, machines(numero_serie, marque, modele), contracts(numero_contrat, clients(nom_client)))`. Agrupar visualmente las visitas del mismo contrato bajo el nombre del cliente.

#### `src/app/admin/calendrier/page.tsx` (calendario admin)

**Problema:** mismo join legacy `maintenance_plans → contracts → machines`.

**Solución:** leer la máquina/cliente vía `contract_machines` igual que en planning. El resto del calendario (fechas, enlaces a `/admin/maintenance/[id]`) no cambia.

---

## Lo que NO entra en esta fase

- Asignación de visitas a técnicos vía dispatcher Atelier (ya existe, no se toca).
- Migración de datos (producción vacía).
- Cleanup de columnas legacy (Fase 4).
- Cambios en las políticas RLS de `maintenance_visits` (el técnico sigue viendo todas las visitas — equipo pequeño).

---

## Seguridad y RLS

- `maintenance_visits` ya tiene RLS (admin total; técnico SELECT + UPDATE). Añadir `contract_machine_id` no cambia las políticas.
- El cierre por QR sigue protegido: la verificación `contract_machines.machine_id === serie` impide cerrar la visita de otra máquina conociendo solo el `visitId`.

---

## Criterios de aceptación

- [ ] Crear plan para contrato de N máquinas → se generan N visitas iniciales (una por línea activa) con su `contract_machine_id`
- [ ] Crear plan para contrato sin máquinas activas → error claro, plan no queda huérfano
- [ ] Cerrar visita escaneando el QR de SU máquina → cierra correctamente
- [ ] Intentar cerrar la visita de la máquina A escaneando el QR de la máquina B → "Visite introuvable"
- [ ] Al cerrar, la siguiente visita se programa para la MISMA máquina con la frecuencia correcta (override de línea si existe)
- [ ] Máquina con `maintenance_frequency_override='mensuel'` en contrato trimestral → siguiente visita a 30 días
- [ ] Notificación Matrix del cron muestra la máquina correcta (no vacía)
- [ ] Escanear el QR de una máquina muestra la visita pendiente de ESA máquina, no de otra del mismo contrato
- [ ] `/tech/planning` muestra las visitas con su máquina correcta (no vacía), agrupadas por contrato
- [ ] `/admin/calendrier` muestra las visitas con su máquina correcta
- [ ] `/admin/maintenance` muestra conteo de máquinas y estado agregado por plan
- [ ] `/admin/maintenance/[id]` lista visitas por máquina
- [ ] Build TypeScript limpio

---

## Archivos afectados

**Migración:**
- `supabase/migrations/20260604130000_fase3_maintenance_granular.sql` (nuevo)

**App:**
- `src/app/admin/maintenance/new/actions.ts` — generar N visitas por línea activa
- `src/app/tech/scan/[serie]/maintenance/[visitId]/actions.ts` — cierre QR + auto-programado por máquina
- `src/app/tech/scan/[serie]/page.tsx` — filtrar visita pendiente por `contract_machine_id`
- `src/app/tech/planning/page.tsx` — leer máquina vía `contract_machines`
- `src/app/admin/calendrier/page.tsx` — leer máquina vía `contract_machines`
- `src/app/admin/maintenance/page.tsx` — conteo de máquinas + estado agregado por plan
- `src/app/admin/maintenance/[id]/page.tsx` — listar visitas por máquina

**Edge Functions:**
- `supabase/functions/maintenance-cron/index.ts`
