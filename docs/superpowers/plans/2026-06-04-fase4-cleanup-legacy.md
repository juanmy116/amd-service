# Fase 4 — Cleanup Legacy — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Eliminar las columnas y funciones legacy del refactor de contratos (`contracts.machine_id`, `contracts.lieu_installation`, `incidents.contract_id`, 5 funciones), migrando los últimos usos al modelo `contract_machines`.

**Architecture:** Primero se actualiza TODO el código para no usar las columnas legacy y se despliega. Solo tras verificar producción se aplica la migración DROP. El DROP va detrás del deploy — orden inviolable (sin staging).

**Tech Stack:** Next.js 16, Supabase JS, PostgreSQL, Supabase MCP.

---

## Orden inviolable

Tasks 1-9 = código. Task 10 = build + PR + **merge + deploy + verificar**. Tasks 11-12 = **DROP solo después del deploy verificado** + regenerar types.

---

## Mapa de archivos

| Archivo | Cambio |
|---|---|
| `src/lib/csat.ts` | Quitar `incidents.contract_id` |
| `src/app/admin/incidents/[id]/page.tsx` | Quitar rama fallback `contract_id` |
| `src/app/admin/incidents/page.tsx` | Quitar `contract_id` de SELECT + filtro |
| `src/app/tech/incidents/[id]/page.tsx` | Quitar rama fallback `contract_id` + `lieu_installation` |
| `src/app/tech/planning/page.tsx` | `lieu_installation` → `machines.localisation` |
| `src/app/tech/scan/[serie]/maintenance/[visitId]/page.tsx` | `lieu_installation` → `machines.localisation` |
| `src/app/atelier/page.tsx` | Join legacy → `contract_machines` |
| `src/components/admin/AgendaPanel.tsx` | Join legacy → `contract_machines` |
| `src/components/tech/AgendaPanel.tsx` | Join legacy → `contract_machines` |
| `src/lib/supabase/types.ts` | Regenerar tras DROP |
| `supabase/migrations/<ts>_cleanup_legacy_contracts.sql` | DROP (aplicar al final) |

---

### Task 1: Rama Git

- [ ] **Step 1**
```bash
cd "/Users/juanmiguel/Claude/Web AMD Codex/web-amd"
git checkout main && git pull
git checkout -b refactor/fase4-cleanup-legacy
```
Expected: `git branch --show-current` → `refactor/fase4-cleanup-legacy`

---

### Task 2: csat.ts — quitar incidents.contract_id

**Files:** Modify `src/lib/csat.ts`

- [ ] **Step 1: Reemplazar el SELECT (línea 17)**

De:
```ts
    .select('id, title, contract_id, contract_machine_id, contracts(client_id)')
```
A:
```ts
    .select('id, title, contract_machine_id')
```

- [ ] **Step 2: Quitar la rama de fallback legacy (líneas 36-38)**

Eliminar el bloque:
```ts
  if (!clientId && incident.contract_id) {
    clientId = (incident.contracts as unknown as { client_id: number } | null)?.client_id ?? null
  }

```
(El comentario de las líneas 23-24 puede simplificarse a "Resolver client_id por contract_machine_id.")

- [ ] **Step 3: Verificar TS**
```bash
cd "/Users/juanmiguel/Claude/Web AMD Codex/web-amd" && npx tsc --noEmit 2>&1 | grep "csat" | head -5
```
Expected: sin errores.

- [ ] **Step 4: Commit**
```bash
git add src/lib/csat.ts
git commit -m "refactor(csat): resolver cliente solo por contract_machine_id"
```

---

### Task 3: admin/incidents/[id]/page.tsx — quitar rama legacy

**Files:** Modify `src/app/admin/incidents/[id]/page.tsx`

- [ ] **Step 1: Reemplazar las ramas de resolución (líneas 63-80)**

De:
```ts
  } else if (incident.machine_id && !incident.contract_id) {
    // Incidencia pública QR: solo tenemos machine_id
    contextInfo = { clientName: null, machineName: incident.machine_id, contractNumber: null }
  } else if (incident.contract_id) {
    // Legacy pre-refactor
    const { data: contract } = await supabase
      .from('contracts')
      .select('numero_contrat, clients(nom_client), machines(marque, modele)')
      .eq('id', incident.contract_id)
      .maybeSingle()
    const clientData  = contract?.clients  as unknown as { nom_client: string } | null
    const machineData = contract?.machines as unknown as { marque: string; modele: string } | null
    contextInfo = {
      clientName:     clientData?.nom_client ?? null,
      machineName:    machineData ? `${machineData.marque} ${machineData.modele}` : incident.machine_id,
      contractNumber: contract?.numero_contrat ?? null,
    }
  }
```
A:
```ts
  } else if (incident.machine_id) {
    // Incidencia pública QR: solo tenemos machine_id
    contextInfo = { clientName: null, machineName: incident.machine_id, contractNumber: null }
  }
```

- [ ] **Step 2: Actualizar el comentario (líneas 39-42)**

Reemplazar el bloque de comentario por:
```ts
  // Resolución de contexto en orden de prioridad:
  // 1. contract_machine_id (incidencias internas)
  // 2. machine_id directo (incidencias públicas QR)
```

- [ ] **Step 3: Verificar TS**
```bash
cd "/Users/juanmiguel/Claude/Web AMD Codex/web-amd" && npx tsc --noEmit 2>&1 | grep "incidents/\[id\]/page" | head -5
```
Expected: sin errores en admin/incidents/[id].

- [ ] **Step 4: Commit**
```bash
git add "src/app/admin/incidents/[id]/page.tsx"
git commit -m "refactor(incidents): quitar fallback legacy contract_id en detalle admin"
```

---

### Task 4: admin/incidents/page.tsx — quitar contract_id de SELECT y filtro

**Files:** Modify `src/app/admin/incidents/page.tsx`

- [ ] **Step 1: Reemplazar el SELECT (líneas 47-57)**

De:
```ts
  let query = supabase
    .from('incidents')
    .select(`
      id, numero_incident, title, category, priority, status, machine_id, created_at,
      contract_id, contract_machine_id, assigned_to,
      contracts(client_id, clients(nom_client)),
      contract_machines(machine_id, machines(numero_serie), contracts(client_id, clients(nom_client))),
      profiles!assigned_to(full_name)
    `)
    .order('created_at', { ascending: false })
    .limit(RESULT_LIMIT)
```
A:
```ts
  let query = supabase
    .from('incidents')
    .select(`
      id, numero_incident, title, category, priority, status, machine_id, created_at,
      contract_machine_id, assigned_to,
      contract_machines(machine_id, machines(numero_serie), contracts(client_id, clients(nom_client))),
      profiles!assigned_to(full_name)
    `)
    .order('created_at', { ascending: false })
    .limit(RESULT_LIMIT)
```

- [ ] **Step 2: Reemplazar el filtro por cliente (líneas 62-72)**

De:
```ts
  if (clientId) {
    const orParts: string[] = []
    if (contractIds.length > 0) orParts.push(`contract_id.in.(${contractIds.join(',')})`)
    if (cmIds.length > 0) orParts.push(`contract_machine_id.in.(${cmIds.join(',')})`)
    if (orParts.length > 0) {
      query = query.or(orParts.join(','))
    } else {
      // Cliente existe pero no tiene contratos ni líneas → sin resultados
      query = query.eq('id', '00000000-0000-0000-0000-000000000000')
    }
  }
```
A:
```ts
  if (clientId) {
    // El cliente de una incidencia se resuelve por su línea de contrato.
    if (cmIds.length > 0) {
      query = query.in('contract_machine_id', cmIds)
    } else {
      // Cliente sin líneas → sin resultados
      query = query.eq('id', '00000000-0000-0000-0000-000000000000')
    }
  }
```

- [ ] **Step 3: Actualizar tipos y mapeo de filas (líneas 78-95)**

De:
```ts
  type Row = NonNullable<typeof incidents>[number] & {
    contracts: { client_id: number; clients: { nom_client: string } | null } | null
    contract_machines: CmNested
    profiles: { full_name: string | null } | null
  }

  const rows = ((incidents ?? []) as unknown as Row[]).map((inc) => {
    const cm = inc.contract_machines
    const resolvedMachineId = cm?.machine_id ?? inc.machine_id
    const resolvedClientName =
      cm?.contracts?.clients?.nom_client ??
      inc.contracts?.clients?.nom_client ??
      null
```
A:
```ts
  type Row = NonNullable<typeof incidents>[number] & {
    contract_machines: CmNested
    profiles: { full_name: string | null } | null
  }

  const rows = ((incidents ?? []) as unknown as Row[]).map((inc) => {
    const cm = inc.contract_machines
    const resolvedMachineId = cm?.machine_id ?? inc.machine_id
    const resolvedClientName = cm?.contracts?.clients?.nom_client ?? null
```

(El `contractIds` de las líneas 42-45 se mantiene: se sigue usando para construir `cmIds`.)

- [ ] **Step 4: Verificar TS**
```bash
cd "/Users/juanmiguel/Claude/Web AMD Codex/web-amd" && npx tsc --noEmit 2>&1 | grep "incidents/page" | head -5
```
Expected: sin errores.

- [ ] **Step 5: Commit**
```bash
git add src/app/admin/incidents/page.tsx
git commit -m "refactor(incidents): listado y filtro por cliente sin contract_id legacy"
```

---

### Task 5: tech/incidents/[id]/page.tsx — quitar rama legacy + lieu_installation

**Files:** Modify `src/app/tech/incidents/[id]/page.tsx`

- [ ] **Step 1: Reemplazar el tipo contractInfo (líneas 36-41)**

De:
```ts
  let contractInfo: {
    numero_contrat: string | null
    lieu_installation: string | null
    clients: { nom_client: string } | null
    machines: { marque: string; modele: string; localisation: string | null } | null
  } | null = null
```
A:
```ts
  let contractInfo: {
    numero_contrat: string | null
    clients: { nom_client: string } | null
    machines: { marque: string; modele: string; localisation: string | null } | null
  } | null = null
```

- [ ] **Step 2: Reemplazar el bloque de resolución (líneas 43-68)**

De:
```ts
  if (incident.contract_id) {
    const { data } = await supabase
      .from('contracts')
      .select('numero_contrat, lieu_installation, clients(nom_client), machines(marque, modele, localisation)')
      .eq('id', incident.contract_id)
      .maybeSingle()
    contractInfo = data as typeof contractInfo
  } else if (incident.contract_machine_id) {
    const { data } = await supabase
      .from('contract_machines')
      .select('contracts(numero_contrat, clients(nom_client)), machines(marque, modele, localisation, numero_serie)')
      .eq('id', incident.contract_machine_id)
      .maybeSingle()
    if (data) {
      const cm = data as unknown as {
        contracts: { numero_contrat: string; clients: { nom_client: string } | null } | null
        machines: { marque: string; modele: string; localisation: string | null; numero_serie: string } | null
      }
      contractInfo = {
        numero_contrat: cm.contracts?.numero_contrat ?? null,
        lieu_installation: cm.machines?.localisation ?? null,
        clients: cm.contracts?.clients ?? null,
        machines: cm.machines ? { marque: cm.machines.marque, modele: cm.machines.modele, localisation: cm.machines.localisation } : null,
      }
    }
  }
```
A:
```ts
  if (incident.contract_machine_id) {
    const { data } = await supabase
      .from('contract_machines')
      .select('contracts(numero_contrat, clients(nom_client)), machines(marque, modele, localisation, numero_serie)')
      .eq('id', incident.contract_machine_id)
      .maybeSingle()
    if (data) {
      const cm = data as unknown as {
        contracts: { numero_contrat: string; clients: { nom_client: string } | null } | null
        machines: { marque: string; modele: string; localisation: string | null; numero_serie: string } | null
      }
      contractInfo = {
        numero_contrat: cm.contracts?.numero_contrat ?? null,
        clients: cm.contracts?.clients ?? null,
        machines: cm.machines ? { marque: cm.machines.marque, modele: cm.machines.modele, localisation: cm.machines.localisation } : null,
      }
    }
  }
```

- [ ] **Step 3: Simplificar machineLocation (línea 73)**

De:
```ts
  const machineLocation = machine?.localisation ?? contractInfo?.lieu_installation ?? null
```
A:
```ts
  const machineLocation = machine?.localisation ?? null
```

- [ ] **Step 4: Actualizar el comentario (líneas 34-35)**

Reemplazar por:
```ts
  // Resolver contexto de cliente/máquina/contrato vía contract_machine_id.
  // Incidencias públicas (QR) sin línea muestran solo machine_id.
```

- [ ] **Step 5: Verificar TS**
```bash
cd "/Users/juanmiguel/Claude/Web AMD Codex/web-amd" && npx tsc --noEmit 2>&1 | grep "tech/incidents" | head -5
```
Expected: sin errores.

- [ ] **Step 6: Commit**
```bash
git add "src/app/tech/incidents/[id]/page.tsx"
git commit -m "refactor(tech): incidencia sin fallback contract_id, localisation de máquina"
```

---

### Task 6: planning + scan/maintenance — lieu_installation → localisation

**Files:** Modify `src/app/tech/planning/page.tsx`, `src/app/tech/scan/[serie]/maintenance/[visitId]/page.tsx`

- [ ] **Step 1: planning — SELECT (líneas ~42-48)**

En el SELECT de `maintenance_visits`, cambiar el join de `contract_machines`:
De:
```ts
        contract_machines (
          machines ( numero_serie, marque, modele ),
          contracts ( lieu_installation, clients ( nom_client ) )
        )
```
A:
```ts
        contract_machines (
          machines ( numero_serie, marque, modele, localisation ),
          contracts ( clients ( nom_client ) )
        )
```

- [ ] **Step 2: planning — tipo y toRow**

En la función `toRow`, el tipo `line` y la lectura de `lieu`. Cambiar el tipo de `contracts` para quitar `lieu_installation` y añadir `localisation` a `machines`, y cambiar:
```ts
      lieu:   line?.contracts?.lieu_installation ?? null,
```
por:
```ts
      lieu:   line?.machines?.localisation ?? null,
```
Y en el tipo inline de `line` dentro de `toRow`:
```ts
    const line = v.contract_machines as unknown as {
      machines: { numero_serie: string; marque: string; modele: string; localisation: string | null } | null
      contracts: { clients: { nom_client: string } | null } | null
    } | null
```

- [ ] **Step 3: scan/maintenance/[visitId] — SELECT y lectura**

En el SELECT, cambiar:
```ts
      contract_machines (
        machine_id,
        machines ( numero_serie, marque, modele ),
        contracts ( lieu_installation, clients ( nom_client ) )
      )
```
A:
```ts
      contract_machines (
        machine_id,
        machines ( numero_serie, marque, modele, localisation ),
        contracts ( clients ( nom_client ) )
      )
```
Cambiar el tipo de `line`:
```ts
  const line    = visit.contract_machines as unknown as {
    machine_id: string
    machines: { numero_serie: string; marque: string; modele: string; localisation: string | null } | null
    contracts: { clients: { nom_client: string } | null } | null
  } | null
```
Y el prop `machineLocation`:
```ts
      machineLocation={line?.machines?.localisation ?? null}
```

- [ ] **Step 4: Verificar TS**
```bash
cd "/Users/juanmiguel/Claude/Web AMD Codex/web-amd" && npx tsc --noEmit 2>&1 | grep -E "planning|visitId\]/page" | head -10
```
Expected: sin errores.

- [ ] **Step 5: Commit**
```bash
git add src/app/tech/planning/page.tsx "src/app/tech/scan/[serie]/maintenance/[visitId]/page.tsx"
git commit -m "refactor(tech): localisation de máquina en planning y cierre maintenance"
```

---

### Task 7: atelier/page.tsx — join legacy → contract_machines

**Files:** Modify `src/app/atelier/page.tsx`

**Contexto:** el SELECT de `maintenance_visits` (línea ~57) usa `maintenance_plans ( contracts ( clients, machines ) )`, que depende de `contracts.machine_id` (se romperá con el DROP). Migrar al patrón de `tech/planning` (leer máquina/cliente vía `contract_machines`).

- [ ] **Step 1: Leer el archivo y localizar el SELECT de maintenance_visits + su render**

Lee `src/app/atelier/page.tsx`. Localiza el SELECT (≈línea 53-61) y todos los accesos a `maintenance_plans.contracts.machines` / `.clients` en el render de visitas de mantenimiento.

- [ ] **Step 2: Reemplazar el SELECT**

De:
```ts
        id, scheduled_date, status, assigned_to,
        maintenance_plans ( contracts ( clients ( nom_client ), machines ( marque, modele ) ) ),
        profiles!assigned_to ( full_name )
```
A:
```ts
        id, scheduled_date, status, assigned_to,
        contract_machines ( machines ( marque, modele ), contracts ( clients ( nom_client ) ) ),
        profiles!assigned_to ( full_name )
```

- [ ] **Step 3: Actualizar el render/mapeo de visitas**

Donde el código lea `plan.contracts.machines` y `plan.contracts.clients` (vía `maintenance_plans`), cambiar a leer de `contract_machines`:
- `const line = v.contract_machines as any` (en lugar de `const plan = v.maintenance_plans as any; const contract = plan?.contracts`)
- máquina: `line?.machines?.marque` / `line?.machines?.modele`
- cliente: `line?.contracts?.clients?.nom_client`

Ajustar los tipos inline correspondientes. El render visual (clases, estructura) NO cambia, solo la fuente de los datos.

- [ ] **Step 4: Verificar TS**
```bash
cd "/Users/juanmiguel/Claude/Web AMD Codex/web-amd" && npx tsc --noEmit 2>&1 | grep "atelier" | head -10
```
Expected: sin errores.

- [ ] **Step 5: Commit**
```bash
git add src/app/atelier/page.tsx
git commit -m "refactor(atelier): visitas de mantenimiento vía contract_machines"
```

---

### Task 8: AgendaPanel admin — join legacy → contract_machines

**Files:** Modify `src/components/admin/AgendaPanel.tsx`

- [ ] **Step 1: Reemplazar el SELECT de maintenance_visits (líneas ~50-59)**

De:
```ts
      .from('maintenance_visits')
      .select(`
        id, scheduled_date, status,
        maintenance_plans (
          contracts (
            clients  ( nom_client ),
            machines ( marque, modele )
          )
        )
      `)
```
A:
```ts
      .from('maintenance_visits')
      .select(`
        id, scheduled_date, status,
        contract_machines (
          machines ( marque, modele ),
          contracts ( clients ( nom_client ) )
        )
      `)
```

- [ ] **Step 2: Actualizar el mapeo (líneas ~122-137)**

De:
```ts
                const plan     = v.maintenance_plans as any
                const contract = plan?.contracts as any
```
A:
```ts
                const line     = v.contract_machines as any
                const contract = line?.contracts as any
                const machine  = line?.machines as any
```
Y donde se lea `contract?.machines?.marque` / `contract?.machines?.modele`, cambiar a `machine?.marque` / `machine?.modele`. El `contract?.clients?.nom_client` se mantiene (ahora `contract` viene de `line.contracts`).

- [ ] **Step 3: Verificar TS**
```bash
cd "/Users/juanmiguel/Claude/Web AMD Codex/web-amd" && npx tsc --noEmit 2>&1 | grep "admin/AgendaPanel" | head -5
```
Expected: sin errores.

- [ ] **Step 4: Commit**
```bash
git add src/components/admin/AgendaPanel.tsx
git commit -m "refactor(agenda): admin AgendaPanel vía contract_machines"
```

---

### Task 9: AgendaPanel tech — join legacy → contract_machines

**Files:** Modify `src/components/tech/AgendaPanel.tsx`

- [ ] **Step 1: Leer el archivo**

Lee `src/components/tech/AgendaPanel.tsx`. Localiza el SELECT de `maintenance_visits` (≈línea 38-46) con `maintenance_plans ( contracts ( clients, machines ) )` y su mapeo (≈línea 91).

- [ ] **Step 2: Reemplazar el SELECT**

Cambiar el join de:
```ts
        maintenance_plans (
          contracts (
            clients  ( nom_client ),
            machines ( numero_serie, marque, modele )
          )
        )
```
A:
```ts
        contract_machines (
          machines ( numero_serie, marque, modele ),
          contracts ( clients ( nom_client ) )
        )
```

- [ ] **Step 3: Actualizar el mapeo**

Donde el código lea `v.maintenance_plans` → `contracts` → `machines`/`clients`, cambiar a `v.contract_machines` → `machines` (directo) y `contracts.clients`. Patrón idéntico a Task 8.

- [ ] **Step 4: Verificar TS**
```bash
cd "/Users/juanmiguel/Claude/Web AMD Codex/web-amd" && npx tsc --noEmit 2>&1 | grep "tech/AgendaPanel" | head -5
```
Expected: sin errores.

- [ ] **Step 5: Commit**
```bash
git add src/components/tech/AgendaPanel.tsx
git commit -m "refactor(agenda): tech AgendaPanel vía contract_machines"
```

---

### Task 10: Build, PR, MERGE y verificación de deploy

**Files:** N/A

- [ ] **Step 1: Confirmar que no quedan usos legacy**
```bash
cd "/Users/juanmiguel/Claude/Web AMD Codex/web-amd"
echo "=== incidents.contract_id (NO debe haber; contract_machines.contract_id SÍ es válido) ==="
rg "incident\.contract_id|incidents.*\bcontract_id\b|\.eq\('id', incident\.contract_id" src/ || echo "limpio"
echo "=== lieu_installation ==="
rg "lieu_installation" src/ || echo "limpio"
echo "=== join legacy contracts(...machines...) ==="
rg "contracts\s*\([^)]*machines" src/ || echo "limpio"
echo "=== maintenance_plans ( contracts ==="
rg "maintenance_plans\s*\(\s*\n?\s*contracts" src/ || echo "limpio"
```
Expected: "limpio" en incidents.contract_id, lieu_installation, joins legacy. (Pueden aparecer `contract_machines.contract_id` y `machine_counters.contract_id` — son válidos, NO legacy.)

- [ ] **Step 2: Build completo**
```bash
cd "/Users/juanmiguel/Claude/Web AMD Codex/web-amd" && npx tsc --noEmit 2>&1 | head -20 && echo "EXIT: $?"
```
Expected: 0 errores.

- [ ] **Step 3: Push + PR (SOLO CÓDIGO, sin la migración DROP todavía)**
```bash
cd "/Users/juanmiguel/Claude/Web AMD Codex/web-amd"
git push origin refactor/fase4-cleanup-legacy
gh pr create \
  --title "refactor: Fase 4 cleanup legacy — migrar últimos usos (código)" \
  --body "$(cat <<'EOF'
## Qué hace
Migra los últimos usos de columnas legacy al modelo contract_machines, **preparando el DROP**. Esta es la parte de CÓDIGO; el DROP se aplica por separado tras verificar el deploy (orden inviolable sin staging).

- `csat.ts`, `admin/incidents` (detalle + lista), `tech/incidents`: resolución solo por contract_machine_id/machine_id (sin fallback contract_id).
- `tech/planning`, `tech/scan/.../maintenance`: lieu_installation → machines.localisation.
- `atelier`, `AgendaPanel` (admin + tech): join legacy maintenance→contracts→machines migrado a contract_machines (estaba roto para contratos nuevos).

## Siguiente
Tras merge + deploy + verificación: migración DROP de columnas/funciones legacy + regenerar types.ts.
EOF
)"
```

- [ ] **Step 4: Merge + actualizar main**
```bash
cd "/Users/juanmiguel/Claude/Web AMD Codex/web-amd" && gh pr merge --merge --delete-branch
git checkout main && git pull
git log -1 --oneline
```

- [ ] **Step 5: Verificar deploy en producción**

Confirmar que el deploy de Vercel sobre el nuevo merge está SUCCESS antes de continuar. Si hay forma de smoke (abrir /admin/incidents, /tech/planning, /atelier), hacerlo. **NO continuar a Task 11 hasta confirmar que el código nuevo está desplegado.**

---

### Task 11: Migración DROP (solo tras deploy verificado)

**Files:** Create `supabase/migrations/<ts>_cleanup_legacy_contracts.sql`

- [ ] **Step 1: Confirmar firmas de las RPCs legacy en producción**

`mcp__supabase__execute_sql` (project_id `myyejbviunyvywfukysj`):
```sql
SELECT proname, pg_get_function_identity_arguments(oid) AS args
FROM pg_proc
WHERE proname IN ('create_client_with_contract','create_machine_with_contract',
                  'auth_tech_incident_contract_ids','auth_tech_incident_ids','auth_tech_incident_machine_ids')
ORDER BY proname;
```
Anotar las firmas exactas para el DROP.

- [ ] **Step 2: Listar dependencias que bloquearían el DROP**
```sql
-- ¿Alguna política RLS referencia incidents.contract_id o las funciones legacy?
SELECT polname, tablename, pg_get_expr(polqual, polrelid) AS qual
FROM pg_policy JOIN pg_class ON pg_class.oid = polrelid
WHERE pg_get_expr(polqual, polrelid) ILIKE '%contract_id%'
   OR pg_get_expr(polqual, polrelid) ILIKE '%auth_tech_incident%';
```
Si aparece alguna política que dependa de `incidents.contract_id` o de las funciones legacy, hay que recrearla/eliminarla en la misma migración ANTES del DROP. (Las funciones `auth_tech_incident_*` ya no se usan en políticas tras Fase 1-3, pero confirmar.)

- [ ] **Step 3: Crear el archivo de migración**

Usar timestamp actual. Ajustar las firmas de funciones según el Step 1. Si el Step 2 reveló políticas dependientes, añadir su DROP/recreación antes de los DROP de columna.

```sql
-- Fase 4: cleanup de columnas y funciones legacy del refactor de contratos N máquinas.
-- Código que ya no usa estas columnas DESPLEGADO en producción (verificado).
-- Datos migrados: ningún DROP pierde información.

BEGIN;

DROP FUNCTION IF EXISTS auth_tech_incident_contract_ids();
DROP FUNCTION IF EXISTS auth_tech_incident_ids();
DROP FUNCTION IF EXISTS auth_tech_incident_machine_ids();

DROP FUNCTION IF EXISTS create_client_with_contract(<firma del Step 1>);
DROP FUNCTION IF EXISTS create_machine_with_contract(<firma del Step 1>);

ALTER TABLE incidents DROP COLUMN IF EXISTS contract_id;
ALTER TABLE contracts DROP COLUMN IF EXISTS machine_id;
ALTER TABLE contracts DROP COLUMN IF EXISTS lieu_installation;

COMMIT;
```

- [ ] **Step 4: Aplicar vía MCP**

`mcp__supabase__apply_migration` con project_id `myyejbviunyvywfukysj`, name `cleanup_legacy_contracts`, query = el SQL.

- [ ] **Step 5: Verificar el DROP**
```sql
SELECT
  (SELECT count(*) FROM information_schema.columns WHERE table_name='contracts' AND column_name IN ('machine_id','lieu_installation')) AS cols_contracts_legacy,
  (SELECT count(*) FROM information_schema.columns WHERE table_name='incidents' AND column_name='contract_id') AS incidents_contract_id,
  (SELECT count(*) FROM pg_proc WHERE proname LIKE 'auth_tech_incident%' OR proname IN ('create_client_with_contract','create_machine_with_contract')) AS funcs_legacy;
```
Expected: las 3 columnas = 0, funcs_legacy = 0.

- [ ] **Step 6: Commit**
```bash
cd "/Users/juanmiguel/Claude/Web AMD Codex/web-amd"
git add supabase/migrations/*_cleanup_legacy_contracts.sql
git commit -m "refactor(db): DROP columnas y funciones legacy del refactor de contratos"
git push origin main
```

---

### Task 12: Regenerar types.ts + smoke final

**Files:** Modify `src/lib/supabase/types.ts`

- [ ] **Step 1: Regenerar types desde la BD**

Usar `mcp__supabase__generate_typescript_types` (project_id `myyejbviunyvywfukysj`) y escribir el resultado en `src/lib/supabase/types.ts`.

- [ ] **Step 2: Build completo**
```bash
cd "/Users/juanmiguel/Claude/Web AMD Codex/web-amd" && npx tsc --noEmit 2>&1 | head -20 && echo "EXIT: $?"
```
Expected: 0 errores. (Si algo falla, es un uso de columna legacy que se escapó — corregirlo.)

- [ ] **Step 3: Confirmar que types.ts ya no tiene las columnas legacy**
```bash
cd "/Users/juanmiguel/Claude/Web AMD Codex/web-amd"
rg "lieu_installation" src/lib/supabase/types.ts || echo "limpio lieu"
rg "auth_tech_incident|create_client_with_contract|create_machine_with_contract" src/lib/supabase/types.ts || echo "limpio funcs"
```
Expected: "limpio". (`contract_id` puede seguir en `contract_machines` y `machine_counters` — válido.)

- [ ] **Step 4: Commit + push**
```bash
git add src/lib/supabase/types.ts
git commit -m "refactor(types): regenerar tras DROP de columnas legacy"
git push origin main
```

- [ ] **Step 5: Smoke final**

Verificar en producción: /admin/incidents (lista + detalle + filtro cliente), /tech/incidents/[id], /tech/planning, /atelier, /admin (con AgendaPanel), cierre de mantenimiento. Confirmar que nada quedó roto tras el DROP.

---

## Checklist de aceptación

- [ ] Código sin lecturas de `incidents.contract_id`, `lieu_installation`, ni joins legacy `contracts(...machines)`
- [ ] Build limpio con código nuevo ANTES del DROP
- [ ] Código mergeado y desplegado en producción (verificado) ANTES del DROP
- [ ] Migración DROP aplicada sin error (dependencias resueltas)
- [ ] Columnas y funciones legacy = 0 en BD
- [ ] `types.ts` regenerado, build limpio
- [ ] Smoke final OK (incidencias, planning, atelier, agenda, mantenimiento)
