# Refactor del Modelo de Contratos — Documento de Diseño

> Fecha: 2026-06-03
> Estado: Pendiente de aprobación del usuario
> Proyecto: AMD Service SAV
> Sesión: 24

---

## 1. Resumen

Refactor del modelo de datos de `contracts` para pasar de **1 contrato = 1 máquina** a **1 contrato = N máquinas**, con historia (una máquina puede rotar entre contratos a lo largo del tiempo). El cambio se materializa con una nueva tabla intermedia `contract_machines` que vincula contratos y máquinas con fechas de entrada/salida, estado y overrides puntuales (día de facturación, frecuencia de mantenimiento).

**Por qué ahora:** durante la carga del primer cliente real (AXA SENEGAL, 14 máquinas, ver `project_axa_carga.md`) se detectó que el modelo actual no refleja la realidad del negocio: AMD firma contratos físicos que amparan hasta 20+ máquinas, no una sola. Crear 14 "contratos lógicos" como workaround acumularía deuda técnica que habría que migrar más tarde con muchos más datos en producción. El usuario decidió pausar la carga de clientes y refactorizar el modelo primero (Opción B de las 3 evaluadas).

**Restricciones fundamentales:**
- La app está viva en producción (`https://amd-service.vercel.app`); el refactor no puede romperla.
- La BD tiene hoy **1 fila en `contracts`** y **2 filas en `incidents`**: la migración de datos es trivial, pero el código que las consume es extenso (~14 archivos en `src/`).
- 6 funciones SECURITY DEFINER mantienen RLS sin recursión: hay que preservar esa propiedad.
- El plan se ejecutará por un único desarrollador (el usuario) con Claude como copiloto.

---

## 2. Modelo de datos

### 2.1 Tabla `contracts` — modificada

```
contracts
  ├── id                    uuid PK
  ├── numero_contrat        text UNIQUE          -- ej: "064-007"
  ├── client_id             bigint FK clients(id)
  ├── date_debut            date NOT NULL        -- inicio del papel
  ├── date_renouvellement   date NULL            -- fecha de renovación contractual
  ├── statut                contract_status      -- actif / suspendu / terminé (del papel global)
  ├── billing_day           smallint NULL        -- default del contrato (1-31)
  ├── maintenance_frequency text NULL            -- default 'mensuel' o 'trimestriel'
  └── created_at            timestamptz

  ❌ ELIMINADO: machine_id          → ahora en contract_machines
  ❌ ELIMINADO: lieu_installation   → ahora solo en machines.localisation
```

### 2.2 Tabla NUEVA `contract_machines`

```
contract_machines
  ├── id                                  uuid PK
  ├── contract_id                         uuid FK contracts(id) ON DELETE CASCADE
  ├── machine_id                          text FK machines(numero_serie) ON DELETE RESTRICT
  ├── date_debut                          date NOT NULL              -- cuando la maq entra al contrato
  ├── date_fin                            date NULL                  -- NULL = activa
  ├── statut                              contract_machine_status    -- actif / suspendu / terminé
  ├── billing_day_override                smallint NULL              -- override del billing_day del contrato (1-31)
  ├── maintenance_frequency_override      text NULL                  -- override de frecuencia ('mensuel'/'trimestriel')
  ├── notes                               text NULL                  -- notas internas de esta vinculación
  └── created_at                          timestamptz DEFAULT now()
```

**Constraints:**

```sql
-- Una máquina solo puede tener UNA vinculación abierta (sin date_fin) a la vez,
-- INDEPENDIENTEMENTE del statut. Una máquina suspendida en contrato A sigue
-- bloqueando que la misma máquina se asigne a otro contrato; debe retirarse
-- definitivamente (poner date_fin) antes de reasignarla.
CREATE UNIQUE INDEX contract_machines_one_open_per_machine
  ON contract_machines (machine_id)
  WHERE date_fin IS NULL;

-- Coherencia temporal
CHECK (date_fin IS NULL OR date_fin >= date_debut)

-- Coherencia de estado
CHECK (statut <> 'terminé' OR date_fin IS NOT NULL)
```

**Enum nuevo:**

```sql
CREATE TYPE contract_machine_status AS ENUM ('actif', 'suspendu', 'terminé');
```

### 2.3 Tabla `incidents` — modificada

```
incidents
  ├── (todas las columnas actuales se preservan EXCEPTO contract_id)
  ❌ ELIMINADO: contract_id              → reemplazado por contract_machine_id
  ✅ NUEVO:     contract_machine_id      uuid FK contract_machines(id) NULL
  ✅ MANTIENE:  machine_id               text FK machines(numero_serie) NULL
                                          (necesario para incidencias públicas via /signaler)
```

**Reglas de coherencia:**

```
Incidencia interna (admin/técnico/cliente vía portal):
  contract_machine_id NOT NULL
  machine_id          NULL

Incidencia pública (formulario /signaler/[serie]):
  contract_machine_id NULL
  machine_id          NOT NULL

NUNCA ambas NULL.
NUNCA ambas NOT NULL.
```

**Constraint:**

```sql
CHECK ((contract_machine_id IS NULL) <> (machine_id IS NULL))
```

**Implicación:** las queries que hoy hacen `JOIN incidents ON contract_id` o `WHERE machine_id = X` deben reescribirse para usar la nueva FK. Para incidencias públicas, `machine_id` sigue siendo el camino directo a la máquina.

**Nota sobre denormalización:** para incidencias internas, la máquina se obtiene haciendo `JOIN incidents → contract_machines → machines`. Es un join adicional respecto al modelo viejo (que tenía `machine_id` directo en `incidents`). En queries de listado intensivas esto podría notarse; si en práctica se observa lentitud, se puede añadir un trigger `BEFORE INSERT/UPDATE` que copie `machine_id` desde la línea, manteniendo el CHECK XOR como guardrail. Por defecto: NO denormalizar; medir primero. Decisión a confirmar tras smoke test si surge problema.

### 2.4 Tabla `maintenance_plans` — sin cambios estructurales

Se mantiene `UNIQUE(contract_id)`: un único plan de mantenimiento por contrato global. El override por máquina vive en `contract_machines.maintenance_frequency_override`. Esto refleja la decisión de diseño "mixto": cadencia default del contrato + override opcional por línea.

Los `maintenance_visits` siguen colgando del `maintenance_plan` actual. La asignación de visitas a máquinas concretas (cuando el técnico va a una sede con varias máquinas del mismo plan) se gestionará en una mejora posterior — fuera del scope de este refactor.

### 2.5 Tabla `machine_counters` — sin cambios

`machine_counters.contract_id` sigue apuntando al contrato global con `ON DELETE SET NULL`. Es un contexto histórico, no una FK que define identidad. La línea concreta de `contract_machines` se infiere por `machine_id` + fecha cuando hace falta.

---

## 3. Migraciones SQL

Una sola migración cronológica en `supabase/migrations/`. El nombre se generará en el momento de ejecutar el plan (timestamp + descripción): `2026XXXXXXXXXX_contracts_n_machines.sql`.

### 3.1 Estructura de la migración forward

El timestamp del archivo (`2026XXXXXXXXXX`) se genera en el momento de ejecutar el plan con `supabase migration new contracts_n_machines`, no es un placeholder a rellenar manualmente.

```sql
BEGIN;

-- 1. Enum nuevo
CREATE TYPE contract_machine_status AS ENUM ('actif', 'suspendu', 'terminé');

-- 2. Tabla nueva (sin políticas RLS aún)
CREATE TABLE contract_machines (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  contract_id uuid NOT NULL REFERENCES contracts(id) ON DELETE CASCADE,
  machine_id text NOT NULL REFERENCES machines(numero_serie) ON DELETE RESTRICT,
  date_debut date NOT NULL,
  date_fin date NULL,
  statut contract_machine_status NOT NULL DEFAULT 'actif',
  billing_day_override smallint NULL CHECK (billing_day_override BETWEEN 1 AND 31),
  maintenance_frequency_override text NULL CHECK (maintenance_frequency_override IN ('mensuel', 'trimestriel')),
  notes text NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT contract_machines_date_fin_after_debut CHECK (date_fin IS NULL OR date_fin >= date_debut),
  CONSTRAINT contract_machines_termine_has_date_fin CHECK (statut <> 'terminé' OR date_fin IS NOT NULL)
);

CREATE UNIQUE INDEX contract_machines_one_open_per_machine
  ON contract_machines (machine_id)
  WHERE date_fin IS NULL;

CREATE INDEX contract_machines_contract_id_idx ON contract_machines (contract_id);
CREATE INDEX contract_machines_machine_id_idx ON contract_machines (machine_id);

ALTER TABLE contract_machines ENABLE ROW LEVEL SECURITY;

-- 3. Migrar datos del contrato existente
INSERT INTO contract_machines (contract_id, machine_id, date_debut, statut)
SELECT id, machine_id, date_debut, statut
FROM contracts
WHERE machine_id IS NOT NULL;

-- 4. Añadir columna a incidents y migrar
ALTER TABLE incidents ADD COLUMN contract_machine_id uuid NULL REFERENCES contract_machines(id);

UPDATE incidents
SET contract_machine_id = cm.id
FROM contract_machines cm
WHERE incidents.contract_id = cm.contract_id
  AND incidents.machine_id = cm.machine_id
  AND incidents.source IS DISTINCT FROM 'public';

-- 5. Para incidencias públicas, machine_id se mantiene, contract_machine_id queda NULL.
-- Para incidencias internas, machine_id pasa a NULL (el dato vive en cm.machine_id).
UPDATE incidents
SET machine_id = NULL
WHERE contract_machine_id IS NOT NULL;

-- 6. Validación dentro de la transacción
DO $$
DECLARE
  internal_incidents_without_link int;
  contracts_with_machine_id int;
BEGIN
  SELECT COUNT(*) INTO internal_incidents_without_link
  FROM incidents
  WHERE source IS DISTINCT FROM 'public'
    AND contract_machine_id IS NULL;

  IF internal_incidents_without_link > 0 THEN
    RAISE EXCEPTION 'Migración abortada: % incidencias internas no encontraron su contract_machine', internal_incidents_without_link;
  END IF;

  SELECT COUNT(*) INTO contracts_with_machine_id
  FROM contracts WHERE machine_id IS NOT NULL;

  IF contracts_with_machine_id <> (SELECT COUNT(*) FROM contract_machines) THEN
    RAISE EXCEPTION 'Migración abortada: conteo no cuadra (% contracts antiguos vs % contract_machines)', contracts_with_machine_id, (SELECT COUNT(*) FROM contract_machines);
  END IF;
END $$;

-- 7. Añadir el CHECK de coherencia en incidents (después del UPDATE, no antes)
ALTER TABLE incidents ADD CONSTRAINT incidents_contract_or_machine_xor
  CHECK ((contract_machine_id IS NULL) <> (machine_id IS NULL));

-- 8. Funciones SECURITY DEFINER nuevas (ver sección 4)
-- ... (definiciones completas se generan en el bloque 1 del plan)

-- 9. Políticas RLS de contract_machines (ver sección 4)
-- ...

-- 10. Actualizar políticas de incidents que usaban contract_id
-- ...

COMMIT;
```

**Nota crítica:** los pasos 3–6 ocurren ANTES de añadir el CHECK XOR en `incidents` para evitar abortar la migración a mitad. Si la validación del paso 6 falla, todo se revierte por el `BEGIN/COMMIT` envolvente.

### 3.2 Cleanup (commit separado dentro del PR)

```sql
-- En el último bloque del PR, tras desplegar el código nuevo:
ALTER TABLE contracts DROP COLUMN machine_id;
ALTER TABLE contracts DROP COLUMN lieu_installation;
ALTER TABLE incidents DROP COLUMN contract_id;
```

**Por qué se separa:** el código nuevo no usa estas columnas, pero mantenerlas hasta el final del PR permite que cualquier code review intermedio o testing manual pueda verificar el estado "antes vs después" sin que la BD ya esté mutilada.

### 3.3 Rollback

Migración inversa preparada como archivo `_rollback.sql` adjunto al PR (no aplicada automáticamente):

```sql
BEGIN;
ALTER TABLE contracts ADD COLUMN machine_id text NULL REFERENCES machines(numero_serie);
ALTER TABLE contracts ADD COLUMN lieu_installation text NULL;
ALTER TABLE incidents ADD COLUMN contract_id uuid NULL REFERENCES contracts(id);

-- Restaurar contracts.machine_id desde la línea ACTIVA de cada contrato
UPDATE contracts c SET machine_id = cm.machine_id
FROM contract_machines cm
WHERE cm.contract_id = c.id
  AND cm.statut = 'actif'
  AND cm.date_fin IS NULL;

-- Restaurar incidents.contract_id desde la línea
UPDATE incidents i SET contract_id = cm.contract_id, machine_id = cm.machine_id
FROM contract_machines cm
WHERE i.contract_machine_id = cm.id;

ALTER TABLE incidents DROP CONSTRAINT incidents_contract_or_machine_xor;
ALTER TABLE incidents DROP COLUMN contract_machine_id;
DROP TABLE contract_machines;
DROP TYPE contract_machine_status;
COMMIT;
```

**Limitación conocida del rollback:** si un contrato tiene varias líneas (uno o más rotaciones registradas), el rollback solo preserva la línea activa actual; el historial de rotaciones se pierde. Es aceptable porque el rollback es una salida de emergencia, no un flujo normal.

---

## 4. RLS y funciones SECURITY DEFINER

### 4.1 Funciones nuevas

Reemplazan las 6 funciones actuales preservando la propiedad de "romper recursión RLS sin necesidad de loops".

```sql
CREATE OR REPLACE FUNCTION auth_client_contract_ids() RETURNS SETOF uuid
LANGUAGE sql SECURITY DEFINER STABLE
SET search_path = public, pg_catalog
AS $$
  SELECT c.id FROM contracts c
  WHERE c.client_id IN (
    SELECT cp.client_id FROM client_profiles cp WHERE cp.profile_id = auth.uid()
  );
$$;

CREATE OR REPLACE FUNCTION auth_client_contract_machine_ids() RETURNS SETOF uuid
LANGUAGE sql SECURITY DEFINER STABLE
SET search_path = public, pg_catalog
AS $$
  SELECT cm.id FROM contract_machines cm
  WHERE cm.contract_id IN (SELECT auth_client_contract_ids());
$$;

CREATE OR REPLACE FUNCTION auth_client_machine_ids() RETURNS SETOF text
LANGUAGE sql SECURITY DEFINER STABLE
SET search_path = public, pg_catalog
AS $$
  SELECT DISTINCT cm.machine_id FROM contract_machines cm
  WHERE cm.contract_id IN (SELECT auth_client_contract_ids())
    AND cm.statut = 'actif'
    AND cm.date_fin IS NULL;
$$;

CREATE OR REPLACE FUNCTION auth_tech_contract_machine_ids() RETURNS SETOF uuid
LANGUAGE sql SECURITY DEFINER STABLE
SET search_path = public, pg_catalog
AS $$
  SELECT DISTINCT i.contract_machine_id FROM incidents i
  WHERE i.assigned_to = auth.uid()
    AND i.contract_machine_id IS NOT NULL;
$$;

-- Helper para máquinas asignadas al técnico (deriva de las líneas)
CREATE OR REPLACE FUNCTION auth_tech_assigned_machine_ids() RETURNS SETOF text
LANGUAGE sql SECURITY DEFINER STABLE
SET search_path = public, pg_catalog
AS $$
  SELECT DISTINCT cm.machine_id FROM contract_machines cm
  WHERE cm.id IN (SELECT auth_tech_contract_machine_ids());
$$;
```

Las funciones viejas (`auth_tech_incident_contract_ids`, `auth_tech_incident_machine_ids`, `auth_client_machine_ids` en su forma vieja) se **mantienen durante todo el PR principal** del despliegue (compat) y se **eliminan en el PR-cleanup posterior** (≈ 5-7 días después del merge) cuando ya nada las invoca en producción.

### 4.2 Políticas RLS de `contract_machines`

```sql
CREATE POLICY admin_all_contract_machines ON contract_machines
  FOR ALL USING ((SELECT role FROM profiles WHERE id = auth.uid()) = 'admin');

CREATE POLICY client_own_contract_machines_select ON contract_machines
  FOR SELECT USING (id IN (SELECT auth_client_contract_machine_ids()));

CREATE POLICY tech_assigned_contract_machines_select ON contract_machines
  FOR SELECT USING (id IN (SELECT auth_tech_contract_machine_ids()));
```

No políticas INSERT/UPDATE/DELETE para roles no-admin: solo admins gestionan la vinculación contract↔machine. Clientes y técnicos son lectores.

### 4.3 Políticas RLS de `incidents` actualizadas

Las políticas que usan `contract_id` se reemplazan por las que usan `contract_machine_id`:

```sql
-- ANTES
USING (contract_id IN (SELECT auth_client_contract_ids()))

-- DESPUÉS
USING (contract_machine_id IN (SELECT auth_client_contract_machine_ids()))
```

Las políticas para técnicos por `assigned_to` no cambian (siguen siendo por UUID del usuario).

---

## 5. Cambios en código

### 5.1 Archivos a modificar (~14)

| Archivo | Tipo de cambio |
|---|---|
| `src/app/admin/contracts/new/actions.ts` | INSERT contrato + N inserts en contract_machines (transacción) |
| `src/app/admin/contracts/[id]/actions.ts` | UPDATE contrato; gestión de líneas (add/retire/modify) |
| `src/app/admin/contracts/page.tsx` | Listado: conteo "N machines" en lugar de columna machine |
| `src/app/admin/contracts/[id]/page.tsx` | Detalle: panel "Máquinas del contrato" con tabla de líneas |
| `src/app/admin/incidents/new/actions.ts` | Selector pasa a "contract → máquina del contrato" |
| `src/app/admin/contadores/[serie]/actions.ts` | Resolución de contrato vigente para una máquina via contract_machines |
| `src/app/admin/contadores/cliente/[clientId]/page.tsx` | Contratos activos del cliente + sus máquinas |
| `src/app/admin/machines/[serie]/qr/page.tsx` | Contrato vigente de la máquina via contract_machines |
| `src/app/admin/maintenance/new/page.tsx` | Selector de contratos sin plan |
| `src/app/portal/page.tsx` | Dashboard cliente: contratos + sus máquinas activas |
| `src/app/portal/incidents/new/page.tsx` | Selector de máquinas del cliente via contract_machines |
| `src/app/portal/incidents/[id]/page.tsx` | Detalle incidencia: referencia a la línea (machine + contract) |
| `src/app/tech/scan/[serie]/page.tsx` | Contrato vigente de la máquina |
| `src/app/signaler/[serie]/actions.ts` | Mantiene `machine_id` directo y `contract_machine_id NULL` |

### 5.2 Helpers compartidos

Nuevo módulo `src/lib/contract-machines.ts` con funciones reutilizables:

```typescript
// Línea activa de una máquina (o null)
getActiveContractMachineForMachine(machineId: string): Promise<ContractMachine | null>

// Todas las máquinas activas de un contrato
getActiveMachinesForContract(contractId: string): Promise<ContractMachine[]>

// Resolver billing_day efectivo (override o default contrato)
resolveBillingDay(line: ContractMachine, contract: Contract): number | null

// Resolver maintenance_frequency efectivo
resolveMaintenanceFrequency(line: ContractMachine, contract: Contract): 'mensuel' | 'trimestriel' | null
```

### 5.3 Cambios de UI

- **`ContractForm` rediseñado:**
  - Sección "Contrato": cliente, numero, fechas, statut, billing_day default, maintenance_frequency default.
  - Sección "Máquinas del contrato": selector múltiple. Para cada máquina añadida: date_debut, statut, billing_day override (opcional), maintenance_frequency override (opcional), notas.
  - Validación: máquinas no se pueden añadir si ya están activas en otro contrato (el constraint de BD también lo enforce, pero la UI lo detecta antes).

- **Vista detalle `/admin/contracts/[id]`:**
  - Panel "Máquinas" con tabla: machine_id, localisation (de machines), date_debut, date_fin, statut, billing_day efectivo, frecuencia efectiva.
  - Botones: "Añadir máquina al contrato", "Retirar máquina" (setea date_fin = hoy y statut = terminé), "Editar línea".

- **Listados (`/admin/contracts`):** columna "Machines" muestra contador con tooltip de las primeras 3 (link al detalle).

- **`IncidentForm` (admin y portal):** selector en cascada: primero contrato del cliente, luego máquina de ese contrato (filtrada por líneas activas).

### 5.4 RPCs

- `create_client_with_contract`: se actualiza para aceptar un array de máquinas en lugar de una sola, o se elimina si no se usa desde el frontend (verificación en el plan).
- `create_machine_with_contract`: idem.

---

## 6. Plan de despliegue por bloques

**Estrategia en dos PRs separados:**

- **PR principal** = el refactor en sí, con 4 commits temáticos. Mergeable de una sola vez.
- **PR-cleanup** = un PR pequeñísimo posterior, ejecutable **5-7 días después** del merge del PR principal, una vez verificado en producción que todo va bien. Hace los `DROP COLUMN` y borra funciones obsoletas.

Esta separación da una **red de seguridad de una semana** en producción: si aparece un bug raro tras el merge del PR principal, las columnas viejas siguen disponibles y el rollback es más simple.

### PR principal — 4 commits

#### Bloque 1 — Migración SQL del modelo nuevo
- Archivo migración con: enum, tabla `contract_machines`, constraints, índices, RLS, funciones SECURITY DEFINER nuevas, migración de datos, validaciones dentro de la transacción, actualización de políticas RLS de `incidents`.
- **NO toca columnas viejas** (`contracts.machine_id`, etc.). Coexistencia garantizada.
- Smoke test local: aplicar la migración sobre un dump de producción y verificar que las queries actuales siguen funcionando.

#### Bloque 2 — Helpers TypeScript y tipos
- `src/lib/contract-machines.ts` con los helpers.
- Regenerar tipos de Supabase (`supabase gen types`).
- **Cero cambios funcionales** en server actions / UI.

#### Bloque 3 — Server actions y queries
- Actualizar los ~14 archivos del apartado 5.1 para usar `contract_machines` en lugar de `contracts.machine_id`.
- Mantener compat de lectura en partes que la necesiten (signaler).
- Smoke test manual al final del bloque: la app sigue funcionando con el contrato existente.

#### Bloque 4 — UI
- `ContractForm` rediseñado.
- Vista detalle con panel de máquinas.
- Listados con "N machines".
- `IncidentForm` con cascada contrato → máquina.

### Después del merge del PR principal
- Vercel despliega `main` automáticamente.
- Smoke test producción según sección 7.
- **Las columnas viejas quedan en la BD como red de seguridad temporal** durante la siguiente semana. El código nuevo ya no las usa, pero siguen físicamente disponibles para un rollback de emergencia.

### PR-cleanup posterior (≈ 5-7 días después)

Pequeño PR que ejecuta la limpieza una vez verificado que no hay regresiones en producción:

```sql
-- Migración cleanup
BEGIN;
ALTER TABLE contracts DROP COLUMN machine_id;
ALTER TABLE contracts DROP COLUMN lieu_installation;
ALTER TABLE incidents DROP COLUMN contract_id;

DROP FUNCTION IF EXISTS auth_tech_incident_contract_ids() CASCADE;
DROP FUNCTION IF EXISTS auth_tech_incident_machine_ids() CASCADE;
-- (Otras funciones obsoletas a confirmar tras revisar el código del PR principal)
COMMIT;
```

Adicionalmente, este PR-cleanup evalúa y, si procede, **elimina o actualiza los RPCs antiguos** `create_client_with_contract` y `create_machine_with_contract` (verificación de uso real durante la semana intermedia).

**Tarea programada para no olvidarlo:** ver sección 11 / memoria persistente `project_contracts_refactor.md`.

---

## 7. Testing y rollback

### 7.1 Smoke test producción (post-merge)

1. Crear contrato `TEST-REFACTOR-001` con 2 máquinas existentes (NO Axa, para mantener Axa intacto).
2. Abrir 1 incidencia desde admin para la 1ª máquina del contrato.
3. Abrir 1 incidencia desde portal cliente (simulando login con `client_profiles` test) para la 2ª.
4. Cambiar `date_fin` de la 1ª línea (retirar máquina del contrato).
5. Comprobar que el constraint de exclusividad permite ahora reasignar esa máquina a un contrato distinto.
6. Borrar el contrato test (CASCADE limpia las 2 líneas).
7. Verificar vía MCP: `machines` intactas, `incidents` con CHECK XOR respetado, 0 referencias huérfanas.

### 7.2 Verificación pre-merge

- `npx tsc --noEmit` limpio
- `npm run build` OK
- `/code-review <N>` ejecutado, hallazgos ≥80 corregidos
- Vercel preview verde
- Smoke test manual del flujo Contrato → Incidencia → Mantenimiento

### 7.3 Rollback en producción

**Durante la ventana de 5-7 días entre PR principal y PR-cleanup**, las columnas viejas siguen en la BD, lo que hace el rollback **mucho más simple** que si se hubieran borrado:

**Caso A — La app rompe justo después del merge del PR principal:**
- `git revert <merge_commit>` → push → Vercel despliega versión anterior.
- El código viejo lee las columnas viejas que **siguen ahí intactas** → app funciona en versión anterior sin necesidad de tocar la BD.
- Solo queda la tabla `contract_machines` rellena con la migración de datos, lo cual es inocuo (datos extra que el código viejo ignora).
- Verificar que la app responde correctamente y diagnosticar el bug.

**Caso B — La migración SQL aborta a mitad:**
- No hay caso B. La migración va en `BEGIN/COMMIT` con validaciones internas. Si una validación falla, la transacción se aborta entera y nada se aplica.

**Caso C — Aparece un bug raro días después del merge, pero antes del PR-cleanup:**
- Mismo procedimiento que el caso A. El revert es seguro porque las columnas viejas todavía existen.

**Caso D — Aparece un bug después del PR-cleanup (columnas ya borradas):**
- El rollback requiere aplicar `_rollback.sql` adjunto al PR-cleanup que recrea las columnas eliminadas y restaura los datos desde `contract_machines`.
- Más complejo que A/C, pero estamos al final del recorrido y los bugs ya deberían haberse descubierto antes.

---

## 8. Criterios de éxito

### Tras el merge del PR principal

- ✅ La tabla `contract_machines` existe en producción con sus constraints.
- ✅ El 1 contrato existente en BD se ha migrado a 1 fila de `contract_machines` sin pérdida.
- ✅ Las 2 incidencias internas en BD tienen `contract_machine_id` rellenado.
- ✅ `ContractForm` permite crear un contrato con N máquinas (probado con TEST-REFACTOR-001).
- ✅ `IncidentForm` (admin y portal) permite abrir una incidencia para una línea concreta.
- ✅ El portal cliente muestra todas las máquinas del contrato del cliente.
- ✅ La PWA técnico muestra el contrato vigente al escanear el QR de una máquina.
- ✅ El formulario público `/signaler/[serie]` sigue funcionando (incidencias con `machine_id` directo).
- ✅ Los smoke tests de la sección 7.1 pasan en producción.
- ✅ Las columnas viejas (`contracts.machine_id`, `contracts.lieu_installation`, `incidents.contract_id`) siguen físicamente en la BD pero **no son leídas ni escritas por código nuevo**.

### Tras el merge del PR-cleanup (5-7 días después)

- ✅ Las columnas viejas eliminadas (`DROP COLUMN`).
- ✅ Las funciones SECURITY DEFINER obsoletas eliminadas.
- ✅ Los RPCs viejos eliminados o actualizados según verificación de uso.
- ✅ El proyecto está limpio de cualquier referencia al modelo anterior.

---

## 9. Lo que queda fuera de este refactor

Para mantener el scope limpio:

- **Mantenimiento granular con scan QR por máquina (FEATURE FUTURO IMPORTANTE):** este refactor sienta las bases (la nueva tabla `contract_machines` permite referenciar máquinas concretas dentro de un plan de mantenimiento), pero la **mejora UX/funcional asociada** se hará en un PR separado posterior. **Requisito clave a respetar en ese feature:** el técnico, cuando ejecute una visita de mantenimiento del contrato, deberá confirmar **cada máquina individualmente escaneando su código QR**. La visita queda registrada como "máquinas 3, 7 y 11 mantenidas el día X por el técnico Y, cada una validada por scan QR". Esto implicará:
  - Nueva tabla intermedia entre `maintenance_visits` y `contract_machines` (probablemente `maintenance_visit_machines`).
  - Pantalla nueva en PWA técnico para visitas de mantenimiento que liste las máquinas del contrato y marque cada una como "mantenida" tras el scan del QR físico.
  - Reportes/agenda admin que reflejen el detalle por máquina.
- **Importador de contratos CSV:** este refactor solo arregla el modelo y la UI; el importador masivo de contratos (similar al de máquinas) se evalúa cuando haya muchos clientes que cargar.
- **Histórico visual de rotaciones:** la BD almacena el historial, pero una vista UI que muestre "esta máquina ha estado en X contratos" es mejora posterior.
- **Reportes / facturación derivada:** el refactor no toca cómo se generan facturas; solo el modelo subyacente.
- **Migración de Axa (14 máquinas → contrato `064-007`):** se hará en una sesión posterior tras mergear el refactor. Datos confirmados en `project_axa_carga.md`.

---

## 10. Decisiones de diseño tomadas en el brainstorming

| # | Pregunta | Decisión |
|---|---|---|
| 1 | ¿Rotación de máquinas entre contratos? | Habitual → líneas con date_debut + date_fin |
| 2 | `billing_day`: por contrato o por línea? | Mixto: default contrato + override línea |
| 3 | `lieu_installation`: dónde vive? | Solo en `machines.localisation` (eliminamos del contrato) |
| 4 | Maintenance plan: 1 por contrato o por línea? | Mixto: 1 plan por contrato + override frecuencia por línea |
| 5 | Ampliación de contrato: línea nueva o contrato nuevo? | Ambos modos soportados → date_debut por línea |
| 6 | Una máquina en >1 contrato simultáneo? | Nunca → constraint estricto en BD |
| 7 | Suspensión temporal de máquina? | Sí ocurre → statut por línea |
| 8 | Incidencias: 2 columnas o FK única? | FK única `contract_machine_id` |

Decisiones técnicas asumidas:

- Nombre tabla: `contract_machines`.
- Migración del 1 contrato existente: preservado tal cual como 1 línea.
- `date_renouvellement`: sigue siendo del contrato global.
- `machine_counters.contract_id`: sin cambios.
- RPCs `create_client_with_contract` / `create_machine_with_contract`: evaluación de uso en el PR-cleanup; refactor o eliminación según corresponda.
- Enfoque de despliegue: **PR principal con 4 commits + PR-cleanup posterior (5-7 días después)** como red de seguridad adicional. Decisión confirmada por el usuario al revisar el spec.
- Constraint de exclusividad de máquina: por `date_fin IS NULL` (sin importar `statut`). Una máquina suspendida sigue bloqueando reasignación a otro contrato.

---

## 11. Archivos relacionados

- Memoria persistente: `project_contracts_refactor.md` (este refactor), `project_axa_carga.md` (Axa pendiente), `project_pending_tasks.md` (plan general).
- Plan ejecutable: `web-amd/docs/superpowers/plans/2026-06-03-contracts-n-machines-plan.md` (a generar después de aprobar este spec).
- Sesión: 24 (2026-06-03).
