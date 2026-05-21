# Dashboard Atelier — Plan de Implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Construir un dashboard de taller en modo kiosko (`/atelier`) para una TV de 32", con una cuenta especial con permisos de despacho que puede asignar incidencias y mantenimientos a los técnicos.

**Architecture:** Nueva ruta `/atelier` protegida, con Server Component que lee todos los datos vía `createAdminClient()` y componentes cliente (Kanban con drag & drop, mini-tablero de mantenimientos, panel de asignación). Un flag `profiles.is_dispatcher` distingue la cuenta Atelier; las Server Actions de despacho validan admin-o-dispatcher. Auto-refresco por `router.refresh()` cada 30 s.

**Tech Stack:** Next.js 16 · TypeScript · Tailwind CSS v4 · Supabase · @dnd-kit.

---

## Archivos

### Nuevos (11)
| Archivo | Responsabilidad |
|---|---|
| `supabase/migrations/20260521120000_atelier_dispatcher.sql` | columnas `is_dispatcher` y `assigned_to` |
| `src/components/atelier/types.ts` | tipos compartidos del dashboard |
| `src/app/atelier/actions.ts` | Server Actions de asignación |
| `src/components/atelier/AssignPanel.tsx` | panel lateral de asignación |
| `src/components/atelier/AtelierKanban.tsx` | Kanban oscuro con drag & drop |
| `src/components/atelier/AtelierMaintenanceWeek.tsx` | mini-tablero lun–vie |
| `src/components/atelier/AtelierHeader.tsx` | cabecera + reloj |
| `src/components/atelier/AtelierKpis.tsx` | 4 tarjetas KPI |
| `src/components/atelier/AutoRefresh.tsx` | auto-refresco kiosko |
| `src/app/atelier/layout.tsx` | layout kiosko |
| `src/app/atelier/page.tsx` | Server Component: guard + datos + KPIs |

### Modificados (5)
| Archivo | Cambio |
|---|---|
| `src/lib/auth.ts` | helper `requireDispatcher()` |
| `src/middleware.ts` | `/atelier` a `PROTECTED_ROUTES` |
| `src/app/dashboard/page.tsx` | redirect a `/atelier` si `is_dispatcher` |
| `src/app/admin/incidents/kanban-actions.ts` | guard ampliado + escritura vía admin client |
| `src/components/admin/KanbanBoard.tsx` | nombre del técnico en las tarjetas |
| `src/app/admin/incidents/page.tsx` | pasa `technicianName` al Kanban |

---

## Task 0: Verificar rama

- [ ] **Confirmar rama:**

```bash
cd "/Users/juanmiguel/Claude/Web AMD Codex/web-amd" && git branch --show-current
```

Esperado: `feat/dashboard-atelier`

---

## Task 1: Migración SQL

**Files:**
- Create: `supabase/migrations/20260521120000_atelier_dispatcher.sql`

- [ ] **Step 1: Crear el archivo de migración**

```sql
-- Dashboard Atelier: flag de dispatcher en profiles + técnico planificado en visitas de mantenimiento.

ALTER TABLE public.profiles
  ADD COLUMN is_dispatcher boolean NOT NULL DEFAULT false;

ALTER TABLE public.maintenance_visits
  ADD COLUMN assigned_to uuid REFERENCES public.profiles(id);
```

- [ ] **Step 2: Aplicar la migración en Supabase**

Aplicar vía el MCP de Supabase: herramienta `mcp__supabase__apply_migration`, con `project_id: "myyejbviunyvywfukysj"`, `name: "atelier_dispatcher"` y el SQL del Step 1.

Verificar después con `mcp__supabase__execute_sql` (project_id `myyejbviunyvywfukysj`):
```sql
SELECT column_name FROM information_schema.columns
WHERE (table_name='profiles' AND column_name='is_dispatcher')
   OR (table_name='maintenance_visits' AND column_name='assigned_to');
```
Esperado: 2 filas.

- [ ] **Step 3: Tipos generados (condicional)**

Comprobar si existe un archivo de tipos generados de Supabase:
```bash
cd "/Users/juanmiguel/Claude/Web AMD Codex/web-amd" && ls src/lib/supabase/ && grep -rl "export type Database" src/ 2>/dev/null
```
Si existe un archivo `Database` de tipos generados, regenerarlo con `mcp__supabase__generate_typescript_types` y guardarlo en su ruta. Si no existe ninguno (el proyecto usa el cliente sin tipar), omitir este paso.

- [ ] **Step 4: Verificar TypeScript**

```bash
npx tsc --noEmit
```
Esperado: 0 errores.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/20260521120000_atelier_dispatcher.sql
git commit -m "feat(atelier): migración — is_dispatcher y maintenance_visits.assigned_to"
```

---

## Task 2: Routing y acceso

**Files:**
- Modify: `src/lib/auth.ts`
- Modify: `src/middleware.ts`
- Modify: `src/app/dashboard/page.tsx`

- [ ] **Step 1: Añadir `requireDispatcher()` a `src/lib/auth.ts`**

Añadir al final del archivo (tras la función `requireTechnician`):

```ts

export type DispatcherContext = {
  user: User
  profile: { role: Role; full_name: string | null; isDispatcher: boolean }
  supabase: Awaited<ReturnType<typeof createClient>>
}

export async function requireDispatcher(): Promise<DispatcherContext> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('profiles')
    .select('role, full_name, is_dispatcher')
    .eq('id', user.id)
    .single()

  if (!profile) redirect('/login')

  const isDispatcher = profile.is_dispatcher === true
  if (profile.role !== 'admin' && !isDispatcher) redirect('/dashboard')

  return {
    user,
    profile: { role: profile.role as Role, full_name: profile.full_name, isDispatcher },
    supabase,
  }
}
```

- [ ] **Step 2: Añadir `/atelier` a las rutas protegidas en `src/middleware.ts`**

Reemplazar:
```ts
const PROTECTED_ROUTES = ['/admin', '/portal', '/tech']
```
Por:
```ts
const PROTECTED_ROUTES = ['/admin', '/portal', '/tech', '/atelier']
```

- [ ] **Step 3: Reescribir `src/app/dashboard/page.tsx`**

```tsx
import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'

export default async function Dashboard() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('profiles')
    .select('role, is_dispatcher')
    .eq('id', user.id)
    .single()

  if (profile?.is_dispatcher) redirect('/atelier')
  if (profile?.role === 'admin') redirect('/admin')
  if (profile?.role === 'technician') redirect('/tech')
  if (profile?.role === 'client') redirect('/portal')

  redirect('/login')
}
```

- [ ] **Step 4: Verificar TypeScript**

```bash
npx tsc --noEmit
```
Esperado: 0 errores.

- [ ] **Step 5: Commit**

```bash
git add src/lib/auth.ts src/middleware.ts src/app/dashboard/page.tsx
git commit -m "feat(atelier): routing — requireDispatcher, ruta protegida y redirect"
```

---

## Task 3: Nombre del técnico en el Kanban compartido

**Files:**
- Modify: `src/components/admin/KanbanBoard.tsx`
- Modify: `src/app/admin/incidents/page.tsx`

- [ ] **Step 1: Añadir `technicianName` al tipo `KanbanIncident`**

En `src/components/admin/KanbanBoard.tsx`, reemplazar:
```ts
export type KanbanIncident = {
  id: string
  numero_incident: string
  title: string
  machine_id: string
  category: string
  priority: string
  status: string
}
```
Por:
```ts
export type KanbanIncident = {
  id: string
  numero_incident: string
  title: string
  machine_id: string
  category: string
  priority: string
  status: string
  technicianName: string | null
}
```

- [ ] **Step 2: Mostrar el técnico en la tarjeta**

En `src/components/admin/KanbanBoard.tsx`, dentro de `IncidentCard`, reemplazar:
```tsx
      <p className="font-mono text-xs text-ink-muted mb-3">{incident.machine_id}</p>
```
Por:
```tsx
      <p className="font-mono text-xs text-ink-muted mb-2">{incident.machine_id}</p>
      <p className="text-xs mb-3">
        {incident.technicianName
          ? <span className="text-ink-soft">{incident.technicianName}</span>
          : <span className="text-ink-muted">Non assigné</span>}
      </p>
```

- [ ] **Step 3: Pasar `technicianName` al Kanban en la página de incidencias**

En `src/app/admin/incidents/page.tsx`, reemplazar el bloque `kanbanIncidents`:
```tsx
  const kanbanIncidents = rows.map((r) => ({
    id: r.id,
    numero_incident: r.numero_incident,
    title: r.title,
    machine_id: r.machine_id,
    category: r.category,
    priority: r.priority,
    status: r.status,
  }))
```
Por:
```tsx
  const kanbanIncidents = rows.map((r) => ({
    id: r.id,
    numero_incident: r.numero_incident,
    title: r.title,
    machine_id: r.machine_id,
    category: r.category,
    priority: r.priority,
    status: r.status,
    technicianName: r.technicianName,
  }))
```

- [ ] **Step 4: Verificar TypeScript**

```bash
npx tsc --noEmit
```
Esperado: 0 errores.

- [ ] **Step 5: Commit**

```bash
git add src/components/admin/KanbanBoard.tsx src/app/admin/incidents/page.tsx
git commit -m "feat(kanban): mostrar el técnico asignado en las tarjetas"
```

---

## Task 4: Ampliar el guard de `updateIncidentStatusAction`

**Files:**
- Modify: `src/app/admin/incidents/kanban-actions.ts`

- [ ] **Step 1: Reescribir el archivo completo**

```ts
'use server'

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { sendCsatForIncident } from '@/lib/csat'

export async function updateIncidentStatusAction(
  incidentId: string,
  oldStatus: string,
  newStatus: string
): Promise<{ error?: string }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Non authentifié' }

  const { data: caller } = await supabase
    .from('profiles')
    .select('role, is_dispatcher')
    .eq('id', user.id)
    .single()
  if (caller?.role !== 'admin' && caller?.is_dispatcher !== true) {
    return { error: 'Non autorisé' }
  }

  const admin = createAdminClient()

  const updates: Record<string, unknown> = { status: newStatus }
  if (newStatus === 'résolu' && oldStatus !== 'résolu') updates.resolved_at = new Date().toISOString()
  if (newStatus === 'fermé'  && oldStatus !== 'fermé')  updates.closed_at   = new Date().toISOString()

  const { error } = await admin.from('incidents').update(updates).eq('id', incidentId)
  if (error) return { error: error.message }

  await admin.from('incident_history').insert({
    incident_id: incidentId,
    changed_by:  user.id,
    old_status:  oldStatus,
    new_status:  newStatus,
    comment:     null,
  })

  if (newStatus === 'résolu' && oldStatus !== 'résolu') {
    sendCsatForIncident(incidentId).catch(console.error)
  }

  return {}
}
```

- [ ] **Step 2: Verificar TypeScript**

```bash
npx tsc --noEmit
```
Esperado: 0 errores.

- [ ] **Step 3: Commit**

```bash
git add src/app/admin/incidents/kanban-actions.ts
git commit -m "feat(atelier): updateIncidentStatusAction acepta dispatcher"
```

---

## Task 5: Tipos compartidos y Server Actions del Atelier

**Files:**
- Create: `src/components/atelier/types.ts`
- Create: `src/app/atelier/actions.ts`

- [ ] **Step 1: Crear `src/components/atelier/types.ts`**

```ts
export type Technician = {
  id: string
  fullName: string
}

export type AtelierIncident = {
  id: string
  numeroIncident: string
  title: string
  status: string
  priority: string
  clientName: string | null
  technicianId: string | null
  technicianName: string | null
}

export type AtelierMaintenanceVisit = {
  id: string
  scheduledDate: string
  clientName: string
  machineLabel: string
  status: string
  technicianId: string | null
  technicianName: string | null
}

export type AtelierKpis = {
  sansAssigner: number
  enCours: number
  urgentes: number
  resolusSemaine: number
}
```

- [ ] **Step 2: Crear `src/app/atelier/actions.ts`**

```ts
'use server'

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

async function requireDispatcherActor(): Promise<{ userId: string } | null> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null
  const { data: caller } = await supabase
    .from('profiles')
    .select('role, is_dispatcher')
    .eq('id', user.id)
    .single()
  if (caller?.role !== 'admin' && caller?.is_dispatcher !== true) return null
  return { userId: user.id }
}

export async function assignIncidentAction(
  incidentId: string,
  technicianId: string | null
): Promise<{ error?: string }> {
  const actor = await requireDispatcherActor()
  if (!actor) return { error: 'Non autorisé' }

  const admin = createAdminClient()

  const { data: incident } = await admin
    .from('incidents')
    .select('status')
    .eq('id', incidentId)
    .single()
  if (!incident) return { error: 'Incident introuvable' }

  const updates: Record<string, unknown> = { assigned_to: technicianId }
  const autoAssign = technicianId !== null && incident.status === 'nouveau'
  if (autoAssign) updates.status = 'assigné'

  const { error } = await admin.from('incidents').update(updates).eq('id', incidentId)
  if (error) return { error: error.message }

  if (autoAssign) {
    await admin.from('incident_history').insert({
      incident_id: incidentId,
      changed_by:  actor.userId,
      old_status:  'nouveau',
      new_status:  'assigné',
      comment:     null,
    })
  }

  return {}
}

export async function assignMaintenanceVisitAction(
  visitId: string,
  technicianId: string | null
): Promise<{ error?: string }> {
  const actor = await requireDispatcherActor()
  if (!actor) return { error: 'Non autorisé' }

  const admin = createAdminClient()
  const { error } = await admin
    .from('maintenance_visits')
    .update({ assigned_to: technicianId })
    .eq('id', visitId)
  if (error) return { error: error.message }

  return {}
}
```

- [ ] **Step 3: Verificar TypeScript**

```bash
npx tsc --noEmit
```
Esperado: 0 errores.

- [ ] **Step 4: Commit**

```bash
git add src/components/atelier/types.ts src/app/atelier/actions.ts
git commit -m "feat(atelier): tipos compartidos y Server Actions de asignación"
```

---

## Task 6: AssignPanel

**Files:**
- Create: `src/components/atelier/AssignPanel.tsx`

- [ ] **Step 1: Crear el archivo**

```tsx
'use client'

import type { Technician } from './types'

type Props = {
  open: boolean
  title: string
  subtitle: string
  technicians: Technician[]
  currentTechnicianId: string | null
  busy: boolean
  onSelect: (technicianId: string | null) => void
  onClose: () => void
}

function initials(name: string): string {
  return name
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? '')
    .join('')
}

export default function AssignPanel({
  open, title, subtitle, technicians, currentTechnicianId, busy, onSelect, onClose,
}: Props) {
  if (!open) return null

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <div className="absolute inset-0 bg-black/60" onClick={busy ? undefined : onClose} />
      <div className="relative w-[380px] h-full bg-chrome border-l border-chrome-line flex flex-col">
        <div className="px-6 py-5 border-b border-chrome-line">
          <p className="text-xs font-semibold uppercase tracking-wider text-white/40">{subtitle}</p>
          <p className="text-lg font-semibold text-white mt-1">{title}</p>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-2">
          {technicians.map((tech) => {
            const isCurrent = tech.id === currentTechnicianId
            return (
              <button
                key={tech.id}
                type="button"
                disabled={busy}
                onClick={() => onSelect(tech.id)}
                className={[
                  'w-full flex items-center gap-3 rounded-xl px-4 py-3 text-left transition-colors',
                  isCurrent ? 'bg-accent text-white' : 'bg-white/5 text-white hover:bg-white/10',
                  busy ? 'opacity-50 cursor-not-allowed' : '',
                ].join(' ')}
              >
                <span className="flex h-10 w-10 items-center justify-center rounded-full bg-white/15 text-sm font-bold">
                  {initials(tech.fullName)}
                </span>
                <span className="text-base font-medium">{tech.fullName}</span>
                {isCurrent && <span className="ml-auto text-xs font-semibold">Assigné</span>}
              </button>
            )
          })}
          {technicians.length === 0 && (
            <p className="text-sm text-white/40 px-2 py-4">Aucun technicien enregistré.</p>
          )}
        </div>

        <div className="p-4 border-t border-chrome-line space-y-2">
          {currentTechnicianId && (
            <button
              type="button"
              disabled={busy}
              onClick={() => onSelect(null)}
              className="w-full rounded-xl px-4 py-3 text-base font-medium text-white/70 bg-white/5 hover:bg-white/10 transition-colors disabled:opacity-50"
            >
              Désassigner
            </button>
          )}
          <button
            type="button"
            disabled={busy}
            onClick={onClose}
            className="w-full rounded-xl px-4 py-3 text-base font-medium text-white/50 hover:text-white transition-colors disabled:opacity-50"
          >
            Fermer
          </button>
        </div>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Verificar TypeScript**

```bash
npx tsc --noEmit
```
Esperado: 0 errores.

- [ ] **Step 3: Commit**

```bash
git add src/components/atelier/AssignPanel.tsx
git commit -m "feat(atelier): panel lateral de asignación rápida"
```

---

## Task 7: AtelierKanban

**Files:**
- Create: `src/components/atelier/AtelierKanban.tsx`

- [ ] **Step 1: Crear el archivo**

```tsx
'use client'

import { useState, useOptimistic, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import {
  DndContext,
  DragEndEvent,
  DragOverlay,
  DragStartEvent,
  PointerSensor,
  useSensor,
  useSensors,
  useDroppable,
  useDraggable,
} from '@dnd-kit/core'
import { CSS } from '@dnd-kit/utilities'
import { updateIncidentStatusAction } from '@/app/admin/incidents/kanban-actions'
import { assignIncidentAction } from '@/app/atelier/actions'
import AssignPanel from './AssignPanel'
import type { AtelierIncident, Technician } from './types'

const COLUMNS = [
  { id: 'nouveau',  label: 'Nouveau',  dot: '#3B82F6' },
  { id: 'assigné',  label: 'Assigné',  dot: '#F59E0B' },
  { id: 'en_cours', label: 'En cours', dot: '#F97316' },
  { id: 'résolu',   label: 'Résolu',   dot: '#16A34A' },
] as const

const PRIORITY_STYLE: Record<string, string> = {
  basse:   'bg-white/10 text-white/70',
  normale: 'bg-info-soft text-info',
  haute:   'bg-warning-soft text-warning',
  urgente: 'bg-accent text-white',
}
const PRIORITY_LABEL: Record<string, string> = {
  basse: 'Basse', normale: 'Normale', haute: 'Haute', urgente: 'Urgente',
}

// ─── Card ──────────────────────────────────────────────────────────────────────

function IncidentCard({
  incident,
  draggingId,
  isOverlay = false,
  onOpen,
}: {
  incident: AtelierIncident
  draggingId?: string
  isOverlay?: boolean
  onOpen?: (incident: AtelierIncident) => void
}) {
  const { attributes, listeners, setNodeRef, transform } = useDraggable({
    id: incident.id,
    data: { status: incident.status },
    disabled: isOverlay,
  })

  const isDraggingThis = draggingId === incident.id && !isOverlay
  const style = !isOverlay && transform ? { transform: CSS.Translate.toString(transform) } : undefined

  return (
    <div
      ref={isOverlay ? undefined : setNodeRef}
      style={style}
      {...(isOverlay ? {} : attributes)}
      {...(isOverlay ? {} : listeners)}
      onClick={() => { if (!isOverlay && onOpen) onOpen(incident) }}
      className={[
        'bg-white rounded-xl p-3.5 select-none',
        isDraggingThis ? 'opacity-30' : '',
        isOverlay
          ? 'shadow-2xl rotate-2 cursor-grabbing'
          : 'cursor-grab hover:ring-2 hover:ring-accent/40 transition-all',
      ].join(' ')}
    >
      <div className="flex items-center justify-between gap-2">
        <p className="font-mono text-xs font-bold text-accent">{incident.numeroIncident}</p>
        <span className={`text-[10px] font-bold px-2 py-0.5 rounded ${PRIORITY_STYLE[incident.priority] ?? 'bg-neutral-soft text-ink-soft'}`}>
          {PRIORITY_LABEL[incident.priority] ?? incident.priority}
        </span>
      </div>
      <p className="text-base font-semibold text-ink leading-snug mt-1.5 line-clamp-2">{incident.title}</p>
      <p className="text-sm text-ink-muted mt-1">{incident.clientName ?? '—'}</p>
      <div className="mt-2.5 pt-2.5 border-t border-line-subtle">
        {incident.technicianName
          ? <span className="text-sm font-medium text-ink-soft">{incident.technicianName}</span>
          : <span className="text-sm font-bold text-accent">Sans technicien</span>}
      </div>
    </div>
  )
}

// ─── Column ────────────────────────────────────────────────────────────────────

function KanbanColumn({
  column,
  incidents,
  draggingId,
  onOpen,
}: {
  column: typeof COLUMNS[number]
  incidents: AtelierIncident[]
  draggingId?: string
  onOpen: (incident: AtelierIncident) => void
}) {
  const { setNodeRef, isOver } = useDroppable({ id: column.id })

  return (
    <div className="flex-1 flex flex-col min-w-0">
      <div className="flex items-center justify-between mb-2 px-1">
        <div className="flex items-center gap-2">
          <span className="w-2.5 h-2.5 rounded-full" style={{ background: column.dot }} />
          <span className="text-sm font-bold text-white uppercase tracking-wide">{column.label}</span>
        </div>
        <span className="text-xs font-bold text-white/50 bg-white/10 rounded-full px-2 py-0.5">
          {incidents.length}
        </span>
      </div>
      <div
        ref={setNodeRef}
        className={[
          'flex-1 rounded-xl p-2 space-y-2 overflow-y-auto border-2 transition-colors',
          isOver ? 'border-accent/50 bg-white/[0.04]' : 'border-white/[0.05] bg-white/[0.02]',
        ].join(' ')}
      >
        {incidents.map((inc) => (
          <IncidentCard key={inc.id} incident={inc} draggingId={draggingId} onOpen={onOpen} />
        ))}
        {incidents.length === 0 && !isOver && (
          <div className="flex items-center justify-center h-24 text-sm text-white/25">Vide</div>
        )}
      </div>
    </div>
  )
}

// ─── Board ─────────────────────────────────────────────────────────────────────

export default function AtelierKanban({
  incidents,
  technicians,
}: {
  incidents: AtelierIncident[]
  technicians: Technician[]
}) {
  const router = useRouter()
  const [, startTransition] = useTransition()
  const [activeIncident, setActiveIncident] = useState<AtelierIncident | null>(null)
  const [selected, setSelected] = useState<AtelierIncident | null>(null)
  const [busy, setBusy] = useState(false)

  const [optimistic, updateOptimistic] = useOptimistic(
    incidents,
    (state, { id, newStatus }: { id: string; newStatus: string }) =>
      state.map((i) => (i.id === id ? { ...i, status: newStatus } : i))
  )

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } })
  )

  function onDragStart(event: DragStartEvent) {
    setActiveIncident(optimistic.find((i) => i.id === event.active.id) ?? null)
  }

  function onDragEnd(event: DragEndEvent) {
    setActiveIncident(null)
    const { active, over } = event
    if (!over) return
    const newStatus = over.id as string
    const oldStatus = active.data.current?.status as string
    if (newStatus === oldStatus) return
    startTransition(async () => {
      updateOptimistic({ id: active.id as string, newStatus })
      const result = await updateIncidentStatusAction(active.id as string, oldStatus, newStatus)
      if (!result?.error) router.refresh()
    })
  }

  async function handleAssign(technicianId: string | null) {
    if (!selected) return
    setBusy(true)
    const result = await assignIncidentAction(selected.id, technicianId)
    setBusy(false)
    if (!result?.error) {
      setSelected(null)
      router.refresh()
    }
  }

  const byStatus = Object.fromEntries(
    COLUMNS.map((col) => [col.id, optimistic.filter((i) => i.status === col.id)])
  )

  return (
    <>
      <DndContext sensors={sensors} onDragStart={onDragStart} onDragEnd={onDragEnd}>
        <div className="flex gap-3 h-full">
          {COLUMNS.map((col) => (
            <KanbanColumn
              key={col.id}
              column={col}
              incidents={byStatus[col.id] ?? []}
              draggingId={activeIncident?.id}
              onOpen={setSelected}
            />
          ))}
        </div>
        <DragOverlay>
          {activeIncident && <IncidentCard incident={activeIncident} isOverlay />}
        </DragOverlay>
      </DndContext>

      <AssignPanel
        open={selected !== null}
        title={selected ? `${selected.numeroIncident} · ${selected.title}` : ''}
        subtitle="Assigner l'incident à"
        technicians={technicians}
        currentTechnicianId={selected?.technicianId ?? null}
        busy={busy}
        onSelect={handleAssign}
        onClose={() => setSelected(null)}
      />
    </>
  )
}
```

- [ ] **Step 2: Verificar TypeScript**

```bash
npx tsc --noEmit
```
Esperado: 0 errores.

- [ ] **Step 3: Commit**

```bash
git add src/components/atelier/AtelierKanban.tsx
git commit -m "feat(atelier): Kanban oscuro con drag & drop y asignación"
```

---

## Task 8: AtelierMaintenanceWeek

**Files:**
- Create: `src/components/atelier/AtelierMaintenanceWeek.tsx`

- [ ] **Step 1: Crear el archivo**

```tsx
'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { assignMaintenanceVisitAction } from '@/app/atelier/actions'
import AssignPanel from './AssignPanel'
import type { AtelierMaintenanceVisit, Technician } from './types'

const DAYS = ['Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi']

export default function AtelierMaintenanceWeek({
  visits,
  weekDates,
  technicians,
}: {
  visits: AtelierMaintenanceVisit[]
  weekDates: string[]
  technicians: Technician[]
}) {
  const router = useRouter()
  const [selected, setSelected] = useState<AtelierMaintenanceVisit | null>(null)
  const [busy, setBusy] = useState(false)

  async function handleAssign(technicianId: string | null) {
    if (!selected) return
    setBusy(true)
    const result = await assignMaintenanceVisitAction(selected.id, technicianId)
    setBusy(false)
    if (!result?.error) {
      setSelected(null)
      router.refresh()
    }
  }

  return (
    <>
      <div className="flex gap-3 h-full">
        {weekDates.map((date, i) => {
          const dayVisits = visits.filter((v) => v.scheduledDate === date)
          const dayNum = new Date(date + 'T00:00:00').getDate()
          return (
            <div key={date} className="flex-1 flex flex-col min-w-0">
              <div className="flex items-center justify-between mb-2 px-1">
                <span className="text-sm font-bold text-white uppercase tracking-wide">{DAYS[i]}</span>
                <span className="text-xs font-bold text-white/40">{dayNum}</span>
              </div>
              <div className="flex-1 rounded-xl p-2 space-y-2 overflow-y-auto bg-white/[0.02] border-2 border-white/[0.05]">
                {dayVisits.map((v) => (
                  <button
                    key={v.id}
                    type="button"
                    onClick={() => setSelected(v)}
                    className="w-full text-left bg-white rounded-xl p-3 hover:ring-2 hover:ring-accent/40 transition-all"
                  >
                    <p className="text-sm font-semibold text-ink leading-snug">{v.clientName}</p>
                    <p className="text-xs text-ink-muted mt-0.5">{v.machineLabel}</p>
                    <div className="mt-2 pt-2 border-t border-line-subtle">
                      {v.technicianName
                        ? <span className="text-xs font-medium text-ink-soft">{v.technicianName}</span>
                        : <span className="text-xs font-bold text-accent">À assigner</span>}
                    </div>
                  </button>
                ))}
                {dayVisits.length === 0 && (
                  <div className="flex items-center justify-center h-16 text-xs text-white/20">—</div>
                )}
              </div>
            </div>
          )
        })}
      </div>

      <AssignPanel
        open={selected !== null}
        title={selected ? selected.clientName : ''}
        subtitle="Assigner la visite à"
        technicians={technicians}
        currentTechnicianId={selected?.technicianId ?? null}
        busy={busy}
        onSelect={handleAssign}
        onClose={() => setSelected(null)}
      />
    </>
  )
}
```

- [ ] **Step 2: Verificar TypeScript**

```bash
npx tsc --noEmit
```
Esperado: 0 errores.

- [ ] **Step 3: Commit**

```bash
git add src/components/atelier/AtelierMaintenanceWeek.tsx
git commit -m "feat(atelier): mini-tablero de mantenimientos lun-vie"
```

---

## Task 9: AtelierHeader, AtelierKpis y AutoRefresh

**Files:**
- Create: `src/components/atelier/AtelierHeader.tsx`
- Create: `src/components/atelier/AtelierKpis.tsx`
- Create: `src/components/atelier/AutoRefresh.tsx`

- [ ] **Step 1: Crear `src/components/atelier/AtelierHeader.tsx`**

```tsx
'use client'

import { useEffect, useState } from 'react'

export default function AtelierHeader() {
  const [now, setNow] = useState<Date | null>(null)

  useEffect(() => {
    setNow(new Date())
    const t = setInterval(() => setNow(new Date()), 1000)
    return () => clearInterval(t)
  }, [])

  const label = now
    ? now.toLocaleDateString('fr-FR', { weekday: 'short', day: 'numeric', month: 'long' }) +
      ' · ' +
      now.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })
    : ''

  return (
    <header className="flex items-center justify-between">
      <p className="font-display text-2xl font-extrabold text-white">
        AMD <span className="text-accent">·</span> Atelier
      </p>
      <p className="font-display text-xl font-semibold text-white/50 tabular-nums">{label}</p>
    </header>
  )
}
```

- [ ] **Step 2: Crear `src/components/atelier/AtelierKpis.tsx`**

```tsx
import type { AtelierKpis as Kpis } from './types'

const TONE = {
  accent:  { grad: 'from-accent/25',  label: 'text-accent'  },
  warning: { grad: 'from-warning/25', label: 'text-warning' },
  violet:  { grad: 'from-violet/25',  label: 'text-violet'  },
  success: { grad: 'from-success/25', label: 'text-success' },
}

const CARDS = [
  { key: 'sansAssigner',   label: 'Sans assigner',      sub: 'à dispatcher',          tone: 'accent'  },
  { key: 'enCours',        label: 'En cours',           sub: 'interventions actives', tone: 'warning' },
  { key: 'urgentes',       label: 'Urgentes',           sub: 'priorité haute',        tone: 'violet'  },
  { key: 'resolusSemaine', label: 'Résolus cette sem.', sub: 'cette semaine',         tone: 'success' },
] as const

export default function AtelierKpis({ kpis }: { kpis: Kpis }) {
  return (
    <div className="grid grid-cols-4 gap-4">
      {CARDS.map((c) => {
        const tone = TONE[c.tone]
        return (
          <div
            key={c.key}
            className={`rounded-2xl border border-white/10 bg-gradient-to-br ${tone.grad} to-transparent p-5`}
          >
            <p className={`text-xs font-bold uppercase tracking-wider ${tone.label}`}>{c.label}</p>
            <p className="font-display text-5xl font-extrabold text-white mt-2 leading-none">
              {kpis[c.key]}
            </p>
            <p className="text-xs text-white/40 mt-2">{c.sub}</p>
          </div>
        )
      })}
    </div>
  )
}
```

- [ ] **Step 3: Crear `src/components/atelier/AutoRefresh.tsx`**

```tsx
'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'

export default function AutoRefresh({ intervalMs = 30000 }: { intervalMs?: number }) {
  const router = useRouter()
  useEffect(() => {
    const t = setInterval(() => router.refresh(), intervalMs)
    return () => clearInterval(t)
  }, [router, intervalMs])
  return null
}
```

- [ ] **Step 4: Verificar TypeScript**

```bash
npx tsc --noEmit
```
Esperado: 0 errores.

- [ ] **Step 5: Commit**

```bash
git add src/components/atelier/AtelierHeader.tsx src/components/atelier/AtelierKpis.tsx src/components/atelier/AutoRefresh.tsx
git commit -m "feat(atelier): cabecera con reloj, tarjetas KPI y auto-refresco"
```

---

## Task 10: Layout y página `/atelier`

**Files:**
- Create: `src/app/atelier/layout.tsx`
- Create: `src/app/atelier/page.tsx`

- [ ] **Step 1: Crear `src/app/atelier/layout.tsx`**

```tsx
import type { ReactNode } from 'react'

export default function AtelierLayout({ children }: { children: ReactNode }) {
  return (
    <div className="h-screen w-screen overflow-hidden bg-[#0E0E12] text-white">
      {children}
    </div>
  )
}
```

- [ ] **Step 2: Crear `src/app/atelier/page.tsx`**

```tsx
import { requireDispatcher } from '@/lib/auth'
import { createAdminClient } from '@/lib/supabase/admin'
import AtelierHeader from '@/components/atelier/AtelierHeader'
import AtelierKpis from '@/components/atelier/AtelierKpis'
import AtelierKanban from '@/components/atelier/AtelierKanban'
import AtelierMaintenanceWeek from '@/components/atelier/AtelierMaintenanceWeek'
import AutoRefresh from '@/components/atelier/AutoRefresh'
import type { AtelierIncident, AtelierMaintenanceVisit, Technician } from '@/components/atelier/types'

export const dynamic = 'force-dynamic'

function mondayOf(d: Date): Date {
  const date = new Date(d)
  const day = date.getDay()
  const diff = day === 0 ? -6 : 1 - day
  date.setDate(date.getDate() + diff)
  date.setHours(0, 0, 0, 0)
  return date
}

function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10)
}

export default async function AtelierPage() {
  await requireDispatcher()
  const admin = createAdminClient()

  const now = new Date()
  const monday = mondayOf(now)
  const weekStart = monday.getTime()
  const weekDates: string[] = Array.from({ length: 5 }, (_, i) => {
    const d = new Date(monday)
    d.setDate(monday.getDate() + i)
    return isoDate(d)
  })
  const mondayIso = isoDate(monday)
  const fridayDate = new Date(monday)
  fridayDate.setDate(monday.getDate() + 4)
  const fridayIso = isoDate(fridayDate)

  const [incidentsRes, visitsRes, techsRes] = await Promise.all([
    admin
      .from('incidents')
      .select(`
        id, numero_incident, title, status, priority, resolved_at, assigned_to,
        contracts ( clients ( nom_client ) ),
        profiles!assigned_to ( full_name )
      `)
      .neq('status', 'fermé')
      .order('created_at', { ascending: false })
      .limit(400),
    admin
      .from('maintenance_visits')
      .select(`
        id, scheduled_date, status, assigned_to,
        maintenance_plans ( contracts ( clients ( nom_client ), machines ( marque, modele ) ) ),
        profiles!assigned_to ( full_name )
      `)
      .gte('scheduled_date', mondayIso)
      .lte('scheduled_date', fridayIso),
    admin
      .from('profiles')
      .select('id, full_name')
      .eq('role', 'technician')
      .order('full_name'),
  ])

  type IncRow = {
    id: string
    numero_incident: string
    title: string
    status: string
    priority: string
    resolved_at: string | null
    assigned_to: string | null
    contracts: { clients: { nom_client: string } | null } | null
    profiles: { full_name: string | null } | null
  }
  const rawIncidents = (incidentsRes.data ?? []) as unknown as IncRow[]

  const resolvedThisWeek = (i: IncRow) =>
    i.resolved_at !== null && new Date(i.resolved_at).getTime() >= weekStart

  const boardIncidents: AtelierIncident[] = rawIncidents
    .filter((i) => i.status !== 'résolu' || resolvedThisWeek(i))
    .map((i) => ({
      id: i.id,
      numeroIncident: i.numero_incident,
      title: i.title,
      status: i.status,
      priority: i.priority,
      clientName: i.contracts?.clients?.nom_client ?? null,
      technicianId: i.assigned_to,
      technicianName: i.profiles?.full_name ?? null,
    }))

  const openIncidents = rawIncidents.filter((i) => i.status !== 'résolu')
  const kpis = {
    sansAssigner:   openIncidents.filter((i) => i.assigned_to === null).length,
    enCours:        rawIncidents.filter((i) => i.status === 'en_cours').length,
    urgentes:       openIncidents.filter((i) => i.priority === 'urgente').length,
    resolusSemaine: rawIncidents.filter(resolvedThisWeek).length,
  }

  type VisitRow = {
    id: string
    scheduled_date: string
    status: string
    assigned_to: string | null
    maintenance_plans: {
      contracts: {
        clients: { nom_client: string } | null
        machines: { marque: string; modele: string } | null
      } | null
    } | null
    profiles: { full_name: string | null } | null
  }
  const rawVisits = (visitsRes.data ?? []) as unknown as VisitRow[]
  const visits: AtelierMaintenanceVisit[] = rawVisits.map((v) => {
    const contract = v.maintenance_plans?.contracts
    return {
      id: v.id,
      scheduledDate: v.scheduled_date,
      clientName: contract?.clients?.nom_client ?? '—',
      machineLabel: contract?.machines
        ? `${contract.machines.marque} ${contract.machines.modele}`
        : '—',
      status: v.status,
      technicianId: v.assigned_to,
      technicianName: v.profiles?.full_name ?? null,
    }
  })

  const technicians: Technician[] = (techsRes.data ?? []).map((t) => ({
    id: t.id,
    fullName: t.full_name ?? '—',
  }))

  return (
    <div className="h-full flex flex-col gap-4 p-6">
      <AutoRefresh intervalMs={30000} />
      <AtelierHeader />
      <AtelierKpis kpis={kpis} />

      <section className="flex-[1.6] flex flex-col min-h-0">
        <p className="text-xs font-bold uppercase tracking-widest text-white/30 mb-2">Incidents SAV</p>
        <div className="flex-1 min-h-0">
          <AtelierKanban incidents={boardIncidents} technicians={technicians} />
        </div>
      </section>

      <section className="flex-[0.9] flex flex-col min-h-0">
        <p className="text-xs font-bold uppercase tracking-widest text-white/30 mb-2">
          Maintenances — cette semaine
        </p>
        <div className="flex-1 min-h-0">
          <AtelierMaintenanceWeek visits={visits} weekDates={weekDates} technicians={technicians} />
        </div>
      </section>
    </div>
  )
}
```

- [ ] **Step 3: Verificar TypeScript y build**

```bash
npx tsc --noEmit && npm run build
```
Esperado: 0 errores TypeScript · build exitoso.

- [ ] **Step 4: Commit**

```bash
git add src/app/atelier/layout.tsx src/app/atelier/page.tsx
git commit -m "feat(atelier): layout kiosko y página del dashboard"
```

---

## Task 11: Build, PR y puesta en marcha

- [ ] **Step 1: Build completo**

```bash
cd "/Users/juanmiguel/Claude/Web AMD Codex/web-amd" && npx tsc --noEmit && npm run build
```
Esperado: 0 errores TypeScript · build exitoso, sin warnings nuevos.

- [ ] **Step 2: Push**

```bash
git push -u origin feat/dashboard-atelier
```

- [ ] **Step 3: Abrir PR**

```bash
gh pr create \
  --title "feat: Dashboard Atelier (kiosko de taller)" \
  --body "$(cat <<'EOF'
## Summary
- Nueva ruta `/atelier` — dashboard de taller en modo kiosko para TV de 32"
- Nuevo flag `profiles.is_dispatcher` + columna `maintenance_visits.assigned_to` (migración)
- Cuenta con permiso de despacho: asigna incidencias y visitas de mantenimiento a técnicos
- Kanban oscuro con drag & drop (cambia estado) + panel de asignación rápida
- Mini-tablero de mantenimientos lun–vie + 4 tarjetas KPI + auto-refresco cada 30 s
- El `KanbanBoard` de `/admin` ahora muestra el técnico asignado en las tarjetas
- `updateIncidentStatusAction` acepta admin o dispatcher

## Puesta en marcha (manual, tras el merge)
1. Crear la cuenta de Supabase Auth "Atelier" (formulario `/admin/team/new` o panel de Supabase), rol técnico.
2. Activar el flag: `UPDATE profiles SET is_dispatcher = true WHERE id = '<uuid-de-la-cuenta>';`
3. Iniciar sesión con esa cuenta en la Raspberry Pi → redirige a `/atelier`.

## Test plan
- [x] `npx tsc --noEmit` limpio
- [x] `npm run build` sin errores nuevos
- [ ] Con la cuenta dispatcher: login redirige a `/atelier`
- [ ] El Kanban muestra incidencias; drag cambia estado; clic abre el panel de asignación
- [ ] Asignar técnico a una incidencia `nouveau` la pasa a `assigné`
- [ ] El mini-tablero muestra visitas lun–vie; se pueden asignar
- [ ] Un técnico normal no puede asignar ni cambiar estados
- [ ] Verificar deploy en producción tras merge

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

- [ ] **Step 4: Code review y merge**

Lanzar `/code-review <N>` con el número del PR. Aplicar fixes con score ≥ 80. Luego:

```bash
gh pr merge <N> --merge --delete-branch
```

- [ ] **Step 5: Verificar deploy** en `https://amd-service.vercel.app` y completar la puesta en marcha (crear la cuenta + activar el flag).
