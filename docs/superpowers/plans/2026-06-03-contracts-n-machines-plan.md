# Refactor Contratos N Máquinas — Plan de Implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Refactorizar `contracts` para soportar N máquinas por contrato (1 contrato físico → N máquinas vivas en él con historia), corrigiendo el mismatch actual entre el modelo de datos (1:1) y la realidad del negocio AMD Service.

**Architecture:** Nueva tabla intermedia `contract_machines` con `date_debut`/`date_fin`, statut por línea, billing_day y maintenance_frequency override por línea, FK única `incidents.contract_machine_id`. Exclusividad enforced por índice parcial único. Constraint XOR en `incidents` (contract_machine_id XOR machine_id, nunca ambos, nunca ninguno). Las funciones SECURITY DEFINER se regeneran. Despliegue en **2 PRs**: PR principal (4 commits) + PR-cleanup ≈ 5-7 días después.

**Tech Stack:** Next.js 16.2.6 (App Router) · TypeScript · React 19 · Supabase (PostgreSQL 17 + RLS) · Tailwind v4 · server actions con `useActionState`.

**Spec asociado:** `web-amd/docs/superpowers/specs/2026-06-03-contracts-n-machines-design.md`. **Léelo antes de empezar.**

---

## Estructura de archivos del PR principal

### Archivos a crear

| Path | Responsabilidad |
|---|---|
| `web-amd/supabase/migrations/2026XXXXXXXXXX_contracts_n_machines.sql` | Migración forward: enum, tabla, constraints, RLS, funciones nuevas, migración de datos, validaciones inline |
| `web-amd/supabase/migrations/2026XXXXXXXXXX_contracts_n_machines_rollback.sql` | Migración inversa (no aplicada automáticamente; emergencia) |
| `web-amd/src/lib/contract-machines.ts` | Helpers TypeScript reutilizables: línea activa, máquinas de un contrato, resolución de billing_day/frequency efectivos |

### Archivos a modificar (paths exactos)

| Path | Tipo de cambio |
|---|---|
| `web-amd/src/lib/enums.ts` | Añadir enum `CONTRACT_MACHINE_STATUSES`; tipo `MaintenanceFrequency` |
| `web-amd/src/app/admin/contracts/new/actions.ts` | Server action: insertar contrato + N líneas en una transacción |
| `web-amd/src/app/admin/contracts/new/page.tsx` | Cargar máquinas no asignadas + render del nuevo form |
| `web-amd/src/app/admin/contracts/[id]/actions.ts` | UPDATE contrato + add/retire/modify líneas |
| `web-amd/src/app/admin/contracts/[id]/page.tsx` | Cargar contrato + líneas + render detalle con panel máquinas |
| `web-amd/src/app/admin/contracts/page.tsx` | Listado: columna "N machines" en lugar de columna "machine" |
| `web-amd/src/components/admin/ContractForm.tsx` | Reescribir: selector múltiple de máquinas con overrides por línea |
| `web-amd/src/app/admin/incidents/new/actions.ts` | Aceptar `contract_machine_id`, eliminar uso de `machine_id`/`contract_id` directos |
| `web-amd/src/app/admin/incidents/new/page.tsx` | Cargar líneas activas como opciones del selector |
| `web-amd/src/components/admin/IncidentForm.tsx` | Selector cascada: contrato → máquina de ese contrato |
| `web-amd/src/app/admin/contadores/[serie]/actions.ts` | Resolver contrato vigente via contract_machines |
| `web-amd/src/app/admin/contadores/cliente/[clientId]/page.tsx` | Contratos activos del cliente + sus máquinas |
| `web-amd/src/app/admin/machines/[serie]/qr/page.tsx` | Contrato vigente via contract_machines |
| `web-amd/src/app/admin/maintenance/new/page.tsx` | Listar contratos sin plan (sin cambios en cardinalidad) |
| `web-amd/src/app/portal/page.tsx` | Dashboard cliente: contratos + sus máquinas activas |
| `web-amd/src/app/portal/incidents/new/page.tsx` | Cargar líneas del cliente (no contratos+machines por separado) |
| `web-amd/src/app/portal/incidents/new/actions.ts` | Crear incidencia con `contract_machine_id` |
| `web-amd/src/app/portal/incidents/[id]/page.tsx` | Mostrar máquina via `contract_machines` join |
| `web-amd/src/app/tech/scan/[serie]/page.tsx` | Contrato vigente via contract_machines |
| `web-amd/src/app/signaler/[serie]/actions.ts` | Mantiene `machine_id` directo, deja `contract_machine_id` a NULL |
| `web-amd/docs/architecture.md` | Documentar el nuevo modelo |

### Archivos del PR-cleanup (separado, +5-7 días)

| Path | Acción |
|---|---|
| `web-amd/supabase/migrations/2026XXXXXXXXXX_contracts_cleanup.sql` | DROP columns viejas + DROP functions obsoletas |
| `web-amd/supabase/migrations/2026XXXXXXXXXX_contracts_cleanup_rollback.sql` | Restaurar columnas y datos |

---

## Pre-requisitos antes de empezar

- [ ] **Step 0.1: Verificar estado del repo limpio**

Run:
```bash
cd "/Users/juanmiguel/Claude/Web AMD Codex/web-amd" && git status && git log --oneline -3
```

Expected: `On branch main`, working tree clean. Último commit `639dc23` (merge PR #22).

- [ ] **Step 0.2: Crear rama de trabajo**

Run:
```bash
cd "/Users/juanmiguel/Claude/Web AMD Codex/web-amd" && git checkout -b refactor/contracts-n-machines
```

Expected: `Switched to a new branch 'refactor/contracts-n-machines'`.

- [ ] **Step 0.3: Leer el spec completo**

Read: `web-amd/docs/superpowers/specs/2026-06-03-contracts-n-machines-design.md` (11 secciones). No saltar, hay decisiones de diseño en cada una.

---

## Bloque 1 — Migración SQL del modelo nuevo

**Commit goal:** dejar la BD en producción con la tabla `contract_machines`, datos migrados, funciones SECURITY DEFINER nuevas y políticas RLS. Las columnas viejas se conservan intactas para coexistencia.

### Task 1.1: Generar el archivo de migración con `supabase migration new`

**Files:**
- Create: `web-amd/supabase/migrations/<timestamp>_contracts_n_machines.sql`

- [ ] **Step 1.1.1: Generar archivo vacío**

Run:
```bash
cd "/Users/juanmiguel/Claude/Web AMD Codex/web-amd" && supabase migration new contracts_n_machines
```

Expected: `Created new migration at supabase/migrations/<timestamp>_contracts_n_machines.sql`. Anota el `<timestamp>` exacto que devuelve.

- [ ] **Step 1.1.2: Anotar el path del archivo generado**

Run:
```bash
ls -1t "/Users/juanmiguel/Claude/Web AMD Codex/web-amd/supabase/migrations/" | head -1
```

Expected: nombre con el timestamp recién generado. Guárdalo como `MIGRATION_FILE` en una variable para los siguientes steps.

### Task 1.2: Escribir el SQL completo de la migración forward

**Files:**
- Modify: `web-amd/supabase/migrations/<MIGRATION_FILE>` (recién creado, vacío)

- [ ] **Step 1.2.1: Escribir el contenido completo de la migración**

Reemplaza el contenido del archivo con:

```sql
-- Refactor contracts: 1 contrato = N máquinas
-- Spec: docs/superpowers/specs/2026-06-03-contracts-n-machines-design.md
-- NO toca las columnas viejas: contracts.machine_id, contracts.lieu_installation, incidents.contract_id.
-- Se borrarán en un PR-cleanup posterior (5-7 días después del merge).

BEGIN;

-- 1. Enum para el estado de la línea contract↔machine
CREATE TYPE contract_machine_status AS ENUM ('actif', 'suspendu', 'terminé');

-- 2. Tabla nueva
CREATE TABLE public.contract_machines (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  contract_id uuid NOT NULL REFERENCES public.contracts(id) ON DELETE CASCADE,
  machine_id text NOT NULL REFERENCES public.machines(numero_serie) ON DELETE RESTRICT,
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

-- Una máquina solo puede tener UNA línea sin date_fin (independiente del statut).
-- Una máquina suspendida sigue bloqueando la reasignación a otro contrato.
CREATE UNIQUE INDEX contract_machines_one_open_per_machine
  ON public.contract_machines (machine_id)
  WHERE date_fin IS NULL;

CREATE INDEX contract_machines_contract_id_idx ON public.contract_machines (contract_id);
CREATE INDEX contract_machines_machine_id_idx ON public.contract_machines (machine_id);

ALTER TABLE public.contract_machines ENABLE ROW LEVEL SECURITY;

-- 3. Añadir contracts.maintenance_frequency (default a nivel contrato)
ALTER TABLE public.contracts
  ADD COLUMN maintenance_frequency text NULL CHECK (maintenance_frequency IN ('mensuel', 'trimestriel'));

-- 4. Migrar datos del contrato existente
INSERT INTO public.contract_machines (contract_id, machine_id, date_debut, statut)
SELECT id, machine_id, date_debut, statut
FROM public.contracts
WHERE machine_id IS NOT NULL;

-- 5. Añadir contract_machine_id a incidents
ALTER TABLE public.incidents
  ADD COLUMN contract_machine_id uuid NULL REFERENCES public.contract_machines(id);

-- 6. Migrar incidencias internas (source IS DISTINCT FROM 'public')
UPDATE public.incidents AS i
SET contract_machine_id = cm.id
FROM public.contract_machines cm
WHERE i.contract_id = cm.contract_id
  AND i.machine_id = cm.machine_id
  AND i.source IS DISTINCT FROM 'public';

-- 7. Para las incidencias internas migradas, machine_id pasa a NULL
-- (la máquina se infiere ahora desde contract_machine_id → contract_machines.machine_id).
UPDATE public.incidents
SET machine_id = NULL
WHERE contract_machine_id IS NOT NULL;

-- 8. Validación dentro de la transacción
DO $$
DECLARE
  internal_incidents_without_link int;
  contracts_with_machine_id int;
  cm_rows int;
BEGIN
  SELECT COUNT(*) INTO internal_incidents_without_link
  FROM public.incidents
  WHERE source IS DISTINCT FROM 'public'
    AND contract_machine_id IS NULL;

  IF internal_incidents_without_link > 0 THEN
    RAISE EXCEPTION 'Migración abortada: % incidencias internas no encontraron su contract_machine', internal_incidents_without_link;
  END IF;

  SELECT COUNT(*) INTO contracts_with_machine_id FROM public.contracts WHERE machine_id IS NOT NULL;
  SELECT COUNT(*) INTO cm_rows FROM public.contract_machines;

  IF contracts_with_machine_id <> cm_rows THEN
    RAISE EXCEPTION 'Migración abortada: conteo no cuadra (% contracts viejos vs % líneas en contract_machines)', contracts_with_machine_id, cm_rows;
  END IF;
END $$;

-- 9. CHECK XOR en incidents: o contract_machine_id o machine_id, nunca ambos, nunca ninguno
ALTER TABLE public.incidents ADD CONSTRAINT incidents_contract_or_machine_xor
  CHECK ((contract_machine_id IS NULL) <> (machine_id IS NULL));

-- 10. Funciones SECURITY DEFINER nuevas
CREATE OR REPLACE FUNCTION public.auth_client_contract_machine_ids() RETURNS SETOF uuid
LANGUAGE sql SECURITY DEFINER STABLE
SET search_path = public, pg_catalog
AS $$
  SELECT cm.id FROM public.contract_machines cm
  WHERE cm.contract_id IN (SELECT public.auth_client_contract_ids());
$$;

CREATE OR REPLACE FUNCTION public.auth_tech_contract_machine_ids() RETURNS SETOF uuid
LANGUAGE sql SECURITY DEFINER STABLE
SET search_path = public, pg_catalog
AS $$
  SELECT DISTINCT i.contract_machine_id FROM public.incidents i
  WHERE i.assigned_to = auth.uid()
    AND i.contract_machine_id IS NOT NULL;
$$;

-- Sobrescribir auth_client_machine_ids() para derivar de contract_machines (activas)
CREATE OR REPLACE FUNCTION public.auth_client_machine_ids() RETURNS SETOF text
LANGUAGE sql SECURITY DEFINER STABLE
SET search_path = public, pg_catalog
AS $$
  SELECT DISTINCT cm.machine_id FROM public.contract_machines cm
  WHERE cm.contract_id IN (SELECT public.auth_client_contract_ids())
    AND cm.statut = 'actif'
    AND cm.date_fin IS NULL;
$$;

-- Helper para máquinas asignadas al técnico
CREATE OR REPLACE FUNCTION public.auth_tech_assigned_machine_ids() RETURNS SETOF text
LANGUAGE sql SECURITY DEFINER STABLE
SET search_path = public, pg_catalog
AS $$
  SELECT DISTINCT cm.machine_id FROM public.contract_machines cm
  WHERE cm.id IN (SELECT public.auth_tech_contract_machine_ids());
$$;

REVOKE EXECUTE ON FUNCTION public.auth_client_contract_machine_ids() FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.auth_client_contract_machine_ids() TO service_role, authenticated;

REVOKE EXECUTE ON FUNCTION public.auth_tech_contract_machine_ids() FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.auth_tech_contract_machine_ids() TO service_role, authenticated;

REVOKE EXECUTE ON FUNCTION public.auth_tech_assigned_machine_ids() FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.auth_tech_assigned_machine_ids() TO service_role, authenticated;

-- 11. RLS policies de contract_machines
CREATE POLICY admin_all_contract_machines ON public.contract_machines
  FOR ALL USING ((SELECT role FROM public.profiles WHERE id = auth.uid()) = 'admin');

CREATE POLICY client_own_contract_machines_select ON public.contract_machines
  FOR SELECT USING (id IN (SELECT public.auth_client_contract_machine_ids()));

CREATE POLICY tech_assigned_contract_machines_select ON public.contract_machines
  FOR SELECT USING (id IN (SELECT public.auth_tech_contract_machine_ids()));

-- 12. Actualizar políticas RLS de incidents
-- Las viejas usan contract_id; las nuevas usan contract_machine_id.

DROP POLICY IF EXISTS client_own_incidents_select ON public.incidents;
CREATE POLICY client_own_incidents_select ON public.incidents
  FOR SELECT USING (contract_machine_id IN (SELECT public.auth_client_contract_machine_ids()));

DROP POLICY IF EXISTS client_create_incidents ON public.incidents;
CREATE POLICY client_create_incidents ON public.incidents
  FOR INSERT WITH CHECK (contract_machine_id IN (SELECT public.auth_client_contract_machine_ids()));

-- Las políticas tech_assigned_incidents_* siguen filtrando por assigned_to = auth.uid(),
-- por lo que no requieren cambios.

COMMIT;
```

- [ ] **Step 1.2.2: Verificar syntax básica del SQL**

Run:
```bash
cd "/Users/juanmiguel/Claude/Web AMD Codex/web-amd" && cat supabase/migrations/<MIGRATION_FILE> | head -30
```

Expected: las primeras 30 líneas se muestran sin errores de codificación. La línea `BEGIN;` aparece tras los comentarios iniciales.

### Task 1.3: Crear archivo de rollback (no se aplica automáticamente)

**Files:**
- Create: `web-amd/supabase/migrations/<timestamp>_contracts_n_machines_rollback.sql`

- [ ] **Step 1.3.1: Crear archivo de rollback**

Run:
```bash
cd "/Users/juanmiguel/Claude/Web AMD Codex/web-amd" && touch "supabase/migrations/$(date +%Y%m%d%H%M%S)_contracts_n_machines_rollback.sql"
```

Anota el path como `ROLLBACK_FILE`.

- [ ] **Step 1.3.2: Escribir el SQL del rollback**

Reemplaza el contenido del `ROLLBACK_FILE` con:

```sql
-- ROLLBACK del refactor contracts N machines.
-- NO se ejecuta automáticamente. Aplicar manualmente vía MCP execute_sql o supabase db push
-- SOLO en caso de emergencia tras descubrir un bug post-merge.
-- Limitación conocida: si un contrato tiene varias líneas (rotaciones), solo se preserva la activa actual.

BEGIN;

-- Si las columnas viejas ya se borraron (post-PR-cleanup), recrearlas
ALTER TABLE public.contracts ADD COLUMN IF NOT EXISTS machine_id text NULL REFERENCES public.machines(numero_serie);
ALTER TABLE public.contracts ADD COLUMN IF NOT EXISTS lieu_installation text NULL;
ALTER TABLE public.incidents ADD COLUMN IF NOT EXISTS contract_id uuid NULL REFERENCES public.contracts(id);

-- Restaurar contracts.machine_id desde la línea ACTIVA de cada contrato
UPDATE public.contracts c SET machine_id = cm.machine_id
FROM public.contract_machines cm
WHERE cm.contract_id = c.id
  AND cm.statut = 'actif'
  AND cm.date_fin IS NULL;

-- Restaurar incidents.contract_id y machine_id desde la línea
UPDATE public.incidents i
SET contract_id = cm.contract_id, machine_id = cm.machine_id
FROM public.contract_machines cm
WHERE i.contract_machine_id = cm.id;

ALTER TABLE public.incidents DROP CONSTRAINT IF EXISTS incidents_contract_or_machine_xor;
ALTER TABLE public.incidents DROP COLUMN IF EXISTS contract_machine_id;

ALTER TABLE public.contracts DROP COLUMN IF EXISTS maintenance_frequency;

DROP POLICY IF EXISTS admin_all_contract_machines ON public.contract_machines;
DROP POLICY IF EXISTS client_own_contract_machines_select ON public.contract_machines;
DROP POLICY IF EXISTS tech_assigned_contract_machines_select ON public.contract_machines;

DROP FUNCTION IF EXISTS public.auth_client_contract_machine_ids() CASCADE;
DROP FUNCTION IF EXISTS public.auth_tech_contract_machine_ids() CASCADE;
DROP FUNCTION IF EXISTS public.auth_tech_assigned_machine_ids() CASCADE;

-- Restaurar auth_client_machine_ids() a su forma vieja (derivada de contracts.machine_id)
CREATE OR REPLACE FUNCTION public.auth_client_machine_ids() RETURNS SETOF text
LANGUAGE sql SECURITY DEFINER STABLE
SET search_path = public, pg_catalog
AS $$
  SELECT c.machine_id FROM public.contracts c
  WHERE c.client_id IN (SELECT cp.client_id FROM public.client_profiles cp WHERE cp.profile_id = auth.uid())
    AND c.machine_id IS NOT NULL;
$$;

-- Restaurar políticas RLS de incidents que usaban contract_id
DROP POLICY IF EXISTS client_own_incidents_select ON public.incidents;
CREATE POLICY client_own_incidents_select ON public.incidents
  FOR SELECT USING (contract_id IN (SELECT public.auth_client_contract_ids()));

DROP POLICY IF EXISTS client_create_incidents ON public.incidents;
CREATE POLICY client_create_incidents ON public.incidents
  FOR INSERT WITH CHECK (contract_id IN (SELECT public.auth_client_contract_ids()));

DROP TABLE IF EXISTS public.contract_machines CASCADE;
DROP TYPE IF EXISTS public.contract_machine_status;

COMMIT;
```

### Task 1.4: Aplicar la migración forward a la BD remota vía MCP

**Files:** ninguno (operación en BD)

- [ ] **Step 1.4.1: Verificar estado de BD antes**

Vía MCP `mcp__supabase__execute_sql` con `project_id=myyejbviunyvywfukysj`:

```sql
SELECT 'contracts total' AS check_name, COUNT(*)::text FROM public.contracts
UNION ALL
SELECT 'incidents internas', COUNT(*)::text FROM public.incidents WHERE source IS DISTINCT FROM 'public'
UNION ALL
SELECT 'incidents públicas', COUNT(*)::text FROM public.incidents WHERE source = 'public'
UNION ALL
SELECT 'contract_machines exists', CASE WHEN EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='contract_machines') THEN 'YES' ELSE 'NO' END;
```

Expected: `contracts=1`, `incidents internas=2`, `incidents públicas=0`, `contract_machines exists=NO`. Si no cuadra, parar y revisar.

- [ ] **Step 1.4.2: Aplicar migración con `mcp__supabase__apply_migration`**

Vía MCP `mcp__supabase__apply_migration` con `project_id=myyejbviunyvywfukysj`, `name=contracts_n_machines`, `query=<contenido completo del SQL del Step 1.2.1>`.

Expected: respuesta de éxito, sin error.

- [ ] **Step 1.4.3: Verificar resultado de la migración**

Vía MCP `mcp__supabase__execute_sql`:

```sql
SELECT 'contract_machines rows' AS check_name, COUNT(*)::text FROM public.contract_machines
UNION ALL
SELECT 'incidents con contract_machine_id', COUNT(*)::text FROM public.incidents WHERE contract_machine_id IS NOT NULL
UNION ALL
SELECT 'incidents con machine_id', COUNT(*)::text FROM public.incidents WHERE machine_id IS NOT NULL
UNION ALL
SELECT 'XOR violation', COUNT(*)::text FROM public.incidents WHERE (contract_machine_id IS NULL) = (machine_id IS NULL);
```

Expected: `contract_machines rows=1`, `incidents con contract_machine_id=2`, `incidents con machine_id=0` (las 2 internas), `XOR violation=0`.

- [ ] **Step 1.4.4: Verificar funciones SECURITY DEFINER nuevas**

Vía MCP:

```sql
SELECT routine_name FROM information_schema.routines
WHERE routine_schema='public'
  AND routine_name LIKE 'auth_%'
ORDER BY routine_name;
```

Expected: aparecen las nuevas `auth_client_contract_machine_ids`, `auth_tech_contract_machine_ids`, `auth_tech_assigned_machine_ids` y la regenerada `auth_client_machine_ids`. Las viejas (`auth_tech_incident_*`) siguen existiendo (compat hasta el PR-cleanup).

### Task 1.5: Commit del Bloque 1

- [ ] **Step 1.5.1: Stage solo los 2 archivos SQL**

Run:
```bash
cd "/Users/juanmiguel/Claude/Web AMD Codex/web-amd" && git add supabase/migrations/<MIGRATION_FILE> supabase/migrations/<ROLLBACK_FILE>
```

- [ ] **Step 1.5.2: Verificar staged**

Run:
```bash
cd "/Users/juanmiguel/Claude/Web AMD Codex/web-amd" && git status
```

Expected: solo 2 archivos SQL nuevos en staged. Working tree limpio en el resto.

- [ ] **Step 1.5.3: Commit**

Run:
```bash
cd "/Users/juanmiguel/Claude/Web AMD Codex/web-amd" && git commit -m "$(cat <<'EOF'
feat(contracts): SQL migration for N-machines model

- New contract_machines table with date_debut/date_fin, statut, billing/maintenance overrides
- Unique index: one open (date_fin IS NULL) row per machine across all contracts
- XOR check in incidents (contract_machine_id XOR machine_id)
- Regenerated SECURITY DEFINER functions
- Updated RLS policies on contract_machines and incidents
- Old columns and old functions kept for backward compat (cleanup PR follows)
- Rollback SQL adjacent for emergency

Spec: docs/superpowers/specs/2026-06-03-contracts-n-machines-design.md

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

Expected: 1 commit creado, 2 archivos.

---

## Bloque 2 — Helpers TypeScript y tipos

**Commit goal:** módulo reutilizable `src/lib/contract-machines.ts` + enums actualizados. Cero cambios funcionales en la app.

### Task 2.1: Actualizar `src/lib/enums.ts`

**Files:**
- Modify: `web-amd/src/lib/enums.ts`

- [ ] **Step 2.1.1: Leer el archivo actual**

Read: `web-amd/src/lib/enums.ts`. Localiza dónde se exportan los `CONTRACT_STATUSES` y otros enums similares para seguir el mismo patrón.

- [ ] **Step 2.1.2: Añadir los enums nuevos**

Añadir al final del archivo (o donde el patrón sugiera):

```typescript
export const CONTRACT_MACHINE_STATUSES = ['actif', 'suspendu', 'terminé'] as const
export type ContractMachineStatus = (typeof CONTRACT_MACHINE_STATUSES)[number]

export const MAINTENANCE_FREQUENCIES = ['mensuel', 'trimestriel'] as const
export type MaintenanceFrequency = (typeof MAINTENANCE_FREQUENCIES)[number]
```

- [ ] **Step 2.1.3: Verificar compilación**

Run:
```bash
cd "/Users/juanmiguel/Claude/Web AMD Codex/web-amd" && npx tsc --noEmit
```

Expected: cero errores.

### Task 2.2: Crear módulo `src/lib/contract-machines.ts`

**Files:**
- Create: `web-amd/src/lib/contract-machines.ts`

- [ ] **Step 2.2.1: Crear el archivo con los helpers**

Contenido completo:

```typescript
import type { SupabaseClient } from '@supabase/supabase-js'
import type { ContractMachineStatus, MaintenanceFrequency } from '@/lib/enums'

export type ContractMachine = {
  id: string
  contract_id: string
  machine_id: string
  date_debut: string
  date_fin: string | null
  statut: ContractMachineStatus
  billing_day_override: number | null
  maintenance_frequency_override: MaintenanceFrequency | null
  notes: string | null
  created_at: string
}

export type ContractMachineWithMachine = ContractMachine & {
  machines: {
    numero_serie: string
    marque: string
    modele: string
    type: string | null
    localisation: string | null
    active: boolean
  } | null
}

/**
 * Línea de contract_machine ABIERTA (date_fin IS NULL) para una máquina dada.
 * Devuelve null si la máquina no tiene línea abierta.
 */
export async function getOpenLineForMachine(
  supabase: SupabaseClient,
  machineId: string
): Promise<ContractMachine | null> {
  const { data, error } = await supabase
    .from('contract_machines')
    .select('*')
    .eq('machine_id', machineId)
    .is('date_fin', null)
    .maybeSingle()
  if (error) {
    console.error('[getOpenLineForMachine]', error)
    return null
  }
  return data as ContractMachine | null
}

/**
 * Todas las líneas activas (statut='actif' AND date_fin IS NULL) de un contrato.
 * Incluye los datos de la máquina por join.
 */
export async function getActiveLinesForContract(
  supabase: SupabaseClient,
  contractId: string
): Promise<ContractMachineWithMachine[]> {
  const { data, error } = await supabase
    .from('contract_machines')
    .select('*, machines!inner(numero_serie, marque, modele, type, localisation, active)')
    .eq('contract_id', contractId)
    .eq('statut', 'actif')
    .is('date_fin', null)
    .order('date_debut', { ascending: true })
  if (error) {
    console.error('[getActiveLinesForContract]', error)
    return []
  }
  return (data ?? []) as ContractMachineWithMachine[]
}

/**
 * billing_day efectivo: override de la línea o default del contrato.
 */
export function resolveBillingDay(
  line: Pick<ContractMachine, 'billing_day_override'>,
  contract: { billing_day: number | null }
): number | null {
  return line.billing_day_override ?? contract.billing_day
}

/**
 * frecuencia de mantenimiento efectiva: override de la línea o default del contrato.
 */
export function resolveMaintenanceFrequency(
  line: Pick<ContractMachine, 'maintenance_frequency_override'>,
  contract: { maintenance_frequency: MaintenanceFrequency | null }
): MaintenanceFrequency | null {
  return line.maintenance_frequency_override ?? contract.maintenance_frequency
}
```

- [ ] **Step 2.2.2: Verificar compilación**

Run:
```bash
cd "/Users/juanmiguel/Claude/Web AMD Codex/web-amd" && npx tsc --noEmit
```

Expected: cero errores.

### Task 2.3: Commit del Bloque 2

- [ ] **Step 2.3.1: Stage y commit**

Run:
```bash
cd "/Users/juanmiguel/Claude/Web AMD Codex/web-amd" && git add src/lib/enums.ts src/lib/contract-machines.ts && git commit -m "$(cat <<'EOF'
feat(contracts): add contract-machines helpers and enums

- CONTRACT_MACHINE_STATUSES + MAINTENANCE_FREQUENCIES enums
- src/lib/contract-machines.ts with helpers:
  - getOpenLineForMachine (active line of a machine)
  - getActiveLinesForContract (active lines of a contract)
  - resolveBillingDay / resolveMaintenanceFrequency (override → contract default)

No functional changes yet; preparing for the server actions refactor.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

Expected: 1 commit nuevo, 2 archivos.

---

## Bloque 3 — Server actions y queries

**Commit goal:** los ~14 archivos que leen/escriben contracts ahora usan `contract_machines`. La app sigue funcionando porque las columnas viejas existen, pero el código nuevo ya no las lee.

**Convención común para todos los actions de este bloque:**
- Cuando insertas un contrato nuevo, hazlo en 2 pasos en una RPC transactional. Como no tenemos RPC custom para esto en este PR, hazlo secuencial: `insert contract` → leer `id` → `insert contract_machines` con array. Si el 2º insert falla, eliminar el contract recién creado para mantener coherencia.

### Task 3.1: Reescribir `src/app/admin/contracts/new/actions.ts`

**Files:**
- Modify: `web-amd/src/app/admin/contracts/new/actions.ts`

- [ ] **Step 3.1.1: Reescribir el archivo completo**

Contenido completo nuevo:

```typescript
'use server'

import { requireAdmin } from '@/lib/auth'
import { CONTRACT_STATUSES, MAINTENANCE_FREQUENCIES, parseEnum } from '@/lib/enums'
import { redirect } from 'next/navigation'

type FormState = { error: string } | null

type LineInput = {
  machine_id: string
  date_debut: string
  billing_day_override: number | null
  maintenance_frequency_override: 'mensuel' | 'trimestriel' | null
  notes: string | null
}

export async function createContractAction(
  _prev: FormState,
  formData: FormData
): Promise<FormState> {
  const { supabase } = await requireAdmin()

  const numero_contrat = ((formData.get('numero_contrat') as string) ?? '').trim()
  const client_id = Number(formData.get('client_id'))
  const date_debut = ((formData.get('date_debut') as string) ?? '').trim()
  const date_renouvellement = ((formData.get('date_renouvellement') as string) ?? '').trim() || null
  const statut = parseEnum(formData.get('statut'), CONTRACT_STATUSES)
  const billing_day_raw = ((formData.get('billing_day') as string) ?? '').trim()
  const billing_day = billing_day_raw ? Number(billing_day_raw) : null
  const maintenance_frequency = parseEnum(formData.get('maintenance_frequency'), MAINTENANCE_FREQUENCIES) ?? null

  if (!numero_contrat) return { error: 'Le numéro de contrat est obligatoire.' }
  if (!client_id) return { error: 'Veuillez sélectionner un client.' }
  if (!date_debut) return { error: 'La date de début est obligatoire.' }
  if (!statut) return { error: 'Statut invalide.' }
  if (billing_day !== null && (billing_day < 1 || billing_day > 31)) {
    return { error: 'Le jour de facturation doit être entre 1 et 31.' }
  }

  // Parsear líneas serializadas en formData (formato JSON en el campo "lines")
  const linesRaw = (formData.get('lines') as string) ?? '[]'
  let lines: LineInput[]
  try {
    lines = JSON.parse(linesRaw)
  } catch {
    return { error: 'Liste de machines invalide.' }
  }
  if (!Array.isArray(lines) || lines.length === 0) {
    return { error: 'Veuillez ajouter au moins une machine au contrat.' }
  }

  for (const ln of lines) {
    if (!ln.machine_id || !ln.date_debut) {
      return { error: 'Chaque machine doit avoir un numéro de série et une date de début.' }
    }
    if (ln.billing_day_override !== null && (ln.billing_day_override < 1 || ln.billing_day_override > 31)) {
      return { error: `Jour de facturation invalide pour la machine ${ln.machine_id}.` }
    }
  }

  // 1. Insert contract
  const { data: contractRow, error: contractError } = await supabase
    .from('contracts')
    .insert({
      numero_contrat,
      client_id,
      date_debut,
      date_renouvellement,
      statut,
      billing_day,
      maintenance_frequency,
    })
    .select('id')
    .single()

  if (contractError || !contractRow) {
    if (contractError?.code === '23505') return { error: 'Ce numéro de contrat existe déjà.' }
    console.error('[createContract]', contractError)
    return { error: 'Une erreur est survenue lors de la création du contrat.' }
  }

  // 2. Insert lines
  const linesPayload = lines.map((ln) => ({
    contract_id: contractRow.id,
    machine_id: ln.machine_id,
    date_debut: ln.date_debut,
    statut: 'actif' as const,
    billing_day_override: ln.billing_day_override,
    maintenance_frequency_override: ln.maintenance_frequency_override,
    notes: ln.notes,
  }))

  const { error: linesError } = await supabase.from('contract_machines').insert(linesPayload)

  if (linesError) {
    // Rollback manual del contract recién creado
    await supabase.from('contracts').delete().eq('id', contractRow.id)
    if (linesError.code === '23505') {
      return { error: 'Une ou plusieurs machines sont déjà assignées à un autre contrat actif.' }
    }
    console.error('[createContract.lines]', linesError)
    return { error: 'Une erreur est survenue lors de l\'ajout des machines.' }
  }

  redirect('/admin/contracts')
}
```

- [ ] **Step 3.1.2: Verificar compilación**

Run:
```bash
cd "/Users/juanmiguel/Claude/Web AMD Codex/web-amd" && npx tsc --noEmit
```

Expected: cero errores. (Si hay errores por tipo del payload de Supabase, considera anotar `as any` solo en el insert de `contract_machines` hasta regenerar tipos en Task 3.7).

### Task 3.2: Reescribir `src/app/admin/contracts/[id]/actions.ts`

**Files:**
- Modify: `web-amd/src/app/admin/contracts/[id]/actions.ts`

- [ ] **Step 3.2.1: Leer el archivo actual**

Read: `web-amd/src/app/admin/contracts/[id]/actions.ts`. Identifica las acciones existentes (probablemente UPDATE y DELETE).

- [ ] **Step 3.2.2: Reescribir según patrón nuevo**

Mantén las acciones existentes (`updateContractAction`, `deleteContractAction`) pero:

- `updateContractAction`: actualiza solo campos del contrato (numero, dates, statut, billing_day, maintenance_frequency). Gestiona los campos `lines` (igual que en `createContractAction`): identifica líneas a ADD (nuevas), MODIFY (existentes con cambios), RETIRE (puestas date_fin=hoy + statut=terminé). El form enviará un JSON con el estado deseado de las líneas, y aquí calculamos el diff.

Patrón concreto:

```typescript
// Después de update del contract: gestionar líneas
const linesRaw = (formData.get('lines') as string) ?? '[]'
const desiredLines: Array<{ id?: string; machine_id: string; date_debut: string; date_fin?: string | null; statut?: string; billing_day_override?: number | null; maintenance_frequency_override?: string | null; notes?: string | null }> = JSON.parse(linesRaw)

const { data: existingLines } = await supabase
  .from('contract_machines')
  .select('id, machine_id')
  .eq('contract_id', contractId)

const existingIds = new Set((existingLines ?? []).map((l) => l.id))
const desiredIds = new Set(desiredLines.filter((l) => l.id).map((l) => l.id))

// Inserts (sin id en el cliente)
const toInsert = desiredLines.filter((l) => !l.id)
if (toInsert.length > 0) {
  await supabase.from('contract_machines').insert(toInsert.map((l) => ({
    contract_id: contractId,
    machine_id: l.machine_id,
    date_debut: l.date_debut,
    statut: 'actif',
    billing_day_override: l.billing_day_override ?? null,
    maintenance_frequency_override: l.maintenance_frequency_override ?? null,
    notes: l.notes ?? null,
  })))
}

// Updates (id en el cliente, ya existían)
for (const l of desiredLines) {
  if (!l.id) continue
  await supabase.from('contract_machines').update({
    date_debut: l.date_debut,
    date_fin: l.date_fin ?? null,
    statut: l.statut ?? 'actif',
    billing_day_override: l.billing_day_override ?? null,
    maintenance_frequency_override: l.maintenance_frequency_override ?? null,
    notes: l.notes ?? null,
  }).eq('id', l.id)
}

// "Retire" (líneas que existían pero no están en desired): se interpretan como "retirar"
// → poner date_fin=hoy y statut='terminé'. NUNCA borrar líneas, conservar historia.
const toRetire = (existingLines ?? []).filter((l) => !desiredIds.has(l.id))
if (toRetire.length > 0) {
  const today = new Date().toISOString().slice(0, 10)
  await supabase.from('contract_machines').update({
    date_fin: today,
    statut: 'terminé',
  }).in('id', toRetire.map((l) => l.id))
}
```

Conserva `deleteContractAction` tal cual (CASCADE limpia las líneas automáticamente).

- [ ] **Step 3.2.3: Verificar compilación**

Run:
```bash
cd "/Users/juanmiguel/Claude/Web AMD Codex/web-amd" && npx tsc --noEmit
```

Expected: cero errores.

### Task 3.3: Reescribir `src/app/admin/incidents/new/actions.ts`

**Files:**
- Modify: `web-amd/src/app/admin/incidents/new/actions.ts`

- [ ] **Step 3.3.1: Leer el archivo actual**

Read el archivo. Identifica cómo se obtiene actualmente `contract_id` y `machine_id` del formData.

- [ ] **Step 3.3.2: Reescribir para usar `contract_machine_id`**

El form ahora envía un único `contract_machine_id` (UUID de la línea). El action:

```typescript
const contract_machine_id = ((formData.get('contract_machine_id') as string) ?? '').trim()

if (!contract_machine_id) return { error: 'Veuillez sélectionner une machine du contrat.' }

// Validar que la línea existe y obtener cliente para autorización
const { data: line } = await supabase
  .from('contract_machines')
  .select('id, contract_id, machine_id, contracts!inner(client_id)')
  .eq('id', contract_machine_id)
  .maybeSingle()

if (!line) return { error: 'Ligne de contrat introuvable.' }

// Insert con la nueva columna
const { error } = await supabase.from('incidents').insert({
  contract_machine_id,
  machine_id: null,                  // forzar NULL por XOR
  title,
  description,
  category,
  priority,
  status: 'nouveau',
  opened_by: user.id,
})
```

- [ ] **Step 3.3.3: Verificar compilación**

Run:
```bash
cd "/Users/juanmiguel/Claude/Web AMD Codex/web-amd" && npx tsc --noEmit
```

Expected: cero errores.

### Task 3.4: Reescribir `src/app/portal/incidents/new/actions.ts`

**Files:**
- Modify: `web-amd/src/app/portal/incidents/new/actions.ts`

- [ ] **Step 3.4.1: Mismo patrón que Task 3.3 pero validando contra `auth_client_contract_machine_ids`**

El portal cliente solo puede crear incidencias sobre líneas que pertenecen a sus contratos. RLS ya filtra esto, pero validar en código también:

```typescript
const contract_machine_id = ((formData.get('contract_machine_id') as string) ?? '').trim()

if (!contract_machine_id) return { error: 'Veuillez sélectionner une machine.' }

// La RLS bloquea SELECT sobre líneas no propias → si no encuentra, error claro
const { data: line } = await supabase
  .from('contract_machines')
  .select('id')
  .eq('id', contract_machine_id)
  .maybeSingle()

if (!line) return { error: 'Cette machine n\'est pas accessible.' }

const { error } = await supabase.from('incidents').insert({
  contract_machine_id,
  machine_id: null,
  source: null,                     // incidencia interna
  title, description, category, priority, status: 'nouveau',
  opened_by: user.id,
})
```

- [ ] **Step 3.4.2: Verificar compilación**

Run:
```bash
cd "/Users/juanmiguel/Claude/Web AMD Codex/web-amd" && npx tsc --noEmit
```

Expected: cero errores.

### Task 3.5: Actualizar resto de queries (contadores, qr, maintenance, portal, tech)

Cada subarchivo: cambiar la búsqueda de "contrato vigente para una máquina" de usar `contracts.machine_id = X AND statut = 'actif'` a usar `contract_machines.machine_id = X AND date_fin IS NULL AND statut = 'actif'`.

**Files:**
- Modify: `web-amd/src/app/admin/contadores/[serie]/actions.ts`
- Modify: `web-amd/src/app/admin/contadores/cliente/[clientId]/page.tsx`
- Modify: `web-amd/src/app/admin/machines/[serie]/qr/page.tsx`
- Modify: `web-amd/src/app/admin/maintenance/new/page.tsx`
- Modify: `web-amd/src/app/portal/page.tsx`
- Modify: `web-amd/src/app/portal/incidents/new/page.tsx`
- Modify: `web-amd/src/app/portal/incidents/[id]/page.tsx`
- Modify: `web-amd/src/app/tech/scan/[serie]/page.tsx`

- [ ] **Step 3.5.1: Patrón para "contrato vigente de una máquina"**

Importar `getOpenLineForMachine` desde `@/lib/contract-machines` y usar:

```typescript
import { getOpenLineForMachine } from '@/lib/contract-machines'

const openLine = await getOpenLineForMachine(supabase, serie)
if (!openLine) {
  // mostrar "aucun contrat actif" o redirigir según el flujo
}

// El contract_id viene en openLine.contract_id
const { data: contract } = await supabase
  .from('contracts')
  .select('id, numero_contrat, client_id, billing_day, maintenance_frequency, clients(nom_client)')
  .eq('id', openLine.contract_id)
  .single()
```

- [ ] **Step 3.5.2: Aplicar el patrón a cada archivo del listado**

Para cada archivo, hacer el reemplazo equivalente. Donde el código actual hace `contracts.machine_id`, cambiar a la búsqueda via `contract_machines`. Si el código usa `contract.lieu_installation`, cambiar a `machine.localisation`.

- [ ] **Step 3.5.3: Verificar compilación**

Run:
```bash
cd "/Users/juanmiguel/Claude/Web AMD Codex/web-amd" && npx tsc --noEmit
```

Expected: cero errores.

### Task 3.6: `src/app/signaler/[serie]/actions.ts` (incidencias públicas)

**Files:**
- Modify: `web-amd/src/app/signaler/[serie]/actions.ts`

- [ ] **Step 3.6.1: Asegurar que mantiene `machine_id` directo y `contract_machine_id` NULL**

El form público no requiere autenticación y no conoce contratos. El insert debe quedar:

```typescript
const { error } = await supabase.from('incidents').insert({
  machine_id: serie,                  // FK directa a machines, conservada para públicas
  contract_machine_id: null,          // por XOR
  source: 'public',
  title, description,
  contact_name, contact_phone, contact_email,
  status: 'nouveau',
})
```

- [ ] **Step 3.6.2: Verificar compilación**

Run:
```bash
cd "/Users/juanmiguel/Claude/Web AMD Codex/web-amd" && npx tsc --noEmit
```

Expected: cero errores.

### Task 3.7: Regenerar tipos TypeScript de Supabase

**Files:**
- Modify (auto): `web-amd/src/lib/supabase/types.ts` (o donde el proyecto guarde los tipos generados)

- [ ] **Step 3.7.1: Localizar el archivo de tipos generado**

Run:
```bash
cd "/Users/juanmiguel/Claude/Web AMD Codex/web-amd" && find src/lib/supabase -type f | head -10
```

Expected: ver archivos como `types.ts`, `server.ts`, `client.ts`.

- [ ] **Step 3.7.2: Regenerar tipos**

Run:
```bash
cd "/Users/juanmiguel/Claude/Web AMD Codex/web-amd" && supabase gen types typescript --project-id myyejbviunyvywfukysj > src/lib/supabase/types.ts
```

(Ajustar path si difiere — Read el archivo localizado en 3.7.1 y editarlo.)

**Fallback si la CLI de Supabase no está autenticada:** saltar este step y aceptar que algunos inserts/selects de `contract_machines` requerirán un `as any` puntual hasta que se regeneren los tipos en una sesión posterior. NO bloquear el plan por esto.

- [ ] **Step 3.7.3: Verificar compilación tras regenerar**

Run:
```bash
cd "/Users/juanmiguel/Claude/Web AMD Codex/web-amd" && npx tsc --noEmit
```

Expected: cero errores. Si aparecen errores nuevos por cambios de tipos, corregirlos en este step.

### Task 3.8: Smoke test manual del bloque

- [ ] **Step 3.8.1: Levantar dev server**

Run:
```bash
cd "/Users/juanmiguel/Claude/Web AMD Codex/web-amd" && npm run dev
```

(Si ya estaba corriendo, reiniciar.)

- [ ] **Step 3.8.2: Verificar que las páginas críticas cargan sin error 500**

En el navegador, autenticado como admin:
1. `/admin/contracts` → ver el listado actual (probablemente vacío salvo el 1 contrato existente).
2. `/admin/contracts/<id-del-contrato-existente>` → la página detalle carga (no rompe).
3. `/admin/incidents` → kanban carga.
4. `/admin/contadores/<numero_serie-de-cualquier-maquina>` → carga.
5. `/tech/scan/<numero_serie>` → carga (sin scan real, solo verificar render).

Anotar cualquier error 500 y fijarlo antes de avanzar.

- [ ] **Step 3.8.3: Parar dev server**

Ctrl+C en la terminal del dev.

### Task 3.9: Commit del Bloque 3

- [ ] **Step 3.9.1: Stage solo los archivos del Bloque 3**

Run:
```bash
cd "/Users/juanmiguel/Claude/Web AMD Codex/web-amd" && git add src/app/admin/contracts src/app/admin/incidents src/app/admin/contadores src/app/admin/machines src/app/admin/maintenance src/app/portal src/app/tech src/app/signaler src/lib/supabase
```

- [ ] **Step 3.9.2: Verificar staged**

Run:
```bash
cd "/Users/juanmiguel/Claude/Web AMD Codex/web-amd" && git status
```

Expected: solo archivos del Bloque 3 en staged. ContractForm/IncidentForm/page.tsx de admin/contracts no, esos van al Bloque 4 (UI).

- [ ] **Step 3.9.3: Commit**

Run:
```bash
cd "/Users/juanmiguel/Claude/Web AMD Codex/web-amd" && git commit -m "$(cat <<'EOF'
refactor(contracts): server actions and queries use contract_machines

- createContractAction: insert contract + N contract_machines (manual rollback on failure)
- updateContractAction: diff lines (insert/update/retire)
- Internal incidents use contract_machine_id (machine_id NULL)
- Public incidents (/signaler) keep machine_id direct (contract_machine_id NULL)
- Queries for "active contract of machine" use getOpenLineForMachine helper
- lieu_installation reads now from machines.localisation only
- TS types regenerated from Supabase

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

Expected: 1 commit nuevo.

---

## Bloque 4 — UI

**Commit goal:** los formularios y listados reflejan el modelo nuevo. El admin puede crear/editar contratos con N máquinas. El form de incidencias usa cascada contrato → máquina.

### Task 4.1: Reescribir `src/components/admin/ContractForm.tsx`

**Files:**
- Modify: `web-amd/src/components/admin/ContractForm.tsx`

- [ ] **Step 4.1.1: Reescribir el archivo**

El form rediseñado tiene:
1. Sección "Contrato" (campos del contrato).
2. Sección "Machines du contrat" con state local de array `lines`. Cada línea tiene: machine selector (de las máquinas no asignadas + las ya pertenecientes al contrato en edit), date_debut, statut, billing_day_override (opcional), maintenance_frequency_override (opcional), notes (opcional). Botones "Ajouter une machine" y "Retirer" por línea.
3. Al enviar el form, las líneas se serializan a JSON en un input hidden `name="lines"` (formato exacto que el action espera).

Estructura del componente:

```tsx
'use client'

import { useActionState, useState } from 'react'
import Link from 'next/link'
import { Loader2, ArrowLeft, Trash2, Plus } from 'lucide-react'
import { Card } from '@/components/ui/Card'
import type { MaintenanceFrequency } from '@/lib/enums'

type FormState = { error: string } | null

type LineInput = {
  id?: string                       // present si es una línea ya existente (edit)
  machine_id: string
  date_debut: string
  date_fin?: string | null
  statut?: 'actif' | 'suspendu' | 'terminé'
  billing_day_override: number | null
  maintenance_frequency_override: MaintenanceFrequency | null
  notes: string | null
}

type ContractData = {
  numero_contrat?: string
  client_id?: number
  date_debut?: string
  date_renouvellement?: string | null
  statut?: 'actif' | 'suspendu' | 'terminé'
  billing_day?: number | null
  maintenance_frequency?: MaintenanceFrequency | null
}

type ClientOption = { id: number; nom_client: string }
type MachineOption = { numero_serie: string; marque: string; modele: string }

type Props = {
  action: (prev: FormState, data: FormData) => Promise<FormState>
  defaultValues?: ContractData
  initialLines?: LineInput[]                // líneas existentes en modo edit
  clients: ClientOption[]
  availableMachines: MachineOption[]         // máquinas SIN línea abierta + las ya del contrato
  title: string
  isEdit?: boolean
  contractId?: string
  deleteAction?: (formData: FormData) => Promise<void>
}

// inputClass y selectClass: copiar del ContractForm actual

export default function ContractForm({
  action, defaultValues, initialLines = [], clients, availableMachines, title, isEdit, contractId, deleteAction,
}: Props) {
  const [state, formAction, pending] = useActionState(action, null)
  const [lines, setLines] = useState<LineInput[]>(initialLines)

  const addLine = () => setLines([...lines, {
    machine_id: '', date_debut: defaultValues?.date_debut ?? '',
    statut: 'actif', billing_day_override: null, maintenance_frequency_override: null, notes: null,
  }])

  const updateLine = (idx: number, patch: Partial<LineInput>) => {
    setLines(lines.map((l, i) => i === idx ? { ...l, ...patch } : l))
  }

  const removeLine = (idx: number) => setLines(lines.filter((_, i) => i !== idx))

  return (
    <div className="p-8 max-w-4xl">
      {/* Header igual que el actual con título + delete */}

      <form action={formAction}>
        {/* Hidden con las líneas serializadas */}
        <input type="hidden" name="lines" value={JSON.stringify(lines)} />

        <Card className="p-6 space-y-5">
          {state?.error && (
            <div className="px-4 py-3 rounded-lg bg-accent-soft border border-accent/20 text-sm text-accent">
              {state.error}
            </div>
          )}

          {/* Sección Contrato */}
          {/* numero_contrat, client_id, date_debut, date_renouvellement, statut, billing_day, maintenance_frequency */}
          {/* Patrones de input/select iguales a los del ContractForm actual */}

        </Card>

        {/* Sección Machines */}
        <Card className="p-6 mt-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold text-ink font-display">Machines du contrat</h2>
            <button
              type="button"
              onClick={addLine}
              className="flex items-center gap-1.5 px-3 py-2 rounded-lg border border-line text-sm text-ink hover:bg-neutral-soft"
            >
              <Plus size={14} /> Ajouter une machine
            </button>
          </div>

          {lines.length === 0 && (
            <p className="text-sm text-ink-muted">Aucune machine ajoutée. Cliquez "Ajouter une machine".</p>
          )}

          <div className="space-y-3">
            {lines.map((line, idx) => (
              <div key={idx} className="border border-line rounded-lg p-4 space-y-3">
                <div className="flex items-start gap-3">
                  <select
                    value={line.machine_id}
                    onChange={(e) => updateLine(idx, { machine_id: e.target.value })}
                    className="flex-1 px-3 py-2 rounded-lg border border-line text-sm bg-card"
                    required
                  >
                    <option value="" disabled>Sélectionner machine...</option>
                    {availableMachines.map((m) => (
                      <option key={m.numero_serie} value={m.numero_serie}>
                        {m.marque} {m.modele} — {m.numero_serie}
                      </option>
                    ))}
                  </select>
                  <input
                    type="date"
                    value={line.date_debut}
                    onChange={(e) => updateLine(idx, { date_debut: e.target.value })}
                    className="px-3 py-2 rounded-lg border border-line text-sm bg-card"
                    required
                  />
                  <button
                    type="button"
                    onClick={() => removeLine(idx)}
                    className="px-3 py-2 rounded-lg border border-accent/20 text-accent hover:bg-accent-soft"
                    title="Retirer du contrat"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>

                <div className="grid grid-cols-3 gap-3">
                  <div>
                    <label className="block text-xs text-ink-muted mb-1">Jour facturation (override)</label>
                    <input
                      type="number" min={1} max={31}
                      value={line.billing_day_override ?? ''}
                      onChange={(e) => updateLine(idx, { billing_day_override: e.target.value ? Number(e.target.value) : null })}
                      placeholder="hérite du contrat"
                      className="w-full px-2 py-1.5 rounded-lg border border-line text-sm bg-card"
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-ink-muted mb-1">Fréquence maintenance (override)</label>
                    <select
                      value={line.maintenance_frequency_override ?? ''}
                      onChange={(e) => updateLine(idx, { maintenance_frequency_override: (e.target.value as MaintenanceFrequency) || null })}
                      className="w-full px-2 py-1.5 rounded-lg border border-line text-sm bg-card"
                    >
                      <option value="">hérite du contrat</option>
                      <option value="mensuel">Mensuelle</option>
                      <option value="trimestriel">Trimestrielle</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs text-ink-muted mb-1">Notes</label>
                    <input
                      type="text"
                      value={line.notes ?? ''}
                      onChange={(e) => updateLine(idx, { notes: e.target.value || null })}
                      className="w-full px-2 py-1.5 rounded-lg border border-line text-sm bg-card"
                    />
                  </div>
                </div>
              </div>
            ))}
          </div>
        </Card>

        {/* Botones (igual que el actual) */}
      </form>
    </div>
  )
}
```

(El detalle exacto del JSX puede salir del template del ContractForm actual; mantén la convención visual.)

- [ ] **Step 4.1.2: Verificar compilación**

Run:
```bash
cd "/Users/juanmiguel/Claude/Web AMD Codex/web-amd" && npx tsc --noEmit
```

Expected: cero errores.

### Task 4.2: Actualizar páginas `/admin/contracts/new` y `/admin/contracts/[id]`

**Files:**
- Modify: `web-amd/src/app/admin/contracts/new/page.tsx`
- Modify: `web-amd/src/app/admin/contracts/[id]/page.tsx`

- [ ] **Step 4.2.1: `new/page.tsx`**

Cargar:
- Lista de clientes
- Lista de máquinas **sin línea abierta** (`NOT EXISTS (SELECT 1 FROM contract_machines WHERE machine_id = machines.numero_serie AND date_fin IS NULL)`)

Pasarlas como `clients` y `availableMachines` a `<ContractForm>`. Sin `initialLines`.

- [ ] **Step 4.2.2: `[id]/page.tsx`**

Cargar:
- Contrato
- Líneas del contrato (`SELECT * FROM contract_machines WHERE contract_id = ?`)
- Máquinas disponibles = (máquinas sin línea abierta) UNION (máquinas con línea abierta en este contrato).

Construir `initialLines` desde las líneas leídas (`id` presente para que el action las identifique como "existentes").

- [ ] **Step 4.2.3: Verificar compilación**

Run:
```bash
cd "/Users/juanmiguel/Claude/Web AMD Codex/web-amd" && npx tsc --noEmit
```

Expected: cero errores.

### Task 4.3: Actualizar listado `/admin/contracts/page.tsx`

**Files:**
- Modify: `web-amd/src/app/admin/contracts/page.tsx`

- [ ] **Step 4.3.1: Cargar conteo de máquinas activas por contrato**

Reemplazar la columna "Machine" por una columna "Machines" que muestre `N` (conteo de líneas activas) con tooltip de las 3 primeras.

Query:
```typescript
const { data: contracts } = await supabase
  .from('contracts')
  .select(`
    *, clients(nom_client),
    contract_machines!inner(id, machine_id, statut, date_fin, machines(marque, modele))
  `)
  .order('numero_contrat', { ascending: false })

// Para cada contrato: filtrar contract_machines a las activas y contar
```

- [ ] **Step 4.3.2: Verificar compilación + build**

Run:
```bash
cd "/Users/juanmiguel/Claude/Web AMD Codex/web-amd" && npx tsc --noEmit && npm run build
```

Expected: ambos sin errores.

### Task 4.4: Reescribir `src/components/admin/IncidentForm.tsx`

**Files:**
- Modify: `web-amd/src/components/admin/IncidentForm.tsx`

- [ ] **Step 4.4.1: Cascada contrato → línea**

El form pasa de tener selector independiente "machine" a tener:
1. Selector "contrato" (opciones: contratos activos, opcionalmente filtrados por cliente seleccionado primero).
2. Selector "machine du contrat" (filtrado en cliente por la línea activa del contrato seleccionado).
3. El input hidden enviado es `contract_machine_id` (UUID).

Props nuevas:
```typescript
type ContractWithLines = {
  id: string
  numero_contrat: string
  client_id: number
  lines: Array<{ id: string; machine: { numero_serie: string; marque: string; modele: string } }>
}

type Props = {
  contracts: ContractWithLines[]
  // ...
}
```

**Serialización al servidor:** un único input `<input type="hidden" name="contract_machine_id" value={selectedLineId} />` controlado por el state local. El selector de contrato es solo UX (no se envía al servidor; el `contract_machine_id` ya determina el contrato). El cliente se infiere también desde la línea elegida (al hacer JOIN en el server).

- [ ] **Step 4.4.2: Verificar compilación**

Run:
```bash
cd "/Users/juanmiguel/Claude/Web AMD Codex/web-amd" && npx tsc --noEmit
```

Expected: cero errores.

### Task 4.5: Actualizar páginas de `admin/incidents/new` y `portal/incidents/new`

**Files:**
- Modify: `web-amd/src/app/admin/incidents/new/page.tsx`
- Modify: `web-amd/src/app/portal/incidents/new/page.tsx`

- [ ] **Step 4.5.1: Cargar contratos con sus líneas activas y pasar al form**

Para admin: todos los contratos `actif` con sus líneas activas.
Para portal: solo los del cliente actual (RLS filtra automáticamente).

- [ ] **Step 4.5.2: Verificar compilación + build**

Run:
```bash
cd "/Users/juanmiguel/Claude/Web AMD Codex/web-amd" && npx tsc --noEmit && npm run build
```

Expected: cero errores.

### Task 4.6: Smoke test manual de UI

- [ ] **Step 4.6.1: Levantar dev**

Run: `cd "/Users/juanmiguel/Claude/Web AMD Codex/web-amd" && npm run dev`

- [ ] **Step 4.6.2: Probar creación contrato con 2 máquinas**

En el navegador autenticado como admin:
1. Ir a `/admin/contracts/new`.
2. Rellenar contrato (`TEST-REFACTOR-001`, cliente cualquiera, fecha hoy, statut actif, billing_day=1).
3. Añadir 2 máquinas con "Ajouter une machine". Selector debe mostrar solo máquinas sin línea abierta.
4. Submit.
5. Volver a `/admin/contracts` → ver `TEST-REFACTOR-001` con "2 machines".
6. Entrar al detalle → ver las 2 líneas en el panel "Machines du contrat".

- [ ] **Step 4.6.3: Probar abrir incidencia para una línea**

1. Ir a `/admin/incidents/new`.
2. Seleccionar el contrato `TEST-REFACTOR-001`.
3. Selector de máquina muestra las 2 líneas.
4. Seleccionar 1 y completar.
5. Submit.
6. Ir a `/admin/incidents` → ver la incidencia con la máquina correcta.

- [ ] **Step 4.6.4: Limpiar TEST-REFACTOR-001 vía MCP**

```sql
DELETE FROM public.incidents WHERE contract_machine_id IN (
  SELECT id FROM public.contract_machines WHERE contract_id = (
    SELECT id FROM public.contracts WHERE numero_contrat = 'TEST-REFACTOR-001'
  )
);
DELETE FROM public.contracts WHERE numero_contrat = 'TEST-REFACTOR-001';
```

Expected: 1 incidencia borrada + 1 contrato borrado (CASCADE limpia las 2 líneas).

- [ ] **Step 4.6.5: Parar dev**

Ctrl+C.

### Task 4.7: Actualizar `docs/architecture.md`

**Files:**
- Modify: `web-amd/docs/architecture.md`

- [ ] **Step 4.7.1: Añadir sección sobre el modelo de contratos**

Documentar la nueva tabla `contract_machines`, las reglas XOR de incidents y los helpers de `src/lib/contract-machines.ts`. Eliminar referencias a `contracts.machine_id` y `contracts.lieu_installation`.

### Task 4.8: Commit del Bloque 4

- [ ] **Step 4.8.1: Stage**

Run:
```bash
cd "/Users/juanmiguel/Claude/Web AMD Codex/web-amd" && git add src/components/admin/ContractForm.tsx src/components/admin/IncidentForm.tsx src/app/admin/contracts src/app/admin/incidents docs/architecture.md
```

- [ ] **Step 4.8.2: Commit**

Run:
```bash
cd "/Users/juanmiguel/Claude/Web AMD Codex/web-amd" && git commit -m "$(cat <<'EOF'
feat(contracts): UI for N machines per contract

- ContractForm: machine selector becomes a list with date_debut, statut, billing/maintenance overrides per line
- /admin/contracts listing: "N machines" column with active-line count
- /admin/contracts/[id] detail: "Machines du contrat" panel with add/retire/edit
- IncidentForm: cascade contract → machine of that contract
- Architecture doc updated

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

Expected: 1 commit nuevo.

---

## Bloque 5 — PR, code review, merge

### Task 5.1: Push de la rama y abrir PR

- [ ] **Step 5.1.1: Push**

Run:
```bash
cd "/Users/juanmiguel/Claude/Web AMD Codex/web-amd" && git push -u origin refactor/contracts-n-machines
```

Expected: rama subida.

- [ ] **Step 5.1.2: Abrir PR**

Run:
```bash
cd "/Users/juanmiguel/Claude/Web AMD Codex/web-amd" && gh pr create --title "refactor: contracts now support N machines per contract" --body "$(cat <<'EOF'
## Summary

Refactoriza el modelo de contratos para soportar N máquinas por contrato (en lugar de 1:1), con historia (rotación entre contratos) y overrides por línea (billing_day, maintenance_frequency).

## Architecture

Nueva tabla `contract_machines` con date_debut/date_fin, statut por línea, índice parcial único que garantiza una sola línea abierta por máquina. Incidencias internas via FK `contract_machine_id`; públicas (/signaler) mantienen `machine_id` directo. CHECK XOR en incidents.

## What's in this PR

- **Bloque 1 — SQL:** migración forward + rollback adjunto, validaciones inline, RLS, funciones SECURITY DEFINER nuevas. Columnas viejas conservadas (cleanup en PR posterior).
- **Bloque 2 — Helpers:** `src/lib/contract-machines.ts` + enums.
- **Bloque 3 — Server actions:** ~14 archivos refactorizados.
- **Bloque 4 — UI:** ContractForm + IncidentForm + listados + detalles.

## What's NOT in this PR (intencional)

- DROP COLUMN de las columnas viejas → **PR-cleanup posterior (5-7 días)**.
- Mantenimiento granular con scan QR por máquina → feature futuro.
- Importador masivo de contratos → futuro.

## Spec & memory

- Spec: `docs/superpowers/specs/2026-06-03-contracts-n-machines-design.md`
- Plan: `docs/superpowers/plans/2026-06-03-contracts-n-machines-plan.md`

## Test plan

- [ ] `npx tsc --noEmit` limpio
- [ ] `npm run build` OK
- [ ] Smoke test local: crear contrato TEST-REFACTOR-001 con 2 máquinas, abrir incidencia, borrar
- [ ] Vercel preview verde
- [ ] `/code-review` aplicado, hallazgos ≥80 corregidos
- [ ] Smoke test producción tras merge (sección 7.1 del spec)

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

Expected: PR creado, devuelve URL.

### Task 5.2: Code review automático

- [ ] **Step 5.2.1: Esperar Vercel verde**

Run:
```bash
cd "/Users/juanmiguel/Claude/Web AMD Codex/web-amd" && gh pr view --json mergeable,statusCheckRollup
```

Expected: Vercel SUCCESS.

- [ ] **Step 5.2.2: Lanzar /code-review**

Comando: `/code-review <PR-number>` con effort high.

Esperado: hallazgos clasificados por scorers Haiku. Aplicar todos los hallazgos ≥80 antes del merge. Commitear las correcciones con prefijo `fix(contracts): <descripción>`.

### Task 5.3: Merge a main

- [ ] **Step 5.3.1: Merge**

Run (sustituir `<N>` por número del PR):
```bash
cd "/Users/juanmiguel/Claude/Web AMD Codex/web-amd" && gh pr merge <N> --merge --delete-branch
```

- [ ] **Step 5.3.2: Sincronizar main local**

Run:
```bash
cd "/Users/juanmiguel/Claude/Web AMD Codex/web-amd" && git checkout main && git pull --ff-only
```

- [ ] **Step 5.3.3: Verificar deploy Vercel**

Run:
```bash
cd "/Users/juanmiguel/Claude/Web AMD Codex/web-amd" && gh api "repos/juanmy116/amd-service/commits/main/status" --jq '{state, statuses: [.statuses[] | {context, state}]}'
```

Expected: `state=success`.

### Task 5.4: Smoke test producción

- [ ] **Step 5.4.1: Reproducir test plan en producción**

En `https://amd-service.vercel.app`:
1. Crear contrato `TEST-REFACTOR-PROD-001` con 2 máquinas distintas a las de Axa.
2. Abrir 1 incidencia desde admin.
3. Verificar vía MCP:

```sql
SELECT id, numero_contrat,
       (SELECT COUNT(*) FROM public.contract_machines WHERE contract_id = c.id) AS n_machines,
       (SELECT COUNT(*) FROM public.incidents i JOIN public.contract_machines cm ON i.contract_machine_id = cm.id WHERE cm.contract_id = c.id) AS n_incidents
FROM public.contracts c
WHERE numero_contrat = 'TEST-REFACTOR-PROD-001';
```

Expected: 1 fila con `n_machines=2`, `n_incidents=1`.

4. Cambiar `date_fin` de la 1ª línea (retirar):

```sql
UPDATE public.contract_machines
SET date_fin = CURRENT_DATE, statut = 'terminé'
WHERE id = (
  SELECT id FROM public.contract_machines
  WHERE contract_id = (SELECT id FROM public.contracts WHERE numero_contrat = 'TEST-REFACTOR-PROD-001')
  LIMIT 1
);
```

5. Comprobar que ahora se puede asignar esa máquina a otro contrato (constraint exclusividad).
6. Limpiar:

```sql
DELETE FROM public.incidents WHERE contract_machine_id IN (
  SELECT id FROM public.contract_machines WHERE contract_id = (
    SELECT id FROM public.contracts WHERE numero_contrat = 'TEST-REFACTOR-PROD-001'
  )
);
DELETE FROM public.contracts WHERE numero_contrat = 'TEST-REFACTOR-PROD-001';
```

Expected: tabla `machines` intacta.

- [ ] **Step 5.4.2: Verificar advisors Supabase**

Vía MCP `mcp__supabase__get_advisors` con `type=security` y luego con `type=performance`. Anotar hallazgos. Los `function_search_path_mutable` y similares relativos a las funciones nuevas deben estar limpios (todas las funciones nuevas tienen `SET search_path`).

---

## PR-Cleanup posterior (≈ 5-7 días después del merge del PR principal)

**Importante:** crear este PR SOLO una vez verificado en producción durante 5-7 días que el refactor no introduce regresiones.

### Task 6.1: Verificar uso real de RPCs antiguos

- [ ] **Step 6.1.1: Buscar referencias en código**

Run:
```bash
cd "/Users/juanmiguel/Claude/Web AMD Codex/web-amd" && rg "create_client_with_contract|create_machine_with_contract" src/
```

Expected: si 0 hits → los RPCs no se usan, se pueden eliminar. Si hay hits → refactorizar para aceptar arrays (o eliminar las llamadas en el código que ya no las necesite).

### Task 6.2: Crear migración cleanup

**Files:**
- Create: `web-amd/supabase/migrations/<timestamp>_contracts_cleanup.sql`

- [ ] **Step 6.2.1: Generar archivo**

Run:
```bash
cd "/Users/juanmiguel/Claude/Web AMD Codex/web-amd" && git checkout -b refactor/contracts-cleanup && supabase migration new contracts_cleanup
```

- [ ] **Step 6.2.2: Escribir el SQL**

Contenido:

```sql
-- Cleanup del refactor contracts N machines.
-- Aplicar SOLO tras verificar 5-7 días en producción.

BEGIN;

-- DROP columnas viejas
ALTER TABLE public.contracts DROP COLUMN IF EXISTS machine_id;
ALTER TABLE public.contracts DROP COLUMN IF EXISTS lieu_installation;
ALTER TABLE public.incidents DROP COLUMN IF EXISTS contract_id;

-- DROP funciones SECURITY DEFINER obsoletas
DROP FUNCTION IF EXISTS public.auth_tech_incident_contract_ids() CASCADE;
DROP FUNCTION IF EXISTS public.auth_tech_incident_machine_ids() CASCADE;

-- DROP RPCs viejos si verificación de uso lo permite
DROP FUNCTION IF EXISTS public.create_client_with_contract(text, text, text, text, text, text, text, text, text, date, date, text);
DROP FUNCTION IF EXISTS public.create_machine_with_contract(text, text, text, text, text, bigint, text, date, date, text);
-- (Las firmas exactas se confirman en Task 6.1 antes de aplicar)

COMMIT;
```

- [ ] **Step 6.2.3: Crear rollback adjunto**

Mismo patrón que el rollback del Bloque 1: recrear columnas y datos.

- [ ] **Step 6.2.4: Aplicar vía MCP**

Vía `mcp__supabase__apply_migration` con `name=contracts_cleanup`.

### Task 6.3: PR, review y merge

- [ ] **Step 6.3.1: Commit, push, PR, merge**

```bash
cd "/Users/juanmiguel/Claude/Web AMD Codex/web-amd" && git add supabase/migrations && git commit -m "chore(contracts): cleanup old columns and obsolete functions" && git push -u origin refactor/contracts-cleanup && gh pr create --title "chore: cleanup contracts refactor (drop old columns)" --body "..."
```

`/code-review` opcional (PR muy pequeño). Merge.

---

## Notas para el ejecutor

1. **Si una migración SQL falla en producción**, NO entrar en pánico. La transacción aborta y nada cambia. Investigar el error, corregir el SQL, re-aplicar.
2. **Cada commit deja la app en estado consistente:** después de Bloque 1, las columnas viejas siguen y la app vieja funciona. Después de Bloque 4, las columnas viejas siguen pero la app las ignora.
3. **Si encuentras código que asume 1 máquina por contrato y no está en la lista de archivos a modificar:** anotarlo y arreglarlo. El listado es exhaustivo según el agente Explore pero puede haber matices.
4. **No olvidar:** la sesión que ejecute este plan debe recordar que existen 14 máquinas Axa pendientes de vinculación (`project_axa_carga.md`). Se hace después del merge del PR principal con el comando que el spec sugiere para crear contrato `064-007` con sus 14 líneas.
