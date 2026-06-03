# Fase 1 — Hotfixes BD + Lecturas Core — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Corregir los 10 hallazgos críticos/altos del refactor contratos N-máquinas: índices únicos en BD, lecturas legacy en incidencias y contadores admin, y Edge Functions Princity desactualizadas.

**Architecture:** Puramente aditivo — se añaden índices, se amplían SELECTs con join a `contract_machines`, y se actualizan las Edge Functions. No se elimina ninguna columna legacy (eso es Fase 4). Todos los cambios mantienen fallback para incidencias/contratos pre-refactor.

**Tech Stack:** Next.js 16 App Router, Supabase JS client, TypeScript, Deno (Edge Functions), Supabase CLI (`supabase functions deploy`)

---

## Mapa de archivos

| Archivo | Acción |
|---|---|
| `supabase/migrations/20260603210000_fase1_indices.sql` | Crear |
| `src/app/admin/contadores/[serie]/actions.ts` | Modificar L70-72 |
| `src/lib/csat.ts` | Modificar L18-26 |
| `src/app/admin/incidents/page.tsx` | Modificar query + filtro cliente |
| `src/app/admin/incidents/[id]/page.tsx` | Modificar L39-55 |
| `src/app/admin/contadores/page.tsx` | Modificar query principal |
| `src/app/admin/contadores/[serie]/page.tsx` | Modificar L86-91 |
| `supabase/functions/princity-counters/index.ts` | Modificar select + lógica billing_day + error 23505 |
| `supabase/functions/princity-alerts/index.ts` | Eliminar `contract_id` del insert |

---

### Task 1: Rama Git

**Files:**
- N/A

- [ ] **Step 1: Crear rama desde main actualizado**

```bash
git checkout main && git pull
git checkout -b fix/fase1-hotfixes-bd-lecturas-core
```

Expected: prompt muestra `fix/fase1-hotfixes-bd-lecturas-core`

---

### Task 2: Migración SQL — Índices (Bloque A)

**Files:**
- Crear: `supabase/migrations/20260603210000_fase1_indices.sql`

- [ ] **Step 1: Crear el archivo de migración**

```sql
-- Fase 1: Índices para robustez post-refactor contratos N máquinas
-- Ningún DROP — migración puramente aditiva

BEGIN;

-- 1. Unicidad de contador activo por máquina y mes.
--    Sin este índice dos escrituras concurrentes (manual + Princity)
--    pueden crear dos relevés activos para el mismo mes.
CREATE UNIQUE INDEX IF NOT EXISTS machine_counters_one_active_per_month
  ON public.machine_counters (machine_id, year, month)
  WHERE status = 'actif';

-- 2. Rendimiento en listados de incidencias filtrados por línea de contrato.
CREATE INDEX IF NOT EXISTS incidents_contract_machine_id_idx
  ON public.incidents (contract_machine_id);

-- 3. Acelera getOpenLineForMachine(): búsqueda de línea abierta+activa por máquina.
CREATE INDEX IF NOT EXISTS contract_machines_open_active_idx
  ON public.contract_machines (contract_id, machine_id)
  WHERE date_fin IS NULL AND statut = 'actif';

COMMIT;
```

- [ ] **Step 2: Aplicar la migración a producción vía Supabase MCP**

Usar la herramienta `mcp__supabase__apply_migration` con:
- `project_id`: `myyejbviunyvywfukysj`
- `name`: `fase1_indices`
- SQL: el contenido del archivo de arriba

- [ ] **Step 3: Verificar que los índices existen**

Usar `mcp__supabase__execute_sql` con:
```sql
SELECT indexname, indexdef
FROM pg_indexes
WHERE tablename IN ('machine_counters', 'incidents', 'contract_machines')
  AND indexname IN (
    'machine_counters_one_active_per_month',
    'incidents_contract_machine_id_idx',
    'contract_machines_open_active_idx'
  );
```

Expected: 3 filas, una por cada índice.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/20260603210000_fase1_indices.sql
git commit -m "fix(db): añadir índices unicidad contadores y rendimiento contract_machines"
```

---

### Task 3: Capturar error 23505 en saveCounterAction (Bloque C)

**Files:**
- Modify: `src/app/admin/contadores/[serie]/actions.ts:70-72`

- [ ] **Step 1: Localizar el bloque de error genérico**

En `src/app/admin/contadores/[serie]/actions.ts`, líneas 69-73:
```ts
  if (error) {
    console.error('[saveCounter]', error)
    return { error: 'Une erreur est survenue. Veuillez réessayer.' }
  }
```

- [ ] **Step 2: Reemplazar por manejo específico de 23505**

```ts
  if (error) {
    if (error.code === '23505') {
      return { error: `Un relevé actif existe déjà pour ce mois. Annulez-le d'abord avant d'en créer un nouveau.` }
    }
    console.error('[saveCounter]', error)
    return { error: 'Une erreur est survenue. Veuillez réessayer.' }
  }
```

- [ ] **Step 3: Verificar que la verificación previa de duplicado sigue funcionando**

Las líneas 29-39 ya hacen la verificación previa con `.maybeSingle()`. El nuevo bloque es la red de seguridad para escrituras concurrentes. Ambos coexisten correctamente.

- [ ] **Step 4: Commit**

```bash
git add src/app/admin/contadores/[serie]/actions.ts
git commit -m "fix(contadores): capturar error 23505 en guardado manual de relevé"
```

---

### Task 4: csat.ts — Resolver cliente por contract_machine_id (Bloque B)

**Files:**
- Modify: `src/lib/csat.ts`

- [ ] **Step 1: Leer el archivo actual**

El archivo actual (`src/lib/csat.ts`) retorna temprano en L24 si `incident.contract_id` es null. Las incidencias nuevas tienen `contract_machine_id` y `contract_id=null`, por lo que el CSAT nunca se envía.

- [ ] **Step 2: Reemplazar la función completa**

```ts
import { createAdminClient } from './supabase/admin'
import { sendEmail } from './email'

export async function sendCsatForIncident(incidentId: string): Promise<void> {
  const admin = createAdminClient()

  const { data: existing } = await admin
    .from('csat_responses')
    .select('token, responded_at')
    .eq('incident_id', incidentId)
    .maybeSingle()

  if (existing?.responded_at) return

  const { data: incident } = await admin
    .from('incidents')
    .select('id, title, contract_id, contract_machine_id, contracts(client_id)')
    .eq('id', incidentId)
    .single()

  if (!incident) return

  // Resolver client_id: primero por contract_machine_id (modelo nuevo),
  // luego por contract_id (fallback legacy).
  let clientId: number | null = null

  if (incident.contract_machine_id) {
    const { data: line } = await admin
      .from('contract_machines')
      .select('contracts(client_id)')
      .eq('id', incident.contract_machine_id)
      .single()
    clientId = (line?.contracts as unknown as { client_id: number } | null)?.client_id ?? null
  }

  if (!clientId && incident.contract_id) {
    clientId = (incident.contracts as unknown as { client_id: number } | null)?.client_id ?? null
  }

  if (!clientId) return

  const { data: cp } = await admin
    .from('client_profiles')
    .select('profile_id')
    .eq('client_id', clientId)
    .maybeSingle()

  if (!cp?.profile_id) return

  const { data: { user } } = await admin.auth.admin.getUserById(cp.profile_id)
  if (!user?.email) return

  let token: string
  if (existing) {
    token = existing.token
  } else {
    const { data: csat } = await admin
      .from('csat_responses')
      .insert({ incident_id: incidentId })
      .select('token')
      .single()
    if (!csat?.token) return
    token = csat.token
  }

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000'
  const csatUrl = `${appUrl}/csat/${token}`

  await sendEmail({
    template: 'csat',
    to: user.email,
    data: { title: incident.title, csat_url: csatUrl },
  })

  const { data: closed } = await admin
    .from('incidents')
    .update({ status: 'fermé', closed_at: new Date().toISOString() })
    .eq('id', incidentId)
    .eq('status', 'résolu')
    .select('id')

  if (closed && closed.length > 0) {
    await admin.from('incident_history').insert({
      incident_id: incidentId,
      changed_by: null,
      old_status: 'résolu',
      new_status: 'fermé',
      comment: 'Fermé automatiquement — email CSAT envoyé',
    })
  }
}
```

- [ ] **Step 3: Verificar TypeScript**

```bash
cd "/Users/juanmiguel/Claude/Web AMD Codex/web-amd" && npx tsc --noEmit 2>&1 | head -30
```

Expected: sin errores en `src/lib/csat.ts`

- [ ] **Step 4: Commit**

```bash
git add src/lib/csat.ts
git commit -m "fix(csat): resolver cliente por contract_machine_id con fallback legacy"
```

---

### Task 5: incidents/page.tsx — SELECT ampliado + filtro cliente (Bloque B)

**Files:**
- Modify: `src/app/admin/incidents/page.tsx`

- [ ] **Step 1: Reemplazar el bloque de carga paralela (líneas 33-57)**

Reemplazar desde `const [clientsRes, contractIdsRes]` hasta el bloque `if (clientId)` inclusive:

```ts
  const [clientsRes, contractIdsRes] = await Promise.all([
    supabase.from('clients').select('id, nom_client').order('nom_client'),
    clientId
      ? supabase.from('contracts').select('id').eq('client_id', clientId)
      : Promise.resolve({ data: null }),
  ])

  // Para incidencias nuevas (post-refactor) el cliente está en contract_machines,
  // no en contracts. Cargamos los IDs de líneas del cliente seleccionado.
  const contractIds = (contractIdsRes.data ?? []).map((c) => c.id)
  const cmIds: string[] = clientId && contractIds.length > 0
    ? ((await supabase.from('contract_machines').select('id').in('contract_id', contractIds)).data ?? []).map((l) => l.id)
    : []
```

- [ ] **Step 2: Reemplazar el SELECT de incidencias (líneas 40-48)**

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

- [ ] **Step 3: Reemplazar el filtro por cliente (líneas 53-57)**

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

- [ ] **Step 4: Reemplazar el mapeo de filas (líneas 63-101)**

```ts
  type CmNested = {
    machine_id: string
    machines: { numero_serie: string } | null
    contracts: { client_id: number; clients: { nom_client: string } | null } | null
  } | null
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
    return {
      id: inc.id,
      numero_incident: inc.numero_incident,
      title: inc.title,
      status: inc.status,
      priority: inc.priority,
      category: inc.category,
      machine_id: resolvedMachineId,
      created_at: inc.created_at,
      clientName: resolvedClientName,
      technicianName: (inc.profiles as unknown as { full_name: string | null } | null)?.full_name ?? null,
    }
  })
```

- [ ] **Step 5: Verificar TypeScript**

```bash
cd "/Users/juanmiguel/Claude/Web AMD Codex/web-amd" && npx tsc --noEmit 2>&1 | head -30
```

Expected: sin errores en `src/app/admin/incidents/page.tsx`

- [ ] **Step 6: Commit**

```bash
git add src/app/admin/incidents/page.tsx
git commit -m "fix(incidents): ampliar SELECT con contract_machines y corregir filtro por cliente"
```

---

### Task 6: incidents/[id]/page.tsx — Contexto por contract_machine_id (Bloque B)

**Files:**
- Modify: `src/app/admin/incidents/[id]/page.tsx:39-55`

- [ ] **Step 1: Reemplazar el bloque de resolución de contexto (líneas 39-55)**

Actualmente:
```ts
  // Context: contract → client + machine (contract_id puede ser null en incidentes públicos)
  const { data: contract } = incident.contract_id
    ? await supabase
        .from('contracts')
        .select('numero_contrat, clients(nom_client), machines(marque, modele)')
        .eq('id', incident.contract_id)
        .maybeSingle()
    : { data: null }

  const clientData  = contract?.clients  as unknown as { nom_client: string }      | null
  const machineData = contract?.machines as unknown as { marque: string; modele: string } | null

  const contextInfo = {
    clientName:     clientData?.nom_client ?? null,
    machineName:    machineData ? `${machineData.marque} ${machineData.modele}` : incident.machine_id,
    contractNumber: contract?.numero_contrat ?? null,
  }
```

Reemplazar por:
```ts
  // Resolución de contexto en orden de prioridad:
  // 1. contract_machine_id (incidencias internas nuevas, post-refactor)
  // 2. machine_id directo (incidencias públicas QR)
  // 3. contract_id (incidencias internas legacy, pre-refactor)
  let contextInfo = { clientName: null as string | null, machineName: null as string | null, contractNumber: null as string | null }

  if (incident.contract_machine_id) {
    const { data: line } = await supabase
      .from('contract_machines')
      .select('machine_id, machines(marque, modele), contracts(numero_contrat, clients(nom_client))')
      .eq('id', incident.contract_machine_id)
      .maybeSingle()
    const lineTyped = line as unknown as {
      machine_id: string
      machines: { marque: string; modele: string } | null
      contracts: { numero_contrat: string; clients: { nom_client: string } | null } | null
    } | null
    if (lineTyped) {
      contextInfo = {
        clientName:     lineTyped.contracts?.clients?.nom_client ?? null,
        machineName:    lineTyped.machines ? `${lineTyped.machines.marque} ${lineTyped.machines.modele}` : lineTyped.machine_id,
        contractNumber: lineTyped.contracts?.numero_contrat ?? null,
      }
    }
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

- [ ] **Step 2: Verificar TypeScript**

```bash
cd "/Users/juanmiguel/Claude/Web AMD Codex/web-amd" && npx tsc --noEmit 2>&1 | head -30
```

Expected: sin errores en `src/app/admin/incidents/[id]/page.tsx`

- [ ] **Step 3: Commit**

```bash
git add src/app/admin/incidents/[id]/page.tsx
git commit -m "fix(incidents): resolver contexto por contract_machine_id con fallback legacy"
```

---

### Task 7: contadores/page.tsx — Reconstruir desde contract_machines (Bloque C)

**Files:**
- Modify: `src/app/admin/contadores/page.tsx:58-106`

- [ ] **Step 1: Reemplazar las dos queries iniciales (líneas 58-70)**

Actualmente hay dos queries separadas:
```ts
  const { data: rawMachines } = await supabase
    .from('machines')
    .select('numero_serie, marque, modele, contracts(statut, client_id, clients(id, nom_client))')
    .eq('active', true)
    .order('marque')

  const { data: allActiveCounters } = await supabase
    .from('machine_counters')
    .select('machine_id, year, month')
    .eq('status', 'actif')
    .order('year',  { ascending: false })
    .order('month', { ascending: false })
```

Reemplazar ambas por tres queries paralelas (la de contadores pasa a ser la tercera):
```ts
  const [activeLinesRes, allMachinesRes, allActiveCountersRes] = await Promise.all([
    supabase
      .from('contract_machines')
      .select('machine_id, machines(numero_serie, marque, modele), contracts(client_id, clients(id, nom_client))')
      .is('date_fin', null)
      .eq('statut', 'actif'),
    supabase
      .from('machines')
      .select('numero_serie, marque, modele')
      .eq('active', true)
      .order('marque'),
    supabase
      .from('machine_counters')
      .select('machine_id, year, month')
      .eq('status', 'actif')
      .order('year',  { ascending: false })
      .order('month', { ascending: false }),
  ])
```

- [ ] **Step 2: Reemplazar el bloque de contadores y presencia (líneas 64-84)**

```ts
  const allActiveCounters = allActiveCountersRes.data

  const presence = new Set<string>()
  const latestMap = new Map<string, { year: number; month: number }>()
  if (allActiveCounters) {
    const seen = new Set<string>()
    allActiveCounters.forEach((c) => {
      presence.add(`${c.machine_id}|${c.year}|${c.month}`)
      if (!seen.has(c.machine_id)) {
        latestMap.set(c.machine_id, { year: c.year, month: c.month })
        seen.add(c.machine_id)
      }
    })
  }
```

- [ ] **Step 3: Reemplazar el mapeo de máquinas (líneas 92-120)**

```ts
  type ActiveLine = {
    machine_id: string
    machines: { numero_serie: string; marque: string; modele: string } | null
    contracts: { client_id: number; clients: { id: number; nom_client: string } | null } | null
  }

  const activeMachineIds = new Set<string>()
  const machines: Machine[] = (activeLinesRes.data ?? []).map((l) => {
    const line = l as unknown as ActiveLine
    const m = line.machines
    if (!m) return null
    activeMachineIds.add(m.numero_serie)
    const c = line.contracts
    return {
      numero_serie: m.numero_serie,
      marque:       m.marque,
      modele:       m.modele,
      clientId:     c?.client_id ?? null,
      clientName:   c?.clients?.nom_client ?? null,
    }
  }).filter((m): m is Machine => m !== null)

  // Máquinas activas sin línea de contrato abierta
  const noClient: Machine[] = (allMachinesRes.data ?? [])
    .filter((m) => !activeMachineIds.has(m.numero_serie))
    .map((m) => ({ ...m, clientId: null, clientName: null }))
```

- [ ] **Step 4: Verificar TypeScript**

```bash
cd "/Users/juanmiguel/Claude/Web AMD Codex/web-amd" && npx tsc --noEmit 2>&1 | head -30
```

Expected: sin errores en `src/app/admin/contadores/page.tsx`

- [ ] **Step 5: Commit**

```bash
git add src/app/admin/contadores/page.tsx
git commit -m "fix(contadores): reconstruir listado desde contract_machines en lugar de join legacy"
```

---

### Task 8: contadores/[serie]/page.tsx — Usar getOpenLineForMachine() (Bloque C)

**Files:**
- Modify: `src/app/admin/contadores/[serie]/page.tsx:1-11, 86-93`

- [ ] **Step 1: Añadir import de getOpenLineForMachine**

Al inicio del archivo, después de los imports existentes, añadir:
```ts
import { getOpenLineForMachine } from '@/lib/contract-machines'
```

- [ ] **Step 2: Reemplazar la query de contrato (líneas 86-93)**

Actualmente:
```ts
  const { data: contract } = await supabase
    .from('contracts')
    .select('id, numero_contrat, clients(id, nom_client)')
    .eq('machine_id', numero_serie)
    .eq('statut', 'actif')
    .maybeSingle()

  const client = contract?.clients as unknown as { id: number; nom_client: string } | null
```

Reemplazar por:
```ts
  const openLine = await getOpenLineForMachine(supabase, numero_serie)
  let contract: { id: string; numero_contrat: string; clients: { id: number; nom_client: string } | null } | null = null
  if (openLine?.contract_id) {
    const { data } = await supabase
      .from('contracts')
      .select('id, numero_contrat, clients(id, nom_client)')
      .eq('id', openLine.contract_id)
      .maybeSingle()
    contract = data as typeof contract
  }

  const client = contract?.clients as unknown as { id: number; nom_client: string } | null
```

- [ ] **Step 3: Verificar TypeScript**

```bash
cd "/Users/juanmiguel/Claude/Web AMD Codex/web-amd" && npx tsc --noEmit 2>&1 | head -30
```

Expected: sin errores en `src/app/admin/contadores/[serie]/page.tsx`

- [ ] **Step 4: Commit**

```bash
git add src/app/admin/contadores/[serie]/page.tsx
git commit -m "fix(contadores): usar getOpenLineForMachine() en detalle de máquina"
```

---

### Task 9: princity-counters — statut + billing_day_override + 23505 (Bloque D)

**Files:**
- Modify: `supabase/functions/princity-counters/index.ts`

- [ ] **Step 1: Añadir `statut` y `billing_day_override` al SELECT (líneas 22-39)**

Actualmente el SELECT no incluye `billing_day_override` ni filtra por `statut`. Reemplazar el bloque completo de la query:

```ts
    const { data: lines } = await db
      .from('contract_machines')
      .select(`
        machine_id,
        contract_id,
        billing_day_override,
        statut,
        contracts!inner (
          id,
          client_id,
          billing_day,
          statut
        ),
        machines!inner (
          numero_serie,
          princity_device_id
        )
      `)
      .is('date_fin', null)
      .eq('statut', 'actif')
      .eq('contracts.statut', 'actif')
      .not('machines.princity_device_id', 'is', null)
```

- [ ] **Step 2: Exponer billing_day_override en el mapeo (líneas 41-48)**

```ts
    const machinesWithContracts = (lines ?? []).map(l => ({
      numero_serie:         (l.machines as unknown as { numero_serie: string; princity_device_id: string | null }).numero_serie,
      princity_device_id:   (l.machines as unknown as { numero_serie: string; princity_device_id: string | null }).princity_device_id,
      billing_day_override: l.billing_day_override as number | null,
      contracts:            l.contracts as unknown as { id: string; client_id: number; billing_day: number | null; statut: string },
    }))
```

- [ ] **Step 3: Usar effectiveBillingDay en la lógica de salto (líneas 51-55)**

```ts
      const contract          = m.contracts
      const effectiveBillingDay = m.billing_day_override ?? contract.billing_day

      if (effectiveBillingDay !== null && effectiveBillingDay !== todayDay) continue
```

- [ ] **Step 4: Capturar 23505 en el insert (líneas 111-115)**

Actualmente:
```ts
      if (insertErr) {
        console.error('[princity-counters] insert error:', insertErr.message)
        errors++
        continue
      }
```

Reemplazar por:
```ts
      if (insertErr) {
        if ((insertErr as { code?: string }).code === '23505') {
          // Relevé ya existe (race entre cron y guardado manual) — idempotencia OK
          continue
        }
        console.error('[princity-counters] insert error:', insertErr.message)
        errors++
        continue
      }
```

- [ ] **Step 5: Verificar que el archivo compila**

La Edge Function es Deno/TypeScript. Revisar manualmente que no haya errores de sintaxis obvios (el deploy los detectará).

- [ ] **Step 6: Commit**

```bash
git add supabase/functions/princity-counters/index.ts
git commit -m "fix(princity-counters): filtrar statut=actif, respetar billing_day_override, capturar 23505"
```

---

### Task 10: princity-alerts — Eliminar contract_id legacy (Bloque D)

**Files:**
- Modify: `supabase/functions/princity-alerts/index.ts:100-112`

- [ ] **Step 1: Localizar el insert de incidencia (líneas 100-112)**

```ts
        const { data: incident } = await db
          .from('incidents')
          .insert({
            contract_machine_id: openLine?.id ?? null,
            machine_id:          openLine ? null : machine.numero_serie,
            contract_id:         contract?.id ?? null,   // ← ELIMINAR esta línea
            title:               `Panne détectée par Princity: ${entry['Alert.description']}`,
            ...
          })
```

- [ ] **Step 2: Eliminar la línea `contract_id`**

El insert queda:
```ts
        const { data: incident } = await db
          .from('incidents')
          .insert({
            contract_machine_id: openLine?.id ?? null,
            machine_id:          openLine ? null : machine.numero_serie,
            title:               `Panne détectée par Princity: ${entry['Alert.description']}`,
            description:         String(entry['Alert.description'] ?? ''),
            category:            'panne',
            priority:            'haute',
            status:              'nouveau',
          })
          .select('id')
          .single()
```

- [ ] **Step 3: Commit**

```bash
git add supabase/functions/princity-alerts/index.ts
git commit -m "fix(princity-alerts): eliminar inserción de contract_id legacy en incidencias"
```

---

### Task 11: Build, PR y Deploy Edge Functions

**Files:**
- N/A

- [ ] **Step 1: Verificar build completo**

```bash
cd "/Users/juanmiguel/Claude/Web AMD Codex/web-amd" && npx tsc --noEmit 2>&1
```

Expected: sin errores

- [ ] **Step 2: Abrir PR**

```bash
git push origin fix/fase1-hotfixes-bd-lecturas-core
gh pr create \
  --title "fix: Fase 1 — hotfixes BD + lecturas core post-refactor contratos" \
  --body "$(cat <<'EOF'
## Qué hace
Corrige los 10 hallazgos críticos/altos identificados en la auditoría técnica del refactor contratos N-máquinas (PR #23):

### BD (Bloque A)
- Índice único parcial `machine_counters_one_active_per_month` — elimina riesgo de contadores duplicados concurrentes
- Índice `incidents_contract_machine_id_idx` — rendimiento en listados admin
- Índice `contract_machines_open_active_idx` — acelera `getOpenLineForMachine()`

### Incidencias (Bloque B)
- `csat.ts`: resolver cliente por `contract_machine_id` con fallback legacy — CSAT vuelve a funcionar para incidencias nuevas
- `admin/incidents/page.tsx`: SELECT ampliado con join a `contract_machines`; filtro por cliente cubre ambos modelos
- `admin/incidents/[id]/page.tsx`: contexto por `contract_machine_id` con fallback legacy

### Contadores (Bloque C)
- `admin/contadores/page.tsx`: agrupación reconstruida desde `contract_machines` en lugar del join legacy `contracts.machine_id`
- `admin/contadores/[serie]/page.tsx`: usa `getOpenLineForMachine()` para el contrato activo
- `admin/contadores/[serie]/actions.ts`: captura error `23505` con mensaje claro

### Edge Functions (Bloque D)
- `princity-counters`: filtra `statut='actif'`, respeta `billing_day_override`, captura `23505`
- `princity-alerts`: elimina inserción de `contract_id` legacy

## No incluye
- Cleanup de columnas legacy (Fase 4)
- RPCs atómicas para contratos (Fase 2)
- Mantenimiento granular por máquina (Fase 3)
EOF
)"
```

- [ ] **Step 3: Tras merge — deploy Edge Functions**

```bash
cd "/Users/juanmiguel/Claude/Web AMD Codex/web-amd"
supabase functions deploy princity-counters --project-ref myyejbviunyvywfukysj
supabase functions deploy princity-alerts --project-ref myyejbviunyvywfukysj
```

Expected: `Deployed Functions princity-counters` y `princity-alerts`

---

## Checklist de aceptación

- [ ] Guardar counter duplicado mismo mes → mensaje claro, no error 500
- [ ] Incidencia interna nueva → aparece en listado admin con máquina y cliente correctos
- [ ] Filtro por cliente en admin/incidents → encuentra incidencias nuevas
- [ ] Detalle incidencia nueva → muestra máquina, contrato y cliente
- [ ] Cerrar incidencia nueva con status `résolu` → CSAT se envía al cliente
- [ ] `/admin/contadores` → máquinas de contratos nuevos aparecen bajo su cliente
- [ ] `/admin/contadores/[serie]` → muestra contrato activo correcto para contratos nuevos
- [ ] `princity-counters` → no procesa líneas con `statut != 'actif'`
- [ ] `princity-counters` → respeta `billing_day_override` cuando está definido
- [ ] `princity-alerts` → incidencia creada es visible en admin con contexto completo
