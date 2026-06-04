# Fase 3 — Mantenimiento Granular por Máquina — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Hacer que las visitas de mantenimiento pertenezcan a una máquina concreta (`contract_machine_id`), reparando el flujo roto por el refactor N-máquinas y permitiendo planificación granular por máquina con agrupación por contrato en la UI.

**Architecture:** Se añade `contract_machine_id NOT NULL` a `maintenance_visits` (producción vacía → sin migración de datos). La creación de plan genera una visita por línea activa. El cierre por QR valida contra la máquina de la línea y auto-programa por máquina. Las 5 superficies que leían el join legacy `contracts.machines` pasan a leer vía `contract_machines`.

**Tech Stack:** Next.js 16 App Router, Server Actions, Supabase JS, PostgreSQL, Deno (Edge Function), Supabase MCP (`apply_migration`)

---

## Mapa de archivos

| Archivo | Acción |
|---|---|
| `supabase/migrations/20260604130000_fase3_maintenance_granular.sql` | Crear |
| `src/app/admin/maintenance/new/actions.ts` | N visitas por línea activa |
| `src/app/tech/scan/[serie]/maintenance/[visitId]/actions.ts` | Cierre QR por máquina |
| `src/app/tech/scan/[serie]/page.tsx` | Visita pendiente por máquina |
| `src/app/tech/planning/page.tsx` | Join nuevo + agrupación por contrato |
| `src/app/admin/calendrier/page.tsx` | Join nuevo |
| `supabase/functions/maintenance-cron/index.ts` | Join nuevo |
| `src/app/admin/maintenance/page.tsx` | Conteo de máquinas + estado agregado |
| `src/app/admin/maintenance/[id]/page.tsx` | Listar visitas por máquina |

---

### Task 1: Rama Git

**Files:** N/A

- [ ] **Step 1: Crear rama desde main**

```bash
cd "/Users/juanmiguel/Claude/Web AMD Codex/web-amd"
git checkout main && git pull
git checkout -b fix/fase3-mantenimiento-granular
```
Expected: `git branch --show-current` → `fix/fase3-mantenimiento-granular`

---

### Task 2: Migración SQL — contract_machine_id en visitas

**Files:**
- Create: `supabase/migrations/20260604130000_fase3_maintenance_granular.sql`

- [ ] **Step 1: Confirmar que producción sigue sin visitas**

Usar `mcp__supabase__execute_sql` (project_id `myyejbviunyvywfukysj`):
```sql
SELECT count(*) AS total_visits FROM maintenance_visits;
```
Expected: `total_visits = 0`. Si fuera > 0, DETENERSE y reportar — la columna NOT NULL sin default fallaría; habría que migrar a nullable primero.

- [ ] **Step 2: Crear el archivo de migración**

```sql
-- Fase 3: mantenimiento granular por máquina.
-- Producción tiene 0 visitas (verificado), por lo que contract_machine_id es NOT NULL directamente.

ALTER TABLE maintenance_visits
  ADD COLUMN contract_machine_id uuid NOT NULL REFERENCES contract_machines(id) ON DELETE CASCADE;

CREATE INDEX maintenance_visits_contract_machine_id_idx
  ON maintenance_visits (contract_machine_id);
```

- [ ] **Step 3: Aplicar vía Supabase MCP**

`mcp__supabase__apply_migration` con project_id `myyejbviunyvywfukysj`, name `fase3_maintenance_granular`, query = el SQL de arriba.

- [ ] **Step 4: Verificar la columna y el índice**

```sql
SELECT column_name, is_nullable, data_type
FROM information_schema.columns
WHERE table_name = 'maintenance_visits' AND column_name = 'contract_machine_id';
```
Expected: 1 fila, `is_nullable = NO`.

```sql
SELECT indexname FROM pg_indexes
WHERE tablename = 'maintenance_visits' AND indexname = 'maintenance_visits_contract_machine_id_idx';
```
Expected: 1 fila.

- [ ] **Step 5: Commit**

```bash
cd "/Users/juanmiguel/Claude/Web AMD Codex/web-amd"
git add supabase/migrations/20260604130000_fase3_maintenance_granular.sql
git commit -m "feat(db): contract_machine_id NOT NULL en maintenance_visits"
```

---

### Task 3: Creación de plan — una visita por línea activa

**Files:**
- Modify: `src/app/admin/maintenance/new/actions.ts`

- [ ] **Step 1: Reemplazar el archivo completo**

```ts
'use server'

import { requireAdmin } from '@/lib/auth'
import { MAINTENANCE_FREQUENCIES, parseEnum } from '@/lib/enums'
import { getActiveLinesForContract } from '@/lib/contract-machines'
import { redirect } from 'next/navigation'

type FormState = { error: string } | null

export async function createMaintenancePlanAction(
  _prev: FormState,
  formData: FormData
): Promise<FormState> {
  const { supabase } = await requireAdmin()

  const contract_id = (formData.get('contract_id') as string ?? '').trim()
  const first_visit = (formData.get('first_visit') as string ?? '').trim()
  const notes       = (formData.get('notes')       as string ?? '').trim() || null

  if (!contract_id) return { error: 'Veuillez sélectionner un contrat.' }
  if (!first_visit) return { error: 'La date de la première visite est obligatoire.' }

  const frequency = parseEnum(formData.get('frequency'), MAINTENANCE_FREQUENCIES)
  if (!frequency) return { error: 'Fréquence invalide.' }

  // Cargar las líneas activas ANTES de crear el plan, para no dejarlo huérfano.
  const activeLines = await getActiveLinesForContract(supabase, contract_id)
  if (activeLines.length === 0) {
    return { error: "Ce contrat n'a aucune machine active. Ajoutez une machine avant de créer un plan." }
  }

  const { data: plan, error: planErr } = await supabase
    .from('maintenance_plans')
    .insert({ contract_id, frequency, notes, active: true })
    .select('id')
    .single()

  if (planErr) {
    if (planErr.code === '23505') return { error: 'Ce contrat a déjà un plan de maintenance.' }
    return { error: 'Erreur lors de la création du plan. Veuillez réessayer.' }
  }

  // Una primera visita por cada línea activa, misma fecha inicial.
  const visitsPayload = activeLines.map((line) => ({
    plan_id:             plan.id,
    contract_machine_id: line.id,
    scheduled_date:      first_visit,
    status:              'planifié' as const,
  }))

  const { error: visitErr } = await supabase
    .from('maintenance_visits')
    .insert(visitsPayload)

  if (visitErr) {
    // Rollback: borrar el plan para no dejarlo sin visitas.
    await supabase.from('maintenance_plans').delete().eq('id', plan.id)
    return { error: 'Erreur lors de la planification des visites. Veuillez réessayer.' }
  }

  redirect('/admin/maintenance')
}
```

- [ ] **Step 2: Verificar TypeScript**

```bash
cd "/Users/juanmiguel/Claude/Web AMD Codex/web-amd" && npx tsc --noEmit 2>&1 | grep "maintenance/new" | head -10
```
Expected: sin errores en ese archivo.

- [ ] **Step 3: Commit**

```bash
git add src/app/admin/maintenance/new/actions.ts
git commit -m "feat(maintenance): generar una visita por línea activa al crear plan"
```

---

### Task 4: Cierre por QR — validación y auto-programado por máquina

**Files:**
- Modify: `src/app/tech/scan/[serie]/maintenance/[visitId]/actions.ts`

- [ ] **Step 1: Reemplazar el archivo completo**

Cambios clave: el SELECT carga `contract_machines` (no el join legacy); la validación compara `contract_machines.machine_id === serie`; el auto-programado usa `line.maintenance_frequency_override ?? plan.frequency` y reusa el `contract_machine_id`; la notificación lee de la línea.

```ts
'use server'

import { requireTechnician } from '@/lib/auth'
import { redirect } from 'next/navigation'

type FormState = { error: string } | null

const PART_IDS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]

async function notifyMatrix(message: string): Promise<void> {
  const homeserver = process.env.MATRIX_HOMESERVER_URL
  const token      = process.env.MATRIX_ACCESS_TOKEN
  const roomId     = process.env.MATRIX_MAINTENANCE_ROOM_ID
  if (!homeserver || !token || !roomId) return
  const txnId = Date.now()
  await fetch(
    `${homeserver}/_matrix/client/v3/rooms/${encodeURIComponent(roomId)}/send/m.room.message/${txnId}`,
    {
      method: 'PUT',
      headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ msgtype: 'm.text', body: message }),
    },
  ).catch(err => console.error('[Matrix]', err))
}

export async function closeMaintenance(
  visitId: string,
  serie: string,
  _prev: FormState,
  formData: FormData
): Promise<FormState> {
  const { user, profile, supabase } = await requireTechnician()

  // Cargar visita con su línea de contrato (modelo N máquinas).
  const { data: visit } = await supabase
    .from('maintenance_visits')
    .select(`
      id, status, scheduled_date, plan_id, contract_machine_id,
      maintenance_plans ( frequency, notes ),
      contract_machines (
        machine_id,
        maintenance_frequency_override,
        machines ( numero_serie, marque, modele ),
        contracts ( numero_contrat, clients ( nom_client ) )
      )
    `)
    .eq('id', visitId)
    .single()

  if (!visit) return { error: 'Visite introuvable.' }

  // Verificar que la visita pertenece a la máquina escaneada.
  const line = visit.contract_machines as unknown as {
    machine_id: string
    maintenance_frequency_override: 'mensuel' | 'trimestriel' | null
    machines: { numero_serie: string; marque: string; modele: string } | null
    contracts: { numero_contrat: string; clients: { nom_client: string } | null } | null
  } | null

  if (line?.machine_id !== serie) return { error: 'Visite introuvable.' }
  if (visit.status === 'fait') return { error: 'Cette visite est déjà clôturée.' }

  const notes = ((formData.get('notes') as string) ?? '').trim() || null

  const { error: visitErr } = await supabase
    .from('maintenance_visits')
    .update({
      status:       'fait',
      done_at:      new Date().toISOString(),
      done_by:      user.id,
      qr_verified:  true,
      notes,
    })
    .eq('id', visitId)

  if (visitErr) return { error: 'Erreur lors de la clôture de la visite.' }

  // Piezas reemplazadas.
  const partsToInsert = PART_IDS
    .filter(id => formData.get(`part_${id}`) === 'on')
    .map(id => ({ visit_id: visitId, part_id: id, quantity: 1 }))

  const autresPieces = ((formData.get('autres_pieces') as string) ?? '').trim()
  if (autresPieces) {
    await supabase.from('maintenance_parts').insert({
      visit_id: visitId, description: autresPieces, quantity: 1,
    })
  }
  if (partsToInsert.length > 0) {
    await supabase.from('maintenance_parts').insert(partsToInsert)
  }

  // Auto-programar siguiente visita para LA MISMA máquina.
  // Frecuencia: override de la línea, si no la del plan.
  const plan = visit.maintenance_plans as unknown as { frequency: string; notes: string | null } | null
  const effectiveFreq = line?.maintenance_frequency_override ?? plan?.frequency
  const days = effectiveFreq === 'mensuel' ? 30 : 90
  const base = new Date(visit.scheduled_date + 'T00:00:00')
  base.setDate(base.getDate() + days)
  const nextDateStr = base.toISOString().split('T')[0]

  await supabase.from('maintenance_visits').insert({
    plan_id:             visit.plan_id,
    contract_machine_id: visit.contract_machine_id,
    scheduled_date:      nextDateStr,
    status:              'planifié',
  })

  // Notificación Matrix de cierre.
  const machine = line?.machines
  const client  = line?.contracts?.clients
  const nextFmt = new Date(nextDateStr + 'T00:00:00').toLocaleDateString('fr-FR')

  await notifyMatrix([
    '✅ MAINTENANCE EFFECTUÉE',
    `Client     : ${client?.nom_client ?? '—'}`,
    `Machine    : ${machine?.marque ?? ''} ${machine?.modele ?? ''} (${machine?.numero_serie ?? serie})`,
    `Technicien : ${profile.full_name ?? user.email}`,
    `Prochaine  : ${nextFmt}`,
    partsToInsert.length > 0 ? `Pièces     : ${partsToInsert.length} remplacée(s)` : '',
  ].filter(Boolean).join('\n'))

  redirect(`/tech/scan/${encodeURIComponent(serie)}`)
}
```

- [ ] **Step 2: Verificar TypeScript**

```bash
cd "/Users/juanmiguel/Claude/Web AMD Codex/web-amd" && npx tsc --noEmit 2>&1 | grep "maintenance/\[visitId\]" | head -10
```
Expected: sin errores en ese archivo.

- [ ] **Step 3: Commit**

```bash
git add "src/app/tech/scan/[serie]/maintenance/[visitId]/actions.ts"
git commit -m "fix(maintenance): cierre QR valida por contract_machine_id y auto-programa por máquina"
```

---

### Task 5: Ficha de máquina — visita pendiente de esa máquina

**Files:**
- Modify: `src/app/tech/scan/[serie]/page.tsx`

- [ ] **Step 1: Filtrar la visita pendiente por contract_machine_id**

Localizar el bloque (líneas ~102-121):
```ts
  if (contract) {
    const { data: plan } = await supabase
      .from('maintenance_plans')
      .select('id')
      .eq('contract_id', contract.id)
      .eq('active', true)
      .maybeSingle()

    if (plan) {
      const { data: visit } = await supabase
        .from('maintenance_visits')
        .select('id, scheduled_date, status')
        .eq('plan_id', plan.id)
        .in('status', ['planifié', 'en_retard'])
        .order('scheduled_date')
        .limit(1)
        .maybeSingle()
      pendingVisit = visit ?? null
    }
  }
```

Reemplazar por (cambio: condición `contract && openLine` + filtro `contract_machine_id`):
```ts
  if (contract && openLine) {
    const { data: plan } = await supabase
      .from('maintenance_plans')
      .select('id')
      .eq('contract_id', contract.id)
      .eq('active', true)
      .maybeSingle()

    if (plan) {
      const { data: visit } = await supabase
        .from('maintenance_visits')
        .select('id, scheduled_date, status')
        .eq('plan_id', plan.id)
        .eq('contract_machine_id', openLine.id)
        .in('status', ['planifié', 'en_retard'])
        .order('scheduled_date')
        .limit(1)
        .maybeSingle()
      pendingVisit = visit ?? null
    }
  }
```

- [ ] **Step 2: Verificar TypeScript**

```bash
cd "/Users/juanmiguel/Claude/Web AMD Codex/web-amd" && npx tsc --noEmit 2>&1 | grep "scan/\[serie\]/page" | head -10
```
Expected: sin errores.

- [ ] **Step 3: Commit**

```bash
git add "src/app/tech/scan/[serie]/page.tsx"
git commit -m "fix(tech): mostrar la visite pendiente de la máquina escaneada"
```

---

### Task 6: Planning técnico — join nuevo + agrupación por contrato

**Files:**
- Modify: `src/app/tech/planning/page.tsx`

- [ ] **Step 1: Reemplazar el SELECT de visitas (líneas ~40-54)**

Reemplazar el primer elemento del `Promise.all` (la query de `maintenance_visits`) por:
```ts
    supabase
      .from('maintenance_visits')
      .select(`
        id, scheduled_date, status,
        contract_machines (
          machines ( numero_serie, marque, modele ),
          contracts ( lieu_installation, clients ( nom_client ) )
        )
      `)
      .in('status', ['planifié', 'en_retard'])
      .order('scheduled_date')
      .limit(30),
```

- [ ] **Step 2: Añadir helper de agrupación por contrato tras el cálculo de `visits`**

Localizar las líneas:
```ts
  const overdueVisits  = visits.filter(v => v.status === 'en_retard')
  const plannedVisits  = visits.filter(v => v.status === 'planifié')
```

Reemplazarlas por (extrae datos de la línea y agrupa por cliente+lieu):
```ts
  type VisitRow = {
    id: string; scheduled_date: string; status: string
    serie: string | null
    marque: string | null
    modele: string | null
    client: string
    lieu: string | null
  }

  function toRow(v: (typeof visits)[number]): VisitRow {
    const line = v.contract_machines as unknown as {
      machines: { numero_serie: string; marque: string; modele: string } | null
      contracts: { lieu_installation: string | null; clients: { nom_client: string } | null } | null
    } | null
    return {
      id: v.id,
      scheduled_date: v.scheduled_date,
      status: v.status,
      serie:  line?.machines?.numero_serie ?? null,
      marque: line?.machines?.marque ?? null,
      modele: line?.machines?.modele ?? null,
      client: line?.contracts?.clients?.nom_client ?? '—',
      lieu:   line?.contracts?.lieu_installation ?? null,
    }
  }

  // Agrupa filas por cliente+lieu. Cada grupo = una sede/contrato visible.
  type VisitGroup = { key: string; client: string; lieu: string | null; rows: VisitRow[] }
  function groupByContract(rows: VisitRow[]): VisitGroup[] {
    const map = new Map<string, VisitGroup>()
    for (const r of rows) {
      const key = `${r.client}|${r.lieu ?? ''}`
      if (!map.has(key)) map.set(key, { key, client: r.client, lieu: r.lieu, rows: [] })
      map.get(key)!.rows.push(r)
    }
    return [...map.values()]
  }

  const overdueGroups = groupByContract(visits.filter(v => v.status === 'en_retard').map(toRow))
  const plannedGroups = groupByContract(visits.filter(v => v.status === 'planifié').map(toRow))
  const overdueCount  = overdueGroups.reduce((n, g) => n + g.rows.length, 0)
  const plannedCount  = plannedGroups.reduce((n, g) => n + g.rows.length, 0)
```

- [ ] **Step 3: Reemplazar la sección "EN RETARD" (el bloque `{overdueVisits.length > 0 && (...)}`)**

```tsx
      {/* ── MAINTENANCES EN RETARD ── */}
      {overdueCount > 0 && (
        <section className="space-y-2">
          <div className="flex items-center gap-2">
            <AlertTriangle size={14} className="text-accent" />
            <p className="text-sm font-semibold text-accent">En retard ({overdueCount})</p>
          </div>
          {overdueGroups.map(group => (
            <div key={group.key} className="bg-card rounded-[var(--radius-card)] border-2 border-accent/30 p-4 space-y-2">
              <div className="min-w-0">
                <p className="text-sm font-semibold text-ink truncate">{group.client}</p>
                {group.lieu && <p className="text-xs text-ink-muted truncate">{group.lieu}</p>}
              </div>
              <div className="space-y-1.5">
                {group.rows.map(r => {
                  const { label } = fmtDate(r.scheduled_date)
                  return (
                    <Link
                      key={r.id}
                      href={r.serie ? `/tech/scan/${encodeURIComponent(r.serie)}` : '/tech'}
                      className="flex items-center justify-between gap-3 rounded-lg bg-accent-soft/50 px-3 py-2"
                    >
                      <span className="text-xs text-ink-soft truncate flex items-center gap-1.5">
                        <Wrench size={12} className="text-accent shrink-0" />
                        {r.marque} {r.modele}
                      </span>
                      <span className="shrink-0 text-xs font-semibold text-accent whitespace-nowrap">{label}</span>
                    </Link>
                  )
                })}
              </div>
            </div>
          ))}
        </section>
      )}
```

- [ ] **Step 4: Reemplazar la sección "PLANIFIÉES" (el bloque `<section>` de planifiées con su `{plannedVisits.length === 0 ...}`)**

```tsx
      {/* ── MAINTENANCES PLANIFIÉES ── */}
      <section className="space-y-2">
        <div className="flex items-center gap-2">
          <Wrench size={14} className="text-ink-muted" />
          <p className="text-sm font-semibold text-ink-soft">
            Maintenance — 14 prochains jours
            {plannedCount > 0 && (
              <span className="ml-2 text-xs font-normal text-ink-muted">({plannedCount})</span>
            )}
          </p>
        </div>

        {plannedCount === 0 ? (
          <div className="bg-card rounded-[var(--radius-card)] border border-line p-6 text-center">
            <p className="text-sm text-ink-muted">Aucune visite planifiée dans 14 jours</p>
          </div>
        ) : (
          plannedGroups.map(group => (
            <div key={group.key} className="bg-card rounded-[var(--radius-card)] border border-line p-4 space-y-2">
              <div className="min-w-0">
                <p className="text-sm font-semibold text-ink truncate">{group.client}</p>
                {group.lieu && <p className="text-xs text-ink-muted truncate">{group.lieu}</p>}
              </div>
              <div className="space-y-1.5">
                {group.rows.map(r => {
                  const { label, isOverdue } = fmtDate(r.scheduled_date)
                  return (
                    <Link
                      key={r.id}
                      href={r.serie ? `/tech/scan/${encodeURIComponent(r.serie)}` : '/tech'}
                      className="flex items-center justify-between gap-3 rounded-lg bg-info-soft/40 px-3 py-2"
                    >
                      <span className="text-xs text-ink-soft truncate flex items-center gap-1.5">
                        <Wrench size={12} className="text-info shrink-0" />
                        {r.marque} {r.modele}
                      </span>
                      <span className={`shrink-0 text-xs font-semibold whitespace-nowrap ${isOverdue ? 'text-accent' : 'text-info'}`}>
                        {label}
                      </span>
                    </Link>
                  )
                })}
              </div>
            </div>
          ))
        )}
      </section>
```

- [ ] **Step 5: Verificar TypeScript**

```bash
cd "/Users/juanmiguel/Claude/Web AMD Codex/web-amd" && npx tsc --noEmit 2>&1 | grep "planning" | head -10
```
Expected: sin errores.

- [ ] **Step 6: Commit**

```bash
git add src/app/tech/planning/page.tsx
git commit -m "fix(tech): planning lee máquina vía contract_machines y agrupa por contrato"
```

---

### Task 7: Calendrier admin — join nuevo

**Files:**
- Modify: `src/app/admin/calendrier/page.tsx`

- [ ] **Step 1: Reemplazar el SELECT de visitas (líneas ~24-38)**

Reemplazar el primer elemento del `Promise.all` (query de `maintenance_visits`) por:
```ts
    supabase
      .from('maintenance_visits')
      .select(`
        id, scheduled_date, status,
        maintenance_plans ( id ),
        contract_machines (
          machines ( marque, modele ),
          contracts ( clients ( nom_client ) )
        )
      `)
      .gte('scheduled_date', from)
      .lte('scheduled_date', to)
      .order('scheduled_date'),
```

- [ ] **Step 2: Reemplazar el mapeo de eventos de visita (líneas ~49-65)**

```ts
  for (const v of visits ?? []) {
    const plan     = v.maintenance_plans as unknown as { id: string } | null
    const line     = v.contract_machines as unknown as {
      machines: { marque: string; modele: string } | null
      contracts: { clients: { nom_client: string } | null } | null
    } | null
    const client   = line?.contracts?.clients?.nom_client ?? '—'
    const machine  = `${line?.machines?.marque ?? ''} ${line?.machines?.modele ?? ''}`.trim()
    const cfg      = VISIT_COLOR[v.status] ?? VISIT_COLOR.planifié

    events.push({
      id:        `visit-${v.id}`,
      title:     `${client} — ${machine}`,
      start:     v.scheduled_date,
      allDay:    true,
      color:     cfg.color,
      textColor: '#ffffff',
      href:      plan?.id ? `/admin/maintenance/${plan.id}` : '/admin/maintenance',
    })
  }
```

- [ ] **Step 3: Verificar TypeScript**

```bash
cd "/Users/juanmiguel/Claude/Web AMD Codex/web-amd" && npx tsc --noEmit 2>&1 | grep "calendrier" | head -10
```
Expected: sin errores.

- [ ] **Step 4: Commit**

```bash
git add src/app/admin/calendrier/page.tsx
git commit -m "fix(admin): calendrier lee máquina vía contract_machines"
```

---

### Task 8: maintenance-cron — join nuevo

**Files:**
- Modify: `supabase/functions/maintenance-cron/index.ts`

- [ ] **Step 1: Reemplazar el SELECT de visitas (líneas ~54-71)**

Reemplazar el bloque `const { data: visits, error: fetchErr } = await db.from('maintenance_visits').select(...)...` manteniendo los filtros, con este SELECT:
```ts
  const { data: visits, error: fetchErr } = await db
    .from('maintenance_visits')
    .select(`
      id, scheduled_date, status,
      maintenance_plans ( frequency, notes ),
      contract_machines (
        machines ( numero_serie, marque, modele ),
        contracts ( numero_contrat, clients ( nom_client ) )
      )
    `)
    .gte('scheduled_date', todayStr)
    .lte('scheduled_date', alertLimitStr)
    .eq('matrix_notified', false)
    .in('status', ['planifié', 'en_retard'])
```

- [ ] **Step 2: Reemplazar la extracción de datos en el loop (líneas ~79-82)**

Localizar dentro del `for (const visit of visits ?? [])`:
```ts
      const plan     = visit.maintenance_plans as any
      const contract = plan?.contracts as any
      const client   = contract?.clients as any
      const machine  = contract?.machines as any
```
Reemplazar por:
```ts
      const plan     = visit.maintenance_plans as any
      const line     = visit.contract_machines as any
      const contract = line?.contracts as any
      const client   = contract?.clients as any
      const machine  = line?.machines as any
```

El resto del loop (que usa `plan?.frequency`, `plan?.notes`, `client?.nom_client`, `machine?.marque/modele/numero_serie`, `contract?.numero_contrat`) sigue funcionando con estas variables.

- [ ] **Step 3: Commit**

```bash
git add supabase/functions/maintenance-cron/index.ts
git commit -m "fix(maintenance-cron): leer máquina vía contract_machines en notificaciones"
```

---

### Task 9: Lista de planes — conteo de máquinas + estado agregado

**Files:**
- Modify: `src/app/admin/maintenance/page.tsx`

- [ ] **Step 1: Reemplazar el SELECT principal (líneas ~76-90)**

Reemplazar la `plansQuery` con (quita `contracts.machines` legacy, añade `contract_machine_id` a visitas):
```ts
  let plansQuery = supabase
    .from('maintenance_plans')
    .select(`
      id, frequency, active, notes,
      contracts (
        id, numero_contrat,
        clients ( nom_client )
      ),
      maintenance_visits (
        id, scheduled_date, status, done_at, contract_machine_id
      )
    `)
    .order('created_at', { ascending: false })
    .limit(RESULT_LIMIT)
```

- [ ] **Step 2: Reemplazar el mapeo `allRows` (líneas ~104-120)**

```ts
  const allRows = (plans ?? []).map((p) => {
    const contract = p.contracts as unknown as {
      id: string; numero_contrat: string
      clients: { nom_client: string }
    }
    const visits = (p.maintenance_visits ?? []) as {
      id: string; scheduled_date: string; status: string; done_at: string | null; contract_machine_id: string
    }[]
    const machineCount = new Set(visits.map((v) => v.contract_machine_id)).size
    const nextVisit = visits
      .filter((v) => v.status !== 'fait')
      .sort((a, b) => a.scheduled_date.localeCompare(b.scheduled_date))[0] ?? null
    const lastDone = visits
      .filter((v) => v.status === 'fait')
      .sort((a, b) => b.scheduled_date.localeCompare(a.scheduled_date))[0] ?? null
    // Estado agregado: en_retard si alguna visita pendiente está atrasada.
    const anyOverdue = visits.some((v) => v.status === 'en_retard')
    return { plan: p, contract, visits, nextVisit, lastDone, machineCount, anyOverdue }
  })
```

- [ ] **Step 3: Ajustar el filtro de status y los KPIs (líneas ~122-137)**

Reemplazar el bloque `const rows = statusFilter ? ... : allRows` y los cálculos de `overdue`/`dueThisWeek`:
```ts
  const rows = statusFilter
    ? allRows.filter((r) => {
        if (statusFilter === 'fait') return r.lastDone !== null
        if (statusFilter === 'en_retard') return r.anyOverdue
        return r.nextVisit?.status === statusFilter && !r.anyOverdue
      })
    : allRows

  const totalPlans  = rows.length
  const overdue     = rows.filter((r) => r.anyOverdue).length
  const dueThisWeek = rows.filter((r) => {
    if (!r.nextVisit || r.nextVisit.status !== 'planifié') return false
    const diff = (new Date(r.nextVisit.scheduled_date).getTime() - Date.now()) / 86400000
    return diff >= 0 && diff <= 7
  }).length
```

- [ ] **Step 4: Actualizar la columna de tabla "Client / Machine" y la fila**

En el `<thead>`, reemplazar `<th className={TH}>Client / Machine</th>` por `<th className={TH}>Client</th>` y `<th className={TH}>Machines</th>` (dos columnas: cliente y conteo). Es decir, dejar el thead así (las demás cabeceras se mantienen):
```tsx
              <tr className="bg-neutral-soft border-b border-line-subtle">
                <th className={TH}>Client</th>
                <th className={TH}>Machines</th>
                <th className={TH}>Contrat</th>
                <th className={TH}>Fréquence</th>
                <th className={TH}>Prochaine visite</th>
                <th className={TH}>Dernière faite</th>
                <th className={TH}>Statut</th>
                <th className="px-5 py-2.5" />
              </tr>
```

En el `.map(({ plan, contract, nextVisit, lastDone }) => ...)`, cambiar la desestructuración a incluir `machineCount` y `anyOverdue`, y reemplazar la celda "Client / Machine" por dos celdas:
```tsx
              {rows.map(({ plan, contract, nextVisit, lastDone, machineCount, anyOverdue }) => {
                const href = `/admin/maintenance/${plan.id}`
                const statusKey = anyOverdue ? 'en_retard' : (nextVisit?.status ?? (lastDone ? 'fait' : 'planifié'))
                const status = STATUS[statusKey as keyof typeof STATUS] ?? STATUS.planifié
                return (
                  <tr key={plan.id} className="hover:bg-neutral-soft transition-colors">
                    <td className="px-5 py-3.5">
                      <Link href={href} className="font-medium text-ink hover:text-accent transition-colors">
                        {contract.clients.nom_client}
                      </Link>
                    </td>
                    <td className="px-5 py-3.5 text-ink-soft">
                      {machineCount} machine{machineCount !== 1 ? 's' : ''}
                    </td>
                    <td className="px-5 py-3.5 font-mono text-xs">
                      <Link href={href} className="text-ink-soft hover:text-accent transition-colors">
                        {contract.numero_contrat}
                      </Link>
                    </td>
                    <td className="px-5 py-3.5 text-ink-soft">
                      {FREQ_LABEL[plan.frequency]}
                    </td>
                    <td className="px-5 py-3.5">
                      {nextVisit ? (
                        <span className={anyOverdue ? 'text-accent font-semibold' : 'text-ink-soft'}>
                          {new Date(nextVisit.scheduled_date).toLocaleDateString('fr-FR')}
                        </span>
                      ) : (
                        <span className="text-line">—</span>
                      )}
                    </td>
                    <td className="px-5 py-3.5 text-ink-muted">
                      {lastDone
                        ? new Date(lastDone.scheduled_date).toLocaleDateString('fr-FR')
                        : <span className="text-line">—</span>
                      }
                    </td>
                    <td className="px-5 py-3.5">
                      <Badge variant={status.variant}>{status.label}</Badge>
                    </td>
                    <td className="px-5 py-3.5 text-right">
                      <Link href={href} className="text-xs font-medium text-ink-soft hover:text-ink">
                        Détail →
                      </Link>
                    </td>
                  </tr>
                )
              })}
```

- [ ] **Step 5: Verificar TypeScript**

```bash
cd "/Users/juanmiguel/Claude/Web AMD Codex/web-amd" && npx tsc --noEmit 2>&1 | grep "maintenance/page" | head -10
```
Expected: sin errores.

- [ ] **Step 6: Commit**

```bash
git add src/app/admin/maintenance/page.tsx
git commit -m "feat(maintenance): lista muestra conteo de máquinas y estado agregado por plan"
```

---

### Task 10: Detalle de plan — listar visitas por máquina

**Files:**
- Modify: `src/app/admin/maintenance/[id]/page.tsx`

- [ ] **Step 1: Reemplazar el SELECT (líneas ~35-50)**

```ts
  const { data: plan } = await supabase
    .from('maintenance_plans')
    .select(`
      id, frequency, active, notes, created_at,
      contracts (
        id, numero_contrat,
        clients ( nom_client )
      ),
      maintenance_visits (
        id, scheduled_date, done_at, status, qr_verified, notes, matrix_notified,
        contract_machine_id,
        profiles ( full_name ),
        contract_machines ( machines ( numero_serie, marque, modele ) )
      )
    `)
    .eq('id', id)
    .single()
```

- [ ] **Step 2: Reemplazar el tipado de `contract` y `visits` (líneas ~54-67)**

```ts
  const contract = plan.contracts as unknown as {
    id: string; numero_contrat: string
    clients: { nom_client: string }
  }

  type Visit = {
    id: string; scheduled_date: string; done_at: string | null
    status: string; qr_verified: boolean; notes: string | null
    matrix_notified: boolean
    contract_machine_id: string
    profiles: { full_name: string }[] | null
    contract_machines: { machines: { numero_serie: string; marque: string; modele: string } | null } | null
  }
  const visits = ((plan.maintenance_visits ?? []) as unknown as Visit[])
    .sort((a, b) => b.scheduled_date.localeCompare(a.scheduled_date))
```

- [ ] **Step 3: Quitar la máquina del header del plan (líneas ~84-86)**

Localizar:
```tsx
          <p className="text-xs text-ink-muted">
            {contract.machines.marque} {contract.machines.modele} · {contract.numero_contrat}
          </p>
```
Reemplazar por (el plan ya no es de una sola máquina):
```tsx
          <p className="text-xs text-ink-muted">
            {contract.numero_contrat} · {visits.length} visite{visits.length !== 1 ? 's' : ''}
          </p>
```

- [ ] **Step 4: Añadir columna "Machine" a la tabla de visitas**

En el `<thead>` de la tabla de visitas, añadir una cabecera "Machine" como primera columna:
```tsx
            <tr className="bg-neutral-soft border-b border-line-subtle">
              <th className="text-left px-4 py-2.5 text-[10px] font-semibold text-ink-muted uppercase tracking-[0.06em]">Machine</th>
              <th className="text-left px-4 py-2.5 text-[10px] font-semibold text-ink-muted uppercase tracking-[0.06em]">Date planifiée</th>
              <th className="text-left px-4 py-2.5 text-[10px] font-semibold text-ink-muted uppercase tracking-[0.06em]">Statut</th>
              <th className="text-left px-4 py-2.5 text-[10px] font-semibold text-ink-muted uppercase tracking-[0.06em]">Réalisée le</th>
              <th className="text-left px-4 py-2.5 text-[10px] font-semibold text-ink-muted uppercase tracking-[0.06em]">Technicien</th>
              <th className="text-left px-4 py-2.5 text-[10px] font-semibold text-ink-muted uppercase tracking-[0.06em]">QR</th>
              <th className="text-left px-4 py-2.5 text-[10px] font-semibold text-ink-muted uppercase tracking-[0.06em]">Notes</th>
            </tr>
```

Actualizar el `colSpan` del empty-state de 6 a 7:
```tsx
                <td colSpan={7} className="px-4 py-10 text-center text-ink-muted text-sm">
                  Aucune visite planifiée
                </td>
```

En el `.map(v => ...)`, añadir como primera celda de cada fila la máquina:
```tsx
                <tr key={v.id} className="hover:bg-neutral-soft transition-colors">
                  <td className="px-4 py-3.5 font-mono text-xs text-ink-soft">
                    {v.contract_machines?.machines
                      ? `${v.contract_machines.machines.marque} ${v.contract_machines.machines.modele}`
                      : '—'}
                  </td>
                  <td className="px-4 py-3.5 font-medium text-ink">
                    {new Date(v.scheduled_date).toLocaleDateString('fr-FR')}
                  </td>
```
(el resto de celdas de la fila se mantienen igual)

- [ ] **Step 5: Verificar TypeScript**

```bash
cd "/Users/juanmiguel/Claude/Web AMD Codex/web-amd" && npx tsc --noEmit 2>&1 | grep "maintenance/\[id\]" | head -10
```
Expected: sin errores.

- [ ] **Step 6: Commit**

```bash
git add "src/app/admin/maintenance/[id]/page.tsx"
git commit -m "feat(maintenance): detalle del plan lista visitas por máquina"
```

---

### Task 11: Build completo, PR y deploy Edge Function

**Files:** N/A

- [ ] **Step 1: Verificar build completo**

```bash
cd "/Users/juanmiguel/Claude/Web AMD Codex/web-amd" && npx tsc --noEmit 2>&1 | head -30 && echo "EXIT: $?"
```
Expected: 0 errores.

- [ ] **Step 2: Push y abrir PR**

```bash
cd "/Users/juanmiguel/Claude/Web AMD Codex/web-amd"
git push origin fix/fase3-mantenimiento-granular
gh pr create \
  --title "feat: Fase 3 — mantenimiento granular por máquina" \
  --body "$(cat <<'EOF'
## Qué hace
Hace que las visitas de mantenimiento pertenezcan a una máquina concreta (contract_machine_id), reparando el flujo que el refactor N-máquinas dejó roto.

### BD
- maintenance_visits.contract_machine_id NOT NULL + índice (producción vacía, sin migración de datos)

### Reparación + mejora
- **Crear plan**: genera una visita por línea activa del contrato (no una sola)
- **Cierre QR**: valida la visita contra la máquina escaneada vía contract_machine_id (reparaba el bug que hacía fallar todo cierre en contratos nuevos); auto-programa por máquina con frecuencia override de la línea o del plan
- **Ficha de máquina escaneada**: muestra la visita pendiente de ESA máquina, no la primera del plan
- **5 superficies que leían el join legacy contracts.machines** (devolvía null en contratos nuevos) ahora leen vía contract_machines: cierre QR, ficha scan, planning técnico, calendrier admin, cron de notificaciones
- **Lista de planes**: conteo de máquinas + estado agregado
- **Detalle de plan**: visitas listadas por máquina
- **Planning técnico**: visitas agrupadas por contrato/sede

## No incluye
- Cleanup de columnas legacy (Fase 4)
EOF
)"
```

- [ ] **Step 3: Tras merge — deploy de la Edge Function**

```bash
cd "/Users/juanmiguel/Claude/Web AMD Codex/web-amd"
npx supabase functions deploy maintenance-cron --project-ref myyejbviunyvywfukysj
```
Expected: `Deployed Functions maintenance-cron`.

---

## Checklist de aceptación

- [ ] Crear plan para contrato de N máquinas → se generan N visitas (una por línea activa)
- [ ] Crear plan para contrato sin máquinas activas → error claro, sin plan huérfano
- [ ] Cerrar visita escaneando el QR de SU máquina → cierra OK
- [ ] Cerrar visita de máquina A con QR de máquina B → "Visite introuvable"
- [ ] Al cerrar, siguiente visita programada para la misma máquina con la frecuencia correcta
- [ ] Máquina con override 'mensuel' en contrato trimestral → siguiente visita a 30 días
- [ ] Notificación Matrix del cron muestra la máquina correcta
- [ ] Escanear QR muestra la visita pendiente de esa máquina, no de otra del contrato
- [ ] /tech/planning muestra visitas con máquina correcta, agrupadas por contrato
- [ ] /admin/calendrier muestra visitas con máquina correcta
- [ ] /admin/maintenance muestra conteo de máquinas y estado agregado
- [ ] /admin/maintenance/[id] lista visitas por máquina
- [ ] Build TypeScript limpio
```
