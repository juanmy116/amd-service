# Bloque 1c — Rediseño Listados `/admin` — Plan de Implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Migrar las 6 páginas de listado de `/admin` y sus componentes compartidos al sistema de tokens Tailwind v4 y componentes de Fase 0, añadiendo una variante `violet` al `Badge`.

**Architecture:** Cambio puramente de presentación — sin tocar lógica, queries, Server Actions ni filtros. Cada archivo reemplaza colores hardcodeados por tokens; las tablas se envuelven en `Card`; los badges de estado pasan al componente `Badge`. Cada página mantiene su propio `<table>` (decisión del spec).

**Tech Stack:** Next.js 16 · TypeScript · Tailwind CSS v4 · Lucide React · @dnd-kit · componentes Fase 0 (`Card`, `Badge`, `buttonClasses`).

---

## Archivos modificados (12)

| Archivo | Cambio |
|---|---|
| `src/app/globals.css` | tokens `--color-violet` / `--color-violet-soft` |
| `src/components/ui/Badge.tsx` | variante `violet` |
| `src/components/admin/SearchFilters.tsx` | inputs/selects → tokens |
| `src/components/admin/ViewToggle.tsx` | toggle → tokens |
| `src/components/admin/IncidentsListView.tsx` | `Card` + `Badge` + tokens |
| `src/components/admin/KanbanBoard.tsx` | tokens + `Badge` para prioridad |
| `src/app/admin/clients/page.tsx` | header + tabla + `Badge` + tokens |
| `src/app/admin/machines/page.tsx` | header + tabla + `Badge` + tokens |
| `src/app/admin/contracts/page.tsx` | header + tabla + `Badge` + tokens |
| `src/app/admin/incidents/page.tsx` | header + tokens |
| `src/app/admin/maintenance/page.tsx` | header + tabla + mini-KPIs + tokens |
| `src/app/admin/contadores/page.tsx` | header + tarjetas por cliente + tokens |

---

## Task 0: Rama de trabajo

La rama `feat/rediseno-bloque-1c-listados` ya está creada desde `main` con el spec commiteado. Verificar:

- [ ] **Confirmar rama:**

```bash
cd "/Users/juanmiguel/Claude/Web AMD Codex/web-amd" && git branch --show-current
```

Esperado: `feat/rediseno-bloque-1c-listados`

---

## Task 1: Sistema de diseño — variante `violet`

**Files:**
- Modify: `src/app/globals.css`
- Modify: `src/components/ui/Badge.tsx`

- [ ] **Step 1: Añadir tokens en `globals.css`**

En el bloque `@theme`, sección "Estados", reemplazar:

```css
  --color-info: #1D4ED8;
  --color-info-soft: #EFF6FF;
  --color-neutral-soft: #F4F4F5;
```

Por:

```css
  --color-info: #1D4ED8;
  --color-info-soft: #EFF6FF;
  --color-violet: #7C3AED;
  --color-violet-soft: #F5F3FF;
  --color-neutral-soft: #F4F4F5;
```

- [ ] **Step 2: Añadir la variante en `Badge.tsx`**

Reemplazar el objeto `VARIANTS`:

```tsx
const VARIANTS = {
  solid:   'bg-accent text-white',
  danger:  'bg-accent-soft text-accent',
  success: 'bg-success-soft text-success',
  warning: 'bg-warning-soft text-warning',
  info:    'bg-info-soft text-info',
  neutral: 'bg-neutral-soft text-ink-soft',
} as const
```

Por:

```tsx
const VARIANTS = {
  solid:   'bg-accent text-white',
  danger:  'bg-accent-soft text-accent',
  success: 'bg-success-soft text-success',
  warning: 'bg-warning-soft text-warning',
  info:    'bg-info-soft text-info',
  violet:  'bg-violet-soft text-violet',
  neutral: 'bg-neutral-soft text-ink-soft',
} as const
```

- [ ] **Step 3: Verificar TypeScript**

```bash
cd "/Users/juanmiguel/Claude/Web AMD Codex/web-amd" && npx tsc --noEmit
```

Esperado: 0 errores.

- [ ] **Step 4: Commit**

```bash
git add src/app/globals.css src/components/ui/Badge.tsx
git commit -m "feat(ui): variante violet en el Badge de Fase 0"
```

---

## Task 2: SearchFilters — migrar a tokens

**Files:**
- Modify: `src/components/admin/SearchFilters.tsx`

- [ ] **Step 1: Reescribir el archivo completo**

```tsx
'use client'

import { useEffect, useRef, useState, useTransition } from 'react'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { Search, X } from 'lucide-react'

const QUERY_PARAM = 'q'
const DEBOUNCE_MS = 300

export type FilterOption = { value: string; label: string }

export type FilterDef = {
  param: string
  label: string
  options: FilterOption[]
}

type Props = {
  placeholder?: string
  filters?: FilterDef[]
}

export default function SearchFilters({ placeholder = 'Rechercher…', filters = [] }: Props) {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const [, startTransition] = useTransition()

  const [value, setValue] = useState(searchParams.get(QUERY_PARAM) ?? '')
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    setValue(searchParams.get(QUERY_PARAM) ?? '')
  }, [searchParams])

  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current)
    }
  }, [])

  function pushWith(updates: Record<string, string | null>) {
    const next = new URLSearchParams(searchParams.toString())
    for (const [key, val] of Object.entries(updates)) {
      if (val === null || val === '') next.delete(key)
      else next.set(key, val)
    }
    const qs = next.toString()
    startTransition(() => {
      router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false })
    })
  }

  function onQueryChange(next: string) {
    setValue(next)
    if (timerRef.current) clearTimeout(timerRef.current)
    timerRef.current = setTimeout(() => {
      pushWith({ [QUERY_PARAM]: next.trim() || null })
    }, DEBOUNCE_MS)
  }

  function clearAll() {
    setValue('')
    startTransition(() => {
      router.replace(pathname, { scroll: false })
    })
  }

  const hasActiveFilters =
    !!searchParams.get(QUERY_PARAM) ||
    filters.some((f) => searchParams.get(f.param))

  return (
    <div className="flex flex-wrap items-center gap-2 mb-5">
      <div className="relative flex-1 min-w-[220px] max-w-md">
        <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-muted pointer-events-none" />
        <input
          type="search"
          value={value}
          onChange={(e) => onQueryChange(e.target.value)}
          placeholder={placeholder}
          maxLength={80}
          className="w-full pl-9 pr-3 py-2 text-sm text-ink border border-line rounded-lg bg-card focus:outline-none focus:ring-2 focus:ring-accent/20 focus:border-accent"
        />
      </div>

      {filters.map((filter) => {
        const current = searchParams.get(filter.param) ?? ''
        return (
          <select
            key={filter.param}
            value={current}
            onChange={(e) => pushWith({ [filter.param]: e.target.value || null })}
            className="text-sm text-ink border border-line rounded-lg bg-card px-3 py-2 focus:outline-none focus:ring-2 focus:ring-accent/20 focus:border-accent"
          >
            <option value="">{filter.label}</option>
            {filter.options.map((opt) => (
              <option key={opt.value} value={opt.value}>{opt.label}</option>
            ))}
          </select>
        )
      })}

      {hasActiveFilters && (
        <button
          type="button"
          onClick={clearAll}
          className="inline-flex items-center gap-1 text-xs font-medium text-ink-soft hover:text-ink px-2 py-1.5"
        >
          <X size={13} />
          Effacer
        </button>
      )}
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
git add src/components/admin/SearchFilters.tsx
git commit -m "refactor(listados): SearchFilters usa tokens"
```

---

## Task 3: ViewToggle — migrar a tokens

**Files:**
- Modify: `src/components/admin/ViewToggle.tsx`

- [ ] **Step 1: Reescribir el archivo completo**

```tsx
'use client'

import { useTransition } from 'react'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { LayoutGrid, List } from 'lucide-react'

const PARAM = 'view'

type View = 'kanban' | 'list'

export default function ViewToggle({ defaultView = 'kanban' }: { defaultView?: View }) {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const [, startTransition] = useTransition()

  const raw = searchParams.get(PARAM)
  const current: View = raw === 'list' || raw === 'kanban' ? raw : defaultView

  function setView(view: View) {
    if (view === current) return
    const next = new URLSearchParams(searchParams.toString())
    if (view === defaultView) next.delete(PARAM)
    else next.set(PARAM, view)
    const qs = next.toString()
    startTransition(() => {
      router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false })
    })
  }

  const base = 'flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium transition-colors'
  const active = 'bg-card text-ink shadow-card'
  const idle = 'text-ink-soft hover:text-ink'

  return (
    <div className="inline-flex items-center rounded-lg border border-line bg-neutral-soft p-0.5">
      <button
        type="button"
        onClick={() => setView('kanban')}
        className={`${base} rounded-md ${current === 'kanban' ? active : idle}`}
      >
        <LayoutGrid size={13} />
        Kanban
      </button>
      <button
        type="button"
        onClick={() => setView('list')}
        className={`${base} rounded-md ${current === 'list' ? active : idle}`}
      >
        <List size={13} />
        Liste
      </button>
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
git add src/components/admin/ViewToggle.tsx
git commit -m "refactor(listados): ViewToggle usa tokens"
```

---

## Task 4: IncidentsListView — Card + Badge + tokens

**Files:**
- Modify: `src/components/admin/IncidentsListView.tsx`

- [ ] **Step 1: Reescribir el archivo completo**

```tsx
import Link from 'next/link'
import { Card } from '@/components/ui/Card'
import { Badge } from '@/components/ui/Badge'
import type { BadgeVariant } from '@/components/ui/Badge'

const STATUS: Record<string, { label: string; variant: BadgeVariant }> = {
  nouveau:  { label: 'Nouveau',  variant: 'info'    },
  assigné:  { label: 'Assigné',  variant: 'violet'  },
  en_cours: { label: 'En cours', variant: 'warning' },
  résolu:   { label: 'Résolu',   variant: 'success' },
  fermé:    { label: 'Fermé',    variant: 'neutral' },
}

const PRIORITY: Record<string, { label: string; variant: BadgeVariant }> = {
  basse:   { label: 'Basse',   variant: 'neutral' },
  normale: { label: 'Normale', variant: 'info'    },
  haute:   { label: 'Haute',   variant: 'warning' },
  urgente: { label: 'Urgente', variant: 'danger'  },
}

export type IncidentRow = {
  id: string
  numero_incident: string
  title: string
  status: string
  priority: string
  machine_id: string
  created_at: string
  clientName: string | null
  technicianName: string | null
}

const TH = 'text-left text-[10px] font-semibold text-ink-muted uppercase tracking-[0.06em] px-4 py-2.5'

export default function IncidentsListView({ incidents }: { incidents: IncidentRow[] }) {
  if (incidents.length === 0) {
    return (
      <Card className="px-5 py-12 text-center text-sm text-ink-muted">
        Aucun incident
      </Card>
    )
  }

  return (
    <Card className="overflow-hidden">
      <table className="w-full text-sm">
        <thead>
          <tr className="bg-neutral-soft border-b border-line-subtle">
            <th className={TH}>Nº</th>
            <th className={TH}>Titre</th>
            <th className={TH}>Client</th>
            <th className={TH}>Machine</th>
            <th className={TH}>Statut</th>
            <th className={TH}>Priorité</th>
            <th className={TH}>Technicien</th>
            <th className={TH}>Date</th>
            <th className="px-4 py-2.5" />
          </tr>
        </thead>
        <tbody className="divide-y divide-line-subtle">
          {incidents.map((inc) => {
            const href = `/admin/incidents/${inc.id}`
            const status = STATUS[inc.status]
            const priority = PRIORITY[inc.priority]
            return (
              <tr key={inc.id} className="hover:bg-neutral-soft transition-colors">
                <td className="px-4 py-3 font-mono text-xs">
                  <Link href={href} className="font-semibold text-accent hover:underline">
                    {inc.numero_incident}
                  </Link>
                </td>
                <td className="px-4 py-3 font-medium max-w-xs">
                  <Link href={href} className="text-ink hover:text-accent transition-colors block truncate">
                    {inc.title}
                  </Link>
                </td>
                <td className="px-4 py-3 text-ink-soft">{inc.clientName ?? '—'}</td>
                <td className="px-4 py-3 font-mono text-xs text-ink-muted">{inc.machine_id}</td>
                <td className="px-4 py-3">
                  {status
                    ? <Badge variant={status.variant}>{status.label}</Badge>
                    : <span className="text-xs text-ink-muted">{inc.status}</span>}
                </td>
                <td className="px-4 py-3">
                  {priority
                    ? <Badge variant={priority.variant}>{priority.label}</Badge>
                    : <span className="text-xs text-ink-muted">{inc.priority}</span>}
                </td>
                <td className="px-4 py-3 text-ink-soft">{inc.technicianName ?? '—'}</td>
                <td className="px-4 py-3 text-xs text-ink-muted whitespace-nowrap">
                  {new Date(inc.created_at).toLocaleDateString('fr-FR')}
                </td>
                <td className="px-4 py-3 text-right">
                  <Link href={href} className="text-sm font-medium text-ink-soft hover:text-ink">
                    Voir
                  </Link>
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </Card>
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
git add src/components/admin/IncidentsListView.tsx
git commit -m "refactor(listados): IncidentsListView usa Card + Badge + tokens"
```

---

## Task 5: KanbanBoard — tokens + Badge

**Files:**
- Modify: `src/components/admin/KanbanBoard.tsx`

- [ ] **Step 1: Reescribir el archivo completo**

```tsx
'use client'

import { useState, useOptimistic, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
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
import { Badge } from '@/components/ui/Badge'
import type { BadgeVariant } from '@/components/ui/Badge'
import { updateIncidentStatusAction } from '@/app/admin/incidents/kanban-actions'

export type KanbanIncident = {
  id: string
  numero_incident: string
  title: string
  machine_id: string
  category: string
  priority: string
  status: string
}

const COLUMNS = [
  { id: 'nouveau',  label: 'Nouveau',  dot: 'bg-blue-500' },
  { id: 'assigné',  label: 'Assigné',  dot: 'bg-purple-500' },
  { id: 'en_cours', label: 'En cours', dot: 'bg-amber-500' },
  { id: 'résolu',   label: 'Résolu',   dot: 'bg-green-500' },
  { id: 'fermé',    label: 'Fermé',    dot: 'bg-gray-400' },
] as const

const PRIORITY: Record<string, { label: string; variant: BadgeVariant }> = {
  basse:   { label: 'Basse',   variant: 'neutral' },
  normale: { label: 'Normale', variant: 'info'    },
  haute:   { label: 'Haute',   variant: 'warning' },
  urgente: { label: 'Urgente', variant: 'danger'  },
}
const CATEGORY_LABEL: Record<string, string> = {
  panne: 'Panne', maintenance: 'Maintenance', consommable: 'Consommable', autre: 'Autre',
}

// ─── Card ─────────────────────────────────────────────────────────────────────

function IncidentCard({
  incident,
  draggingId,
  isOverlay = false,
}: {
  incident: KanbanIncident
  draggingId?: string
  isOverlay?: boolean
}) {
  const { attributes, listeners, setNodeRef, transform } = useDraggable({
    id: incident.id,
    data: { status: incident.status },
    disabled: isOverlay,
  })

  const isDraggingThis = draggingId === incident.id && !isOverlay
  const style = !isOverlay && transform ? { transform: CSS.Translate.toString(transform) } : undefined
  const priority = PRIORITY[incident.priority]

  return (
    <div
      ref={isOverlay ? undefined : setNodeRef}
      style={style}
      {...(isOverlay ? {} : attributes)}
      {...(isOverlay ? {} : listeners)}
      className={[
        'bg-card rounded-card border border-line p-3.5 select-none',
        isDraggingThis  ? 'opacity-30' : '',
        isOverlay       ? 'shadow-raised rotate-1 cursor-grabbing' : 'cursor-grab hover:shadow-card transition-all',
      ].join(' ')}
    >
      <p className="font-mono text-[11px] font-semibold text-accent mb-1.5 tracking-wide">
        {incident.numero_incident}
      </p>
      <p className="text-sm font-medium text-ink leading-snug mb-2 line-clamp-2">
        {incident.title}
      </p>
      <p className="font-mono text-xs text-ink-muted mb-3">{incident.machine_id}</p>
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-1.5 min-w-0">
          {priority
            ? <Badge variant={priority.variant}>{priority.label}</Badge>
            : <span className="text-xs text-ink-muted">{incident.priority}</span>}
          <span className="text-xs text-ink-muted truncate">
            {CATEGORY_LABEL[incident.category] ?? incident.category}
          </span>
        </div>
        {!isOverlay && (
          <Link
            href={`/admin/incidents/${incident.id}`}
            className="shrink-0 text-xs text-ink-muted hover:text-ink-soft transition-colors"
            onClick={(e) => e.stopPropagation()}
          >
            →
          </Link>
        )}
      </div>
    </div>
  )
}

// ─── Column ───────────────────────────────────────────────────────────────────

function KanbanColumn({
  column,
  incidents,
  draggingId,
}: {
  column: typeof COLUMNS[number]
  incidents: KanbanIncident[]
  draggingId?: string
}) {
  const { setNodeRef, isOver } = useDroppable({ id: column.id })

  return (
    <div className="flex-shrink-0 w-[272px] flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between mb-3 px-1">
        <div className="flex items-center gap-2">
          <div className={`w-2 h-2 rounded-full ${column.dot}`} />
          <span className="text-sm font-semibold text-ink">{column.label}</span>
        </div>
        <span className="text-xs font-medium text-ink-soft bg-neutral-soft rounded-full px-2 py-0.5">
          {incidents.length}
        </span>
      </div>

      {/* Drop zone */}
      <div
        ref={setNodeRef}
        className={[
          'flex-1 min-h-[520px] rounded-card p-2.5 space-y-2 border-2 border-dashed transition-colors duration-150',
          isOver ? 'border-line bg-neutral-soft' : 'border-transparent bg-page',
        ].join(' ')}
      >
        {incidents.map((inc) => (
          <IncidentCard key={inc.id} incident={inc} draggingId={draggingId} />
        ))}
        {incidents.length === 0 && !isOver && (
          <div className="flex items-center justify-center h-20 text-xs text-ink-muted">
            Aucun incident
          </div>
        )}
      </div>
    </div>
  )
}

// ─── Board ────────────────────────────────────────────────────────────────────

export default function KanbanBoard({ incidents: initialIncidents }: { incidents: KanbanIncident[] }) {
  const router = useRouter()
  const [, startTransition] = useTransition()
  const [activeIncident, setActiveIncident] = useState<KanbanIncident | null>(null)

  const [optimisticIncidents, updateOptimistic] = useOptimistic(
    initialIncidents,
    (state, { id, newStatus }: { id: string; newStatus: string }) =>
      state.map((inc) => (inc.id === id ? { ...inc, status: newStatus } : inc))
  )

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } })
  )

  function onDragStart(event: DragStartEvent) {
    setActiveIncident(optimisticIncidents.find((i) => i.id === event.active.id) ?? null)
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

  const byStatus = Object.fromEntries(
    COLUMNS.map((col) => [col.id, optimisticIncidents.filter((i) => i.status === col.id)])
  )

  return (
    <DndContext sensors={sensors} onDragStart={onDragStart} onDragEnd={onDragEnd}>
      <div className="flex gap-4 overflow-x-auto pb-4">
        {COLUMNS.map((col) => (
          <KanbanColumn
            key={col.id}
            column={col}
            incidents={byStatus[col.id] ?? []}
            draggingId={activeIncident?.id}
          />
        ))}
      </div>
      <DragOverlay>
        {activeIncident && <IncidentCard incident={activeIncident} isOverlay />}
      </DragOverlay>
    </DndContext>
  )
}
```

Nota: las `COLUMNS` (incluidos los `dot` de color) se mantienen idénticas al original — son indicadores funcionales. La lógica `@dnd-kit` no cambia.

- [ ] **Step 2: Verificar TypeScript**

```bash
npx tsc --noEmit
```

Esperado: 0 errores.

- [ ] **Step 3: Commit**

```bash
git add src/components/admin/KanbanBoard.tsx
git commit -m "refactor(listados): KanbanBoard usa tokens + Badge"
```

---

## Task 6: clients/page.tsx

**Files:**
- Modify: `src/app/admin/clients/page.tsx`

- [ ] **Step 1: Reescribir el archivo completo**

```tsx
import { createClient } from '@/lib/supabase/server'
import Link from 'next/link'
import { Users, Plus } from 'lucide-react'
import SearchFilters from '@/components/admin/SearchFilters'
import { Card } from '@/components/ui/Card'
import { Badge } from '@/components/ui/Badge'
import { buttonClasses } from '@/components/ui/Button'
import {
  sanitizeSearchQuery,
  buildSafeOr,
  parseBooleanParam,
  firstParam,
} from '@/lib/search'

const SEARCH_COLUMNS = ['nom_client', 'ninea', 'ville'] as const
const RESULT_LIMIT = 200
const TH = 'text-left text-[10px] font-semibold text-ink-muted uppercase tracking-[0.06em] px-6 py-2.5'

type SearchParams = Promise<{ [key: string]: string | string[] | undefined }>

export default async function ClientsPage({ searchParams }: { searchParams: SearchParams }) {
  const sp = await searchParams
  const q = sanitizeSearchQuery(firstParam(sp.q))
  const activeFilter = parseBooleanParam(firstParam(sp.active))

  const supabase = await createClient()

  let query = supabase
    .from('clients')
    .select('id, nom_client, ninea, ville, active')
    .order('nom_client')
    .limit(RESULT_LIMIT)

  if (q) query = query.or(buildSafeOr(SEARCH_COLUMNS, q))
  if (activeFilter !== null) query = query.eq('active', activeFilter)

  const { data: clients } = await query
  const count = clients?.length ?? 0
  const hasFilters = q !== null || activeFilter !== null

  return (
    <div className="p-8">

      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="font-display text-2xl font-semibold text-ink">Clients</h1>
          <p className="text-sm text-ink-muted mt-1">
            {count} client{count !== 1 ? 's' : ''}
            {hasFilters ? ' trouvé' + (count !== 1 ? 's' : '') : ' enregistré' + (count !== 1 ? 's' : '')}
          </p>
        </div>
        <Link href="/admin/clients/new" className={buttonClasses('primary')}>
          <Plus size={16} />
          Nouveau client
        </Link>
      </div>

      <SearchFilters
        placeholder="Rechercher par nom, NINEA ou ville…"
        filters={[
          {
            param: 'active',
            label: 'Tous les statuts',
            options: [
              { value: 'true', label: 'Actifs' },
              { value: 'false', label: 'Inactifs' },
            ],
          },
        ]}
      />

      {/* Table */}
      <Card className="overflow-hidden">
        {!clients || clients.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <Users size={36} className="text-ink-muted mb-3" />
            <p className="text-sm font-medium text-ink-soft">
              {hasFilters ? 'Aucun client ne correspond aux filtres' : 'Aucun client enregistré'}
            </p>
            {!hasFilters && (
              <>
                <p className="text-xs text-ink-muted mt-1 mb-5">Commencez par ajouter votre premier client</p>
                <Link href="/admin/clients/new" className={buttonClasses('primary')}>
                  <Plus size={15} />
                  Ajouter un client
                </Link>
              </>
            )}
          </div>
        ) : (
          <table className="w-full">
            <thead>
              <tr className="bg-neutral-soft border-b border-line-subtle">
                <th className={TH}>Nom du client</th>
                <th className={TH}>NINEA</th>
                <th className={TH}>Ville</th>
                <th className={TH}>Statut</th>
                <th className="px-6 py-2.5" />
              </tr>
            </thead>
            <tbody className="divide-y divide-line-subtle">
              {clients.map((client) => (
                <tr key={client.id} className="hover:bg-neutral-soft transition-colors">
                  <td className="px-6 py-4 text-sm font-medium">
                    <Link
                      href={`/admin/clients/${client.id}`}
                      className="text-ink hover:text-accent transition-colors"
                    >
                      {client.nom_client}
                    </Link>
                  </td>
                  <td className="px-6 py-4 text-sm text-ink-muted font-mono">{client.ninea ?? '—'}</td>
                  <td className="px-6 py-4 text-sm text-ink-soft">{client.ville ?? '—'}</td>
                  <td className="px-6 py-4">
                    <Badge variant={client.active ? 'success' : 'neutral'}>
                      {client.active ? 'Actif' : 'Inactif'}
                    </Badge>
                  </td>
                  <td className="px-6 py-4 text-right">
                    <Link
                      href={`/admin/clients/${client.id}`}
                      className="text-sm font-medium text-accent hover:underline"
                    >
                      Modifier
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>
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
git add src/app/admin/clients/page.tsx
git commit -m "refactor(listados): clients usa Card + Badge + tokens"
```

---

## Task 7: machines/page.tsx

**Files:**
- Modify: `src/app/admin/machines/page.tsx`

- [ ] **Step 1: Reescribir el archivo completo**

```tsx
import { createClient } from '@/lib/supabase/server'
import Link from 'next/link'
import { Plus, QrCode } from 'lucide-react'
import SearchFilters from '@/components/admin/SearchFilters'
import { Card } from '@/components/ui/Card'
import { Badge } from '@/components/ui/Badge'
import { buttonClasses } from '@/components/ui/Button'
import {
  sanitizeSearchQuery,
  buildSafeOr,
  parseBooleanParam,
  firstParam,
} from '@/lib/search'
import { parseEnum, MACHINE_TYPES } from '@/lib/enums'

const SEARCH_COLUMNS = ['numero_serie', 'marque', 'modele'] as const
const RESULT_LIMIT = 200
const TH = 'text-left text-[10px] font-semibold text-ink-muted uppercase tracking-[0.06em] px-5 py-2.5'

type SearchParams = Promise<{ [key: string]: string | string[] | undefined }>

export default async function MachinesPage({ searchParams }: { searchParams: SearchParams }) {
  const sp = await searchParams
  const q = sanitizeSearchQuery(firstParam(sp.q))
  const typeFilter = parseEnum(firstParam(sp.type), MACHINE_TYPES)
  const activeFilter = parseBooleanParam(firstParam(sp.active))

  const supabase = await createClient()

  let query = supabase
    .from('machines')
    .select('*')
    .order('marque')
    .limit(RESULT_LIMIT)

  if (q) query = query.or(buildSafeOr(SEARCH_COLUMNS, q))
  if (typeFilter) query = query.eq('type', typeFilter)
  if (activeFilter !== null) query = query.eq('active', activeFilter)

  const { data: machines } = await query
  const hasFilters = q !== null || typeFilter !== null || activeFilter !== null

  return (
    <div className="p-8">
      <div className="flex items-center justify-between mb-8">
        <h1 className="font-display text-2xl font-semibold text-ink">Machines</h1>
        <Link href="/admin/machines/new" className={buttonClasses('primary')}>
          <Plus size={16} />
          Nouvelle machine
        </Link>
      </div>

      <SearchFilters
        placeholder="Rechercher par nº série, marque ou modèle…"
        filters={[
          {
            param: 'type',
            label: 'Tous les types',
            options: [
              { value: 'color', label: 'Couleur' },
              { value: 'noir_blanc', label: 'N&B' },
            ],
          },
          {
            param: 'active',
            label: 'Tous les statuts',
            options: [
              { value: 'true', label: 'Actives' },
              { value: 'false', label: 'Inactives' },
            ],
          },
        ]}
      />

      <Card className="overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-neutral-soft border-b border-line-subtle">
              <th className={TH}>Nº Série</th>
              <th className={TH}>Marque / Modèle</th>
              <th className={TH}>Type</th>
              <th className={TH}>Localisation</th>
              <th className={TH}>Statut</th>
              <th className="px-5 py-2.5" />
            </tr>
          </thead>
          <tbody className="divide-y divide-line-subtle">
            {(!machines || machines.length === 0) && (
              <tr>
                <td colSpan={6} className="px-5 py-10 text-center text-ink-muted">
                  {hasFilters ? 'Aucune machine ne correspond aux filtres' : 'Aucune machine enregistrée'}
                </td>
              </tr>
            )}
            {machines?.map((m) => {
              const href = `/admin/machines/${encodeURIComponent(m.numero_serie)}`
              return (
                <tr key={m.numero_serie} className="hover:bg-neutral-soft transition-colors">
                  <td className="px-5 py-4 font-mono text-xs">
                    <Link href={href} className="text-ink-soft hover:text-accent transition-colors">
                      {m.numero_serie}
                    </Link>
                  </td>
                  <td className="px-5 py-4">
                    <Link href={href} className="group inline-flex items-center">
                      <span className="font-medium text-ink group-hover:text-accent transition-colors">{m.marque}</span>
                      <span className="text-line mx-1.5">·</span>
                      <span className="text-ink-soft group-hover:text-accent transition-colors">{m.modele}</span>
                    </Link>
                  </td>
                  <td className="px-5 py-4">
                    <Badge variant={m.type === 'color' ? 'violet' : 'neutral'}>
                      {m.type === 'color' ? 'Couleur' : 'N&B'}
                    </Badge>
                  </td>
                  <td className="px-5 py-4 text-ink-soft">{m.localisation || '—'}</td>
                  <td className="px-5 py-4">
                    <Badge variant={m.active ? 'success' : 'neutral'}>
                      {m.active ? 'Active' : 'Inactive'}
                    </Badge>
                  </td>
                  <td className="px-5 py-4 text-right">
                    <div className="flex items-center justify-end gap-3">
                      <Link
                        href={`${href}/qr`}
                        target="_blank"
                        title="Télécharger QR code"
                        className="flex items-center justify-center w-8 h-8 rounded-lg border border-line text-ink-soft hover:text-ink hover:border-ink-muted transition-colors"
                      >
                        <QrCode size={15} />
                      </Link>
                      <Link
                        href={href}
                        className="text-sm font-medium text-ink-soft hover:text-ink"
                      >
                        Modifier
                      </Link>
                    </div>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </Card>
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
git add src/app/admin/machines/page.tsx
git commit -m "refactor(listados): machines usa Card + Badge + tokens"
```

---

## Task 8: contracts/page.tsx

**Files:**
- Modify: `src/app/admin/contracts/page.tsx`

- [ ] **Step 1: Reescribir el archivo completo**

```tsx
import { createClient } from '@/lib/supabase/server'
import Link from 'next/link'
import { Plus } from 'lucide-react'
import SearchFilters from '@/components/admin/SearchFilters'
import { Card } from '@/components/ui/Card'
import { Badge } from '@/components/ui/Badge'
import type { BadgeVariant } from '@/components/ui/Badge'
import { buttonClasses } from '@/components/ui/Button'
import {
  sanitizeSearchQuery,
  buildIlikePattern,
  buildSafeOr,
  firstParam,
} from '@/lib/search'
import { parseEnum, CONTRACT_STATUSES } from '@/lib/enums'

const RESULT_LIMIT = 200
// Límite holgado para el lookup intermedio de clientes que alimenta el filtro.
const LOOKUP_LIMIT = 1000
const TH = 'text-left text-[10px] font-semibold text-ink-muted uppercase tracking-[0.06em] px-5 py-2.5'

const STATUT: Record<string, { label: string; variant: BadgeVariant }> = {
  actif:    { label: 'Actif',    variant: 'success' },
  suspendu: { label: 'Suspendu', variant: 'warning' },
  terminé:  { label: 'Terminé',  variant: 'neutral' },
}

function formatDate(d: string | null) {
  if (!d) return '—'
  return new Date(d).toLocaleDateString('fr-FR')
}

type SearchParams = Promise<{ [key: string]: string | string[] | undefined }>

export default async function ContractsPage({ searchParams }: { searchParams: SearchParams }) {
  const sp = await searchParams
  const q = sanitizeSearchQuery(firstParam(sp.q))
  const statutFilter = parseEnum(firstParam(sp.statut), CONTRACT_STATUSES)

  const supabase = await createClient()

  let clientIds: number[] = []
  if (q) {
    const { data: matchedClients } = await supabase
      .from('clients')
      .select('id')
      .ilike('nom_client', buildIlikePattern(q))
      .limit(LOOKUP_LIMIT)
    clientIds = (matchedClients ?? [])
      .map((c) => c.id)
      .filter((id): id is number => typeof id === 'number')
  }

  let query = supabase
    .from('contracts')
    .select('id, numero_contrat, date_debut, date_renouvellement, lieu_installation, statut, client_id, clients(nom_client), machines(marque, modele)')
    .order('created_at', { ascending: false })
    .limit(RESULT_LIMIT)

  if (q) {
    const conditions = [buildSafeOr(['numero_contrat'], q)]
    if (clientIds.length > 0) {
      conditions.push(`client_id.in.(${clientIds.join(',')})`)
    }
    query = query.or(conditions.join(','))
  }
  if (statutFilter) query = query.eq('statut', statutFilter)

  const { data: contracts } = await query
  const hasFilters = q !== null || statutFilter !== null

  return (
    <div className="p-8">
      <div className="flex items-center justify-between mb-8">
        <h1 className="font-display text-2xl font-semibold text-ink">Contrats</h1>
        <Link href="/admin/contracts/new" className={buttonClasses('primary')}>
          <Plus size={16} />
          Nouveau contrat
        </Link>
      </div>

      <SearchFilters
        placeholder="Rechercher par nº contrat ou nom du client…"
        filters={[
          {
            param: 'statut',
            label: 'Tous les statuts',
            options: [
              { value: 'actif',    label: 'Actif' },
              { value: 'suspendu', label: 'Suspendu' },
              { value: 'terminé',  label: 'Terminé' },
            ],
          },
        ]}
      />

      <Card className="overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-neutral-soft border-b border-line-subtle">
              <th className={TH}>Nº Contrat</th>
              <th className={TH}>Client</th>
              <th className={TH}>Machine</th>
              <th className={TH}>Début</th>
              <th className={TH}>Renouvellement</th>
              <th className={TH}>Statut</th>
              <th className="px-5 py-2.5" />
            </tr>
          </thead>
          <tbody className="divide-y divide-line-subtle">
            {(!contracts || contracts.length === 0) && (
              <tr>
                <td colSpan={7} className="px-5 py-10 text-center text-ink-muted">
                  {hasFilters ? 'Aucun contrat ne correspond aux filtres' : 'Aucun contrat enregistré'}
                </td>
              </tr>
            )}
            {contracts?.map((c) => {
              const client  = c.clients  as unknown as { nom_client: string } | null
              const machine = c.machines as unknown as { marque: string; modele: string } | null
              const statut = STATUT[c.statut]
              const href = `/admin/contracts/${c.id}`
              return (
                <tr key={c.id} className="hover:bg-neutral-soft transition-colors">
                  <td className="px-5 py-4 font-mono text-xs">
                    <Link href={href} className="text-ink-soft hover:text-accent transition-colors">
                      {c.numero_contrat}
                    </Link>
                  </td>
                  <td className="px-5 py-4 font-medium">
                    {client ? (
                      <Link href={href} className="text-ink hover:text-accent transition-colors">
                        {client.nom_client}
                      </Link>
                    ) : (
                      <span className="text-ink-muted">—</span>
                    )}
                  </td>
                  <td className="px-5 py-4 text-ink-soft">
                    {machine ? `${machine.marque} ${machine.modele}` : '—'}
                  </td>
                  <td className="px-5 py-4 text-ink-soft">{formatDate(c.date_debut)}</td>
                  <td className="px-5 py-4 text-ink-soft">{formatDate(c.date_renouvellement)}</td>
                  <td className="px-5 py-4">
                    {statut
                      ? <Badge variant={statut.variant}>{statut.label}</Badge>
                      : <span className="text-xs text-ink-muted">{c.statut}</span>}
                  </td>
                  <td className="px-5 py-4 text-right">
                    <Link
                      href={href}
                      className="text-sm font-medium text-ink-soft hover:text-ink"
                    >
                      Modifier
                    </Link>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </Card>
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
git add src/app/admin/contracts/page.tsx
git commit -m "refactor(listados): contracts usa Card + Badge + tokens"
```

---

## Task 9: incidents/page.tsx

**Files:**
- Modify: `src/app/admin/incidents/page.tsx`

Solo se migran el header y el aviso de truncación. La lógica de datos y el render delegado (`KanbanBoard` / `IncidentsListView`) no cambian.

- [ ] **Step 1: Reescribir el archivo completo**

```tsx
import { createClient } from '@/lib/supabase/server'
import Link from 'next/link'
import { Plus } from 'lucide-react'
import KanbanBoard from '@/components/admin/KanbanBoard'
import SearchFilters from '@/components/admin/SearchFilters'
import ViewToggle from '@/components/admin/ViewToggle'
import IncidentsListView, { type IncidentRow } from '@/components/admin/IncidentsListView'
import { buttonClasses } from '@/components/ui/Button'
import {
  sanitizeSearchQuery,
  buildSafeOr,
  firstParam,
  parsePositiveIntParam,
} from '@/lib/search'
import { parseEnum, INCIDENT_STATUSES, INCIDENT_PRIORITIES } from '@/lib/enums'

const SEARCH_COLUMNS = ['numero_incident', 'title', 'machine_id'] as const
const RESULT_LIMIT = 300

type SearchParams = Promise<{ [key: string]: string | string[] | undefined }>

export default async function IncidentsPage({ searchParams }: { searchParams: SearchParams }) {
  const sp = await searchParams
  const q = sanitizeSearchQuery(firstParam(sp.q))
  const clientId = parsePositiveIntParam(sp.client)
  const statusFilter = parseEnum(firstParam(sp.status), INCIDENT_STATUSES)
  const priorityFilter = parseEnum(firstParam(sp.priority), INCIDENT_PRIORITIES)
  const view = firstParam(sp.view) === 'list' ? 'list' : 'kanban'

  const supabase = await createClient()

  // Cargar listas en paralelo (clientes para el dropdown).
  const [clientsRes, contractIdsRes] = await Promise.all([
    supabase.from('clients').select('id, nom_client').order('nom_client'),
    clientId
      ? supabase.from('contracts').select('id').eq('client_id', clientId)
      : Promise.resolve({ data: null }),
  ])

  let query = supabase
    .from('incidents')
    .select(`
      id, numero_incident, title, category, priority, status, machine_id, created_at, contract_id, assigned_to,
      contracts(client_id, clients(nom_client)),
      profiles!assigned_to(full_name)
    `)
    .order('created_at', { ascending: false })
    .limit(RESULT_LIMIT)

  if (q) query = query.or(buildSafeOr(SEARCH_COLUMNS, q))
  if (statusFilter) query = query.eq('status', statusFilter)
  if (priorityFilter) query = query.eq('priority', priorityFilter)
  if (clientId) {
    // .in() con array vacío genera 0 resultados (cliente sin contratos).
    const ids = (contractIdsRes.data ?? []).map((c) => c.id)
    query = query.in('contract_id', ids)
  }

  const { data: incidents } = await query
  const truncated = (incidents?.length ?? 0) >= RESULT_LIMIT

  // Transformación a filas planas para los dos renderizados.
  type Row = NonNullable<typeof incidents>[number] & {
    contracts: { client_id: number; clients: { nom_client: string } | null } | null
    profiles: { full_name: string | null } | null
  }
  const rows = ((incidents ?? []) as unknown as Row[]).map((inc) => ({
    id: inc.id,
    numero_incident: inc.numero_incident,
    title: inc.title,
    status: inc.status,
    priority: inc.priority,
    category: inc.category,
    machine_id: inc.machine_id,
    created_at: inc.created_at,
    clientName: inc.contracts?.clients?.nom_client ?? null,
    technicianName: inc.profiles?.full_name ?? null,
  }))

  const kanbanIncidents = rows.map((r) => ({
    id: r.id,
    numero_incident: r.numero_incident,
    title: r.title,
    machine_id: r.machine_id,
    category: r.category,
    priority: r.priority,
    status: r.status,
  }))

  const listIncidents: IncidentRow[] = rows.map((r) => ({
    id: r.id,
    numero_incident: r.numero_incident,
    title: r.title,
    status: r.status,
    priority: r.priority,
    machine_id: r.machine_id,
    created_at: r.created_at,
    clientName: r.clientName,
    technicianName: r.technicianName,
  }))

  const clientOptions = (clientsRes.data ?? []).map((c) => ({
    value: String(c.id),
    label: c.nom_client,
  }))

  return (
    <div className="p-8 flex flex-col min-h-full">
      <div className="flex items-center justify-between mb-6">
        <h1 className="font-display text-2xl font-semibold text-ink">Incidents SAV</h1>
        <div className="flex items-center gap-3">
          <ViewToggle defaultView="kanban" />
          <Link href="/admin/incidents/new" className={buttonClasses('primary')}>
            <Plus size={16} />
            Nouvel incident
          </Link>
        </div>
      </div>

      <SearchFilters
        placeholder="Rechercher par nº incident, titre ou nº série…"
        filters={[
          {
            param: 'client',
            label: 'Tous les clients',
            options: clientOptions,
          },
          {
            param: 'status',
            label: 'Tous les statuts',
            options: [
              { value: 'nouveau',  label: 'Nouveau'  },
              { value: 'assigné',  label: 'Assigné'  },
              { value: 'en_cours', label: 'En cours' },
              { value: 'résolu',   label: 'Résolu'   },
              { value: 'fermé',    label: 'Fermé'    },
            ],
          },
          {
            param: 'priority',
            label: 'Toutes les priorités',
            options: [
              { value: 'urgente', label: 'Urgente' },
              { value: 'haute',   label: 'Haute'   },
              { value: 'normale', label: 'Normale' },
              { value: 'basse',   label: 'Basse'   },
            ],
          },
        ]}
      />

      {truncated && (
        <p className="text-xs text-warning bg-warning-soft border border-warning/30 rounded-lg px-3 py-2 mb-4">
          Affichage limité aux {RESULT_LIMIT} premiers incidents. Affinez votre recherche pour voir le reste.
        </p>
      )}

      {view === 'list' ? (
        <IncidentsListView incidents={listIncidents} />
      ) : (
        <KanbanBoard incidents={kanbanIncidents} />
      )}
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
git add src/app/admin/incidents/page.tsx
git commit -m "refactor(listados): incidents header y truncación usan tokens"
```

---

## Task 10: maintenance/page.tsx

**Files:**
- Modify: `src/app/admin/maintenance/page.tsx`

- [ ] **Step 1: Reescribir el archivo completo**

```tsx
import { createClient } from '@/lib/supabase/server'
import Link from 'next/link'
import { Plus, Clock, AlertTriangle, Wrench } from 'lucide-react'
import SearchFilters from '@/components/admin/SearchFilters'
import { Card } from '@/components/ui/Card'
import { Badge } from '@/components/ui/Badge'
import type { BadgeVariant } from '@/components/ui/Badge'
import { buttonClasses } from '@/components/ui/Button'
import {
  sanitizeSearchQuery,
  buildIlikePattern,
  firstParam,
} from '@/lib/search'
import { parseEnum, MAINTENANCE_FREQUENCIES, VISIT_STATUSES } from '@/lib/enums'

const RESULT_LIMIT = 300
// Límite holgado para lookups intermedios que alimentan filtros: si truncaran,
// el filtro de búsqueda devolvería resultados incompletos sin avisar.
const LOOKUP_LIMIT = 1000
const TH = 'text-left text-[10px] font-semibold text-ink-muted uppercase tracking-[0.06em] px-5 py-2.5'

const FREQ_LABEL: Record<string, string> = {
  mensuel:     'Mensuel',
  trimestriel: 'Trimestriel',
}

const STATUS = {
  fait:      { label: 'Fait',      variant: 'success' as BadgeVariant },
  planifié:  { label: 'Planifié',  variant: 'info'    as BadgeVariant },
  en_retard: { label: 'En retard', variant: 'danger'  as BadgeVariant },
}

type SearchParams = Promise<{ [key: string]: string | string[] | undefined }>

export default async function MaintenancePage({ searchParams }: { searchParams: SearchParams }) {
  const sp = await searchParams
  const q = sanitizeSearchQuery(firstParam(sp.q))
  const frequencyFilter = parseEnum(firstParam(sp.frequency), MAINTENANCE_FREQUENCIES)
  const statusFilter = parseEnum(firstParam(sp.status), VISIT_STATUSES)

  const supabase = await createClient()

  // 1. Si hay búsqueda: resolver contratos que matchean (nº contrato o nombre cliente).
  let contractIdFilter: string[] | null = null
  if (q) {
    const pattern = buildIlikePattern(q)
    const [{ data: matchedClients }, { data: matchedContracts }] = await Promise.all([
      supabase
        .from('clients')
        .select('id')
        .ilike('nom_client', pattern)
        .limit(LOOKUP_LIMIT),
      supabase
        .from('contracts')
        .select('id')
        .ilike('numero_contrat', pattern)
        .limit(LOOKUP_LIMIT),
    ])
    const clientIds = (matchedClients ?? []).map((c) => c.id).filter((id): id is number => typeof id === 'number')
    const contractIdsFromNumero = (matchedContracts ?? []).map((c) => c.id).filter((id): id is string => typeof id === 'string')

    let contractIdsFromClients: string[] = []
    if (clientIds.length > 0) {
      const { data } = await supabase
        .from('contracts')
        .select('id')
        .in('client_id', clientIds)
        .limit(LOOKUP_LIMIT)
      contractIdsFromClients = (data ?? []).map((c) => c.id).filter((id): id is string => typeof id === 'string')
    }

    contractIdFilter = Array.from(new Set([...contractIdsFromNumero, ...contractIdsFromClients]))
  }

  // 2. Query principal.
  let plansQuery = supabase
    .from('maintenance_plans')
    .select(`
      id, frequency, active, notes,
      contracts (
        id, numero_contrat,
        clients   ( nom_client ),
        machines  ( numero_serie, marque, modele )
      ),
      maintenance_visits (
        id, scheduled_date, status, done_at
      )
    `)
    .order('created_at', { ascending: false })
    .limit(RESULT_LIMIT)

  if (frequencyFilter) plansQuery = plansQuery.eq('frequency', frequencyFilter)
  if (contractIdFilter !== null) {
    // .in() con array vacío genera 0 resultados (búsqueda sin contratos coincidentes).
    plansQuery = plansQuery.in('contract_id', contractIdFilter)
  }

  const { data: plans } = await plansQuery
  // El statusFilter se aplica client-side después del límite, así que el aviso
  // de truncación solo es fiable y no engañoso cuando no hay filtro de status.
  const plansTruncated = !statusFilter && (plans?.length ?? 0) >= RESULT_LIMIT

  // 3. Construir rows y aplicar filtro de status de la próxima visita (cliente).
  const allRows = (plans ?? []).map((p) => {
    const contract = p.contracts as unknown as {
      id: string; numero_contrat: string
      clients:  { nom_client: string }
      machines: { numero_serie: string; marque: string; modele: string }
    }
    const visits = (p.maintenance_visits ?? []) as {
      id: string; scheduled_date: string; status: string; done_at: string | null
    }[]
    const nextVisit = visits
      .filter((v) => v.status !== 'fait')
      .sort((a, b) => a.scheduled_date.localeCompare(b.scheduled_date))[0] ?? null
    const lastDone = visits
      .filter((v) => v.status === 'fait')
      .sort((a, b) => b.scheduled_date.localeCompare(a.scheduled_date))[0] ?? null
    return { plan: p, contract, visits, nextVisit, lastDone }
  })

  const rows = statusFilter
    ? allRows.filter((r) => {
        // "fait" = el plan tiene al menos una visita realizada (independiente de pendientes).
        // "planifié" / "en_retard" = estado de la próxima visita pendiente.
        if (statusFilter === 'fait') return r.lastDone !== null
        return r.nextVisit?.status === statusFilter
      })
    : allRows

  const totalPlans  = rows.length
  const overdue     = rows.filter((r) => r.nextVisit?.status === 'en_retard').length
  const dueThisWeek = rows.filter((r) => {
    if (!r.nextVisit || r.nextVisit.status !== 'planifié') return false
    const diff = (new Date(r.nextVisit.scheduled_date).getTime() - Date.now()) / 86400000
    return diff >= 0 && diff <= 7
  }).length

  const hasFilters = q !== null || frequencyFilter !== null || statusFilter !== null

  return (
    <div className="p-8 space-y-6">

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-display text-2xl font-semibold text-ink">
            Maintenance préventive
          </h1>
          <p className="text-sm text-ink-muted mt-0.5">
            {totalPlans} plan{totalPlans !== 1 ? 's' : ''}
            {hasFilters ? ' trouvé' + (totalPlans !== 1 ? 's' : '') : ' actif' + (totalPlans !== 1 ? 's' : '')}
            {overdue > 0 && <span className="ml-2 text-accent font-medium">· {overdue} en retard</span>}
            {dueThisWeek > 0 && <span className="ml-2 text-warning font-medium">· {dueThisWeek} cette semaine</span>}
          </p>
        </div>
        <Link href="/admin/maintenance/new" className={buttonClasses('primary')}>
          <Plus size={16} />
          Nouveau plan
        </Link>
      </div>

      <SearchFilters
        placeholder="Rechercher par client ou nº contrat…"
        filters={[
          {
            param: 'frequency',
            label: 'Toutes les fréquences',
            options: [
              { value: 'mensuel',     label: 'Mensuel'     },
              { value: 'trimestriel', label: 'Trimestriel' },
            ],
          },
          {
            param: 'status',
            label: 'Tous les statuts',
            options: [
              { value: 'planifié',  label: 'Planifié'  },
              { value: 'en_retard', label: 'En retard' },
              { value: 'fait',      label: 'Fait'      },
            ],
          },
        ]}
      />

      {plansTruncated && (
        <p className="text-xs text-warning bg-warning-soft border border-warning/30 rounded-lg px-3 py-2">
          Affichage limité aux {RESULT_LIMIT} premiers plans. Affinez votre recherche pour voir le reste.
        </p>
      )}

      {/* KPI strip */}
      <div className="grid grid-cols-3 gap-4">
        {[
          { label: 'Plans',              value: totalPlans,  icon: Wrench,         color: 'text-ink'     },
          { label: 'En retard',          value: overdue,     icon: AlertTriangle,  color: 'text-accent'  },
          { label: 'À faire cette sem.', value: dueThisWeek, icon: Clock,          color: 'text-warning' },
        ].map(({ label, value, icon: Icon, color }) => (
          <Card key={label} className="p-4 flex items-center gap-3">
            <Icon size={18} className={`${color} shrink-0`} />
            <div>
              <p className="text-xs text-ink-muted">{label}</p>
              <p className={`text-xl font-semibold ${color}`}>{value}</p>
            </div>
          </Card>
        ))}
      </div>

      {/* Lista */}
      {rows.length === 0 ? (
        <Card className="flex items-center justify-center py-20">
          <p className="text-sm text-ink-muted">
            {hasFilters ? 'Aucun plan ne correspond aux filtres' : 'Aucun plan de maintenance enregistré'}
          </p>
        </Card>
      ) : (
        <Card className="overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-neutral-soft border-b border-line-subtle">
                <th className={TH}>Client / Machine</th>
                <th className={TH}>Contrat</th>
                <th className={TH}>Fréquence</th>
                <th className={TH}>Prochaine visite</th>
                <th className={TH}>Dernière faite</th>
                <th className={TH}>Statut</th>
                <th className="px-5 py-2.5" />
              </tr>
            </thead>
            <tbody className="divide-y divide-line-subtle">
              {rows.map(({ plan, contract, nextVisit, lastDone }) => {
                const href = `/admin/maintenance/${plan.id}`
                const overdueRow = nextVisit?.status === 'en_retard'
                const statusKey = nextVisit?.status ?? (lastDone ? 'fait' : 'planifié')
                const status = STATUS[statusKey as keyof typeof STATUS] ?? STATUS.planifié
                return (
                  <tr key={plan.id} className="hover:bg-neutral-soft transition-colors">
                    <td className="px-5 py-3.5">
                      <Link href={href} className="font-medium text-ink hover:text-accent transition-colors">
                        {contract.clients.nom_client}
                      </Link>
                      <p className="text-xs text-ink-muted font-mono mt-0.5">
                        {contract.machines.marque} {contract.machines.modele}
                      </p>
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
                        <span className={overdueRow ? 'text-accent font-semibold' : 'text-ink-soft'}>
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
                      <Link
                        href={href}
                        className="text-xs font-medium text-ink-soft hover:text-ink"
                      >
                        Détail →
                      </Link>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </Card>
      )}
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
git add src/app/admin/maintenance/page.tsx
git commit -m "refactor(listados): maintenance usa Card + Badge + tokens"
```

---

## Task 11: contadores/page.tsx

**Files:**
- Modify: `src/app/admin/contadores/page.tsx`

- [ ] **Step 1: Reescribir el archivo completo**

```tsx
import { createClient } from '@/lib/supabase/server'
import Link from 'next/link'
import { AlertTriangle, Building2, ChevronRight, Printer } from 'lucide-react'
import { MONTHS_FR, MONTHS_FR_LONG } from './constants'
import SearchFilters from '@/components/admin/SearchFilters'
import { Card } from '@/components/ui/Card'
import { sanitizeSearchQuery, firstParam } from '@/lib/search'

interface Machine {
  numero_serie: string
  marque:       string
  modele:       string
  clientId:     number | null
  clientName:   string | null
}

const MIN_YEAR = 2020
const MAX_YEAR = 2100

function parseMonthParam(value: string | null): number | null {
  if (value === null) return null
  if (!/^[0-9]{1,2}$/.test(value)) return null
  const n = Number(value)
  return Number.isInteger(n) && n >= 1 && n <= 12 ? n : null
}

function parseYearParam(value: string | null): number | null {
  if (value === null) return null
  if (!/^[0-9]{4}$/.test(value)) return null
  const n = Number(value)
  return Number.isInteger(n) && n >= MIN_YEAR && n <= MAX_YEAR ? n : null
}

function buildYearOptions(): { value: string; label: string }[] {
  const current = new Date().getFullYear()
  const years: number[] = []
  for (let y = current; y >= current - 5; y--) years.push(y)
  return years.map((y) => ({ value: String(y), label: String(y) }))
}

function buildMonthOptions(): { value: string; label: string }[] {
  return Array.from({ length: 12 }, (_, i) => ({
    value: String(i + 1),
    label: MONTHS_FR_LONG[i + 1],
  }))
}

type SearchParams = Promise<{ [key: string]: string | string[] | undefined }>

export default async function ContadoresPage({ searchParams }: { searchParams: SearchParams }) {
  const sp = await searchParams
  const q = sanitizeSearchQuery(firstParam(sp.q))
  const monthFilter = parseMonthParam(firstParam(sp.month))
  const yearFilter  = parseYearParam(firstParam(sp.year))

  const supabase = await createClient()

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

  // Set de pares (machine_id, year, month) presentes para chequeo exacto.
  const presence = new Set<string>()
  // También trackeamos la última lectura por máquina para mostrar "Dernier".
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

  const now    = new Date()
  const cYear  = yearFilter  ?? now.getFullYear()
  const cMonth = monthFilter ?? now.getMonth() + 1
  const periodLabel = `${MONTHS_FR_LONG[cMonth]} ${cYear}`
  const isCustomPeriod = monthFilter !== null || yearFilter !== null

  const machines: Machine[] = (rawMachines ?? []).map((m) => {
    const contracts = m.contracts as unknown as {
      statut: string
      client_id: number | null
      clients: { id: number; nom_client: string } | null
    }[] | null
    const active = contracts?.find((c) => c.statut === 'actif') ?? null
    return {
      numero_serie: m.numero_serie,
      marque:       m.marque,
      modele:       m.modele,
      clientId:     active?.client_id ?? null,
      clientName:   active?.clients?.nom_client ?? null,
    }
  })

  // Agrupar por cliente
  const clientMap = new Map<number, { name: string; machines: Machine[] }>()
  const noClient: Machine[] = []
  machines.forEach((m) => {
    if (m.clientId !== null && m.clientName !== null) {
      if (!clientMap.has(m.clientId)) {
        clientMap.set(m.clientId, { name: m.clientName, machines: [] })
      }
      clientMap.get(m.clientId)!.machines.push(m)
    } else {
      noClient.push(m)
    }
  })

  let clientGroups = [...clientMap.entries()]
    .map(([id, { name, machines }]) => ({ id, name, machines }))
    .sort((a, b) => a.name.localeCompare(b.name))

  // Filtro de búsqueda (cliente): coincidencia case-insensitive sobre el nombre ya cargado.
  if (q) {
    const needle = q.toLowerCase()
    clientGroups = clientGroups.filter((g) => g.name.toLowerCase().includes(needle))
  }

  // Una máquina está "manquant" si NO existe relevé activo para (year, month).
  const missingCount = (ms: Machine[]) =>
    ms.filter((m) => !presence.has(`${m.numero_serie}|${cYear}|${cMonth}`)).length

  // clientGroups ya está filtrado por la búsqueda: cuando hay un cliente buscado,
  // estos totales del cabecero reflejan solo el subset visible. Es intencional.
  const totalMachines = clientGroups.reduce((acc, g) => acc + g.machines.length, 0)
  const totalMissing  = clientGroups.reduce((acc, g) => acc + missingCount(g.machines), 0)
  const hasFilters    = q !== null || monthFilter !== null || yearFilter !== null

  return (
    <div className="p-8">
      <div className="flex items-start justify-between mb-6">
        <div>
          <h1 className="font-display text-2xl font-semibold text-ink">
            Compteurs
          </h1>
          <p className="text-sm text-ink-muted mt-0.5">
            {clientGroups.length} client{clientGroups.length !== 1 ? 's' : ''} · {totalMachines} machine{totalMachines !== 1 ? 's' : ''}
            {isCustomPeriod && <span className="ml-2 text-ink-soft">· période : {periodLabel}</span>}
            {totalMissing > 0 && (
              <span className="ml-2 text-warning font-medium">
                · {totalMissing} relevé{totalMissing !== 1 ? 's' : ''} manquant{totalMissing !== 1 ? 's' : ''}
              </span>
            )}
          </p>
        </div>
      </div>

      <SearchFilters
        placeholder="Rechercher un client…"
        filters={[
          { param: 'month', label: 'Tous les mois', options: buildMonthOptions() },
          { param: 'year',  label: 'Toutes les années', options: buildYearOptions() },
        ]}
      />

      {/* Con búsqueda activa la tarjeta "Sans contrat actif" se oculta, así que
          no debe contar como contenido visible para evaluar el empty-state. */}
      {clientGroups.length === 0 && (q !== null || noClient.length === 0) ? (
        <Card className="flex items-center justify-center py-20">
          <p className="text-sm text-ink-muted">
            {hasFilters ? 'Aucun client ne correspond aux filtres' : 'Aucune machine active enregistrée'}
          </p>
        </Card>
      ) : (
        <div className="space-y-3">
          {clientGroups.map((group) => {
            const missing = missingCount(group.machines)
            const allGood = missing === 0
            return (
              <Link key={group.id} href={`/admin/contadores/cliente/${group.id}`} className="block group">
                <Card className="flex items-center justify-between px-5 py-4 hover:shadow-raised transition-shadow">
                  <div className="flex items-center gap-4">
                    <div className="w-10 h-10 rounded-xl bg-accent-soft flex items-center justify-center shrink-0">
                      <Building2 size={18} className="text-accent" />
                    </div>
                    <div>
                      <p className="text-sm font-semibold text-ink group-hover:text-accent transition-colors">{group.name}</p>
                      <div className="flex items-center gap-3 mt-0.5">
                        <span className="flex items-center gap-1 text-xs text-ink-muted">
                          <Printer size={11} />
                          {group.machines.length} machine{group.machines.length !== 1 ? 's' : ''}
                        </span>
                        <span className="text-xs text-line">·</span>
                        <span className="text-xs text-ink-muted">
                          Dernier : {(() => {
                            const lasts = group.machines
                              .map((m) => latestMap.get(m.numero_serie))
                              .filter((l): l is { year: number; month: number } => l !== undefined)
                            if (!lasts.length) return 'aucun relevé'
                            const l = lasts.sort((a, b) => a.year !== b.year ? b.year - a.year : b.month - a.month)[0]
                            return `${MONTHS_FR[l.month]} ${l.year}`
                          })()}
                        </span>
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-4">
                    {!allGood ? (
                      <div className="flex items-center gap-1.5 text-warning">
                        <AlertTriangle size={14} />
                        <span className="text-xs font-medium">
                          {missing} {isCustomPeriod ? `manque(s) en ${MONTHS_FR[cMonth]}` : 'en attente'}
                        </span>
                      </div>
                    ) : (
                      <span className="text-xs font-medium text-success">
                        ✓ À jour{isCustomPeriod ? ` (${MONTHS_FR[cMonth]} ${cYear})` : ''}
                      </span>
                    )}
                    <ChevronRight size={16} className="text-ink-muted group-hover:text-ink-soft transition-colors" />
                  </div>
                </Card>
              </Link>
            )
          })}

          {/* Machines sans contrat actif — solo cuando no hay búsqueda activa */}
          {!q && noClient.length > 0 && (
            <Card className="flex items-center justify-between px-5 py-4 opacity-70 border-dashed">
              <div className="flex items-center gap-4">
                <div className="w-10 h-10 rounded-xl bg-neutral-soft flex items-center justify-center shrink-0">
                  <Printer size={18} className="text-ink-muted" />
                </div>
                <div>
                  <p className="text-sm font-medium text-ink-soft">Sans contrat actif</p>
                  <p className="text-xs text-ink-muted mt-0.5">
                    {noClient.length} machine{noClient.length !== 1 ? 's' : ''} sans client assigné
                  </p>
                </div>
              </div>
            </Card>
          )}
        </div>
      )}
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
git add src/app/admin/contadores/page.tsx
git commit -m "refactor(listados): contadores usa Card + tokens"
```

---

## Task 12: Verificación de build, PR y merge

- [ ] **Step 1: Build completo**

```bash
cd "/Users/juanmiguel/Claude/Web AMD Codex/web-amd" && npx tsc --noEmit && npm run build
```

Esperado: 0 errores TypeScript · build exitoso, sin warnings nuevos.

- [ ] **Step 2: Push**

```bash
git push -u origin feat/rediseno-bloque-1c-listados
```

- [ ] **Step 3: Abrir PR**

```bash
gh pr create \
  --title "refactor(ui): bloque 1c — rediseño Listados /admin" \
  --body "$(cat <<'EOF'
## Summary
- Variante `violet` añadida al `Badge` de Fase 0 (+ tokens `--color-violet` / `--color-violet-soft`)
- 6 páginas de listado (clients, machines, contracts, incidents, maintenance, contadores) migradas a tokens + `Card` + `Badge`
- Componentes compartidos `SearchFilters`, `ViewToggle`, `IncidentsListView` migrados a tokens
- Kanban (`KanbanBoard`) migrado a tokens + `Badge` para la prioridad
- Badges de estado unificados al sistema de variantes en todas las páginas
- Indicador activo/inactivo unificado (mismo `Badge` en clients y machines)
- Sin cambios en lógica, queries, Server Actions ni filtros

## Test plan
- [x] `npx tsc --noEmit` limpio
- [x] `npm run build` sin errores nuevos
- [ ] Validación visual local en las 6 páginas de `/admin`
- [ ] Verificar que el drag & drop del Kanban sigue funcionando
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

- [ ] **Step 5: Verificar deploy** en `https://amd-service.vercel.app/admin`.
