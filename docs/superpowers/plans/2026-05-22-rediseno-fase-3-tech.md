# Rediseño UI Híbrido — Fase 3: `/tech` PWA

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Migrar los 15 archivos de `src/app/tech/` y los 3 componentes de `src/components/tech/` al sistema de diseño Híbrido: chrome oscuro en nav/sidebar, superficie clara con tokens Tailwind v4 en páginas, componentes `Card` y `Badge`.

**Architecture:** Migración puramente visual — no cambia lógica, Server Actions ni rutas. Chrome (`bg-chrome`, `border-chrome-line`, `text-chrome-fg`) para nav/sidebar; tokens de contenido (`bg-page`, `bg-card`, `border-line`, `text-ink`) para páginas; `Badge` para todos los estados de incidencias.

**Tech Stack:** Next.js 16 App Router, Tailwind CSS v4 (tokens @theme en `globals.css`), componentes en `src/components/ui/` (`Card`, `Badge`).

**Spec:** `docs/superpowers/specs/2026-05-22-rediseno-fase-3-tech.md`

---

## Mapa de archivos

| Archivo | Acción |
|---|---|
| `src/app/tech/layout.tsx` | Modificar |
| `src/app/tech/tech-nav.tsx` | Modificar |
| `src/app/tech/tech-desktop-sidebar.tsx` | Modificar |
| `src/app/tech/page.tsx` | Modificar |
| `src/app/tech/incidents/page.tsx` | Modificar |
| `src/components/tech/TechIncidentList.tsx` | Modificar |
| `src/app/tech/incidents/[id]/intervention-form.tsx` | Modificar |
| `src/app/tech/machines/page.tsx` | Modificar |
| `src/app/tech/planning/page.tsx` | Modificar |
| `src/app/tech/scan/page.tsx` | Modificar |
| `src/app/tech/scan/[serie]/page.tsx` | Modificar |
| `src/components/tech/MaintenanceVisitForm.tsx` | Modificar |
| `src/components/tech/AgendaPanel.tsx` | Modificar |

**No modificar:** `qr-scanner.tsx`, `scan/[serie]/maintenance/[visitId]/page.tsx`, `incidents/[id]/page.tsx`

---

## Task 1: Git setup + Chrome shell — `layout.tsx`

**Files:**
- Modify: `src/app/tech/layout.tsx`

- [ ] **Step 1: Crear rama de trabajo**

```bash
cd /Users/juanmiguel/Claude/Web\ AMD\ Codex/web-amd
git checkout main && git pull
git checkout -b refactor/tech-fase3-design-tokens
```

- [ ] **Step 2: Escribir `layout.tsx`**

```tsx
import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { QrCode } from 'lucide-react'
import TechNav from './tech-nav'
import TechDesktopSidebar from './tech-desktop-sidebar'
import TechAgendaPanel from '@/components/tech/AgendaPanel'

export default async function TechLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('profiles')
    .select('role, full_name')
    .eq('id', user.id)
    .single()

  if (profile?.role !== 'technician') redirect('/dashboard')

  return (
    <div className="min-h-screen bg-page">
      <div className="hidden lg:block">
        <TechDesktopSidebar fullName={profile?.full_name ?? null} />
      </div>
      <main className="lg:ml-64 xl:mr-72">
        <div className="max-w-lg mx-auto lg:max-w-none pb-20 lg:pb-0">
          {children}
        </div>
      </main>
      <div className="hidden xl:block">
        <TechAgendaPanel />
      </div>
      <div className="lg:hidden fixed bottom-16 left-0 right-0 flex justify-center px-4 z-40 pointer-events-none">
        <Link
          href="/tech/scan"
          className="pointer-events-auto flex items-center gap-2 px-6 py-3.5 rounded-full text-white text-sm font-semibold bg-accent shadow-raised"
        >
          <QrCode size={20} />
          Scanner une machine
        </Link>
      </div>
      <div className="lg:hidden">
        <TechNav />
      </div>
    </div>
  )
}
```

- [ ] **Step 3: Verificar TypeScript**

```bash
cd /Users/juanmiguel/Claude/Web\ AMD\ Codex/web-amd
npx tsc --noEmit 2>&1 | head -20
```
Esperado: 0 errores (o errores preexistentes sin relación con este archivo).

- [ ] **Step 4: Commit**

```bash
git add src/app/tech/layout.tsx
git commit -m "refactor(tech): chrome shell bg-page + FAB bg-accent"
```

---

## Task 2: Bottom nav — `tech-nav.tsx`

**Files:**
- Modify: `src/app/tech/tech-nav.tsx`

- [ ] **Step 1: Escribir `tech-nav.tsx`**

```tsx
'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { LayoutDashboard, AlertCircle, Printer, CalendarDays } from 'lucide-react'

const NAV = [
  { href: '/tech',           label: 'Accueil',   icon: LayoutDashboard, exact: true },
  { href: '/tech/incidents', label: 'Incidents',  icon: AlertCircle },
  { href: '/tech/machines',  label: 'Machines',   icon: Printer },
  { href: '/tech/planning',  label: 'Planning',   icon: CalendarDays },
]

export default function TechNav() {
  const pathname = usePathname()

  return (
    <nav className="fixed bottom-0 left-0 right-0 max-w-lg mx-auto bg-chrome border-t border-chrome-line z-10">
      <div className="grid grid-cols-4 h-16">
        {NAV.map(({ href, label, icon: Icon, exact }) => {
          const active = exact ? pathname === href : pathname.startsWith(href)
          return (
            <Link
              key={href}
              href={href}
              className={`flex flex-col items-center justify-center gap-1 text-xs font-medium transition-colors ${
                active ? 'text-accent' : 'text-chrome-fg hover:text-chrome-fg-strong'
              }`}
            >
              <Icon size={20} strokeWidth={active ? 2.5 : 1.75} />
              {label}
            </Link>
          )
        })}
      </div>
    </nav>
  )
}
```

- [ ] **Step 2: Verificar TypeScript**

```bash
npx tsc --noEmit 2>&1 | head -20
```

- [ ] **Step 3: Commit**

```bash
git add src/app/tech/tech-nav.tsx
git commit -m "refactor(tech): bottom nav chrome oscura"
```

---

## Task 3: Desktop sidebar — `tech-desktop-sidebar.tsx`

**Files:**
- Modify: `src/app/tech/tech-desktop-sidebar.tsx`

- [ ] **Step 1: Escribir `tech-desktop-sidebar.tsx`**

```tsx
'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { LayoutDashboard, AlertCircle, Printer, LogOut, CalendarDays } from 'lucide-react'
import { signOut } from '@/app/login/actions'

const NAV = [
  { href: '/tech',           label: 'Tableau de bord',   icon: LayoutDashboard, exact: true },
  { href: '/tech/incidents', label: 'Mes interventions', icon: AlertCircle },
  { href: '/tech/machines',  label: 'Machines',          icon: Printer },
  { href: '/tech/planning',  label: 'Planning',          icon: CalendarDays },
]

export default function TechDesktopSidebar({ fullName }: { fullName: string | null }) {
  const pathname = usePathname()

  return (
    <aside className="fixed top-0 left-0 h-screen w-64 flex flex-col bg-chrome border-r border-chrome-line z-10">

      {/* Logo */}
      <div className="flex items-center gap-3 px-5 h-16 border-b border-chrome-line">
        <div className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0 bg-accent">
          <span className="text-white font-bold text-sm font-display">A</span>
        </div>
        <div>
          <p className="text-sm font-semibold text-chrome-fg-strong leading-none font-display">AMD Service</p>
          <p className="text-xs text-chrome-fg mt-0.5">Espace technicien</p>
        </div>
      </div>

      {/* Nav */}
      <nav className="flex-1 px-3 py-4 space-y-0.5 overflow-y-auto scrollbar-chrome">
        {NAV.map(({ href, label, icon: Icon, exact }) => {
          const active = exact ? pathname === href : pathname.startsWith(href)
          return (
            <Link
              key={href}
              href={href}
              className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                active
                  ? 'bg-accent/15 text-accent'
                  : 'text-chrome-fg hover:bg-chrome-hover hover:text-chrome-fg-strong'
              }`}
            >
              <Icon size={18} />
              {label}
            </Link>
          )
        })}
      </nav>

      {/* User + logout */}
      <div className="px-3 py-4 border-t border-chrome-line">
        {fullName && (
          <p className="px-3 text-xs text-chrome-fg mb-2 truncate">{fullName}</p>
        )}
        <form action={signOut}>
          <button
            type="submit"
            className="flex items-center gap-3 w-full px-3 py-2.5 rounded-lg text-sm font-medium text-chrome-fg hover:bg-chrome-hover hover:text-chrome-fg-strong transition-colors"
          >
            <LogOut size={18} />
            Déconnexion
          </button>
        </form>
      </div>
    </aside>
  )
}
```

- [ ] **Step 2: Verificar TypeScript**

```bash
npx tsc --noEmit 2>&1 | head -20
```

- [ ] **Step 3: Commit**

```bash
git add src/app/tech/tech-desktop-sidebar.tsx
git commit -m "refactor(tech): desktop sidebar chrome oscura"
```

---

## Task 4: Dashboard — `tech/page.tsx`

**Files:**
- Modify: `src/app/tech/page.tsx`

- [ ] **Step 1: Escribir `tech/page.tsx`**

Cambios clave: eliminar `STATUS_STYLE`/`PRIORITY_STYLE` string dicts → `STATUS_BADGE`/`PRIORITY_BADGE` con `BadgeVariant`. Stats cards a tokens. Table desktop a `Card`. Todos los grays a tokens ink.

```tsx
import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { signOut } from '@/app/login/actions'
import { LogOut, Clock, CheckCircle, AlertCircle, Printer, ChevronRight } from 'lucide-react'
import { Badge } from '@/components/ui/Badge'
import { Card } from '@/components/ui/Card'
import type { BadgeVariant } from '@/components/ui/Badge'

const STATUS_BADGE: Record<string, BadgeVariant> = {
  nouveau: 'info', assigné: 'violet', en_cours: 'warning', résolu: 'success',
}
const STATUS_LABEL: Record<string, string> = {
  nouveau: 'Nouveau', assigné: 'Assigné', en_cours: 'En cours', résolu: 'Résolu',
}
const PRIORITY_BADGE: Record<string, BadgeVariant> = {
  basse: 'neutral', normale: 'info', haute: 'warning', urgente: 'danger',
}
const PRIORITY_LABEL: Record<string, string> = {
  basse: 'Basse', normale: 'Normale', haute: 'Haute', urgente: 'Urgente',
}
const PRIORITY_RANK: Record<string, number> = {
  urgente: 0, haute: 1, normale: 2, basse: 3,
}

type HomeIncident = {
  id: string
  title: string
  status: string
  priority: string
  created_at: string
  clients: { nom_client: string } | null
}

export default async function TechPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const now = new Date()
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1)

  const [profileRes, incidentsRes] = await Promise.all([
    supabase.from('profiles').select('full_name').eq('id', user.id).single(),
    supabase
      .from('incidents')
      .select('id, title, status, priority, created_at, clients!client_id(nom_client)')
      .eq('assigned_to', user.id)
      .order('created_at', { ascending: false }),
  ])

  const incidents = (incidentsRes.data ?? []) as unknown as HomeIncident[]
  const firstName  = profileRes.data?.full_name?.split(' ')[0] ?? 'Technicien'

  const openCount          = incidents.filter(i => !['résolu', 'fermé'].includes(i.status)).length
  const urgentCount        = incidents.filter(i => i.priority === 'urgente' && !['résolu', 'fermé'].includes(i.status)).length
  const resolvedMonthCount = incidents.filter(i =>
    ['résolu', 'fermé'].includes(i.status) && i.created_at >= startOfMonth.toISOString()
  ).length
  const totalCount = incidents.length

  const nextIntervention = incidents
    .filter(i => !['résolu', 'fermé'].includes(i.status))
    .sort((a, b) => (PRIORITY_RANK[a.priority] ?? 4) - (PRIORITY_RANK[b.priority] ?? 4))[0] ?? null

  const activeIncidents = incidents.filter(i => !['résolu', 'fermé'].includes(i.status))

  return (
    <div className="p-4 lg:p-8 space-y-6">

      {/* Header móvil */}
      <div className="flex items-center justify-between pt-2 lg:hidden">
        <div>
          <p className="text-xs text-ink-muted">Bonjour,</p>
          <h1 className="text-xl font-semibold text-ink font-display">{firstName}</h1>
        </div>
        <form action={signOut}>
          <button type="submit" className="w-9 h-9 flex items-center justify-center rounded-xl border border-line bg-card text-ink-muted">
            <LogOut size={16} />
          </button>
        </form>
      </div>

      {/* Header desktop */}
      <div className="hidden lg:block">
        <h1 className="text-2xl font-semibold text-ink font-display">
          Bonjour, {firstName}
        </h1>
        <p className="text-sm text-ink-muted mt-1">Voici vos interventions en cours.</p>
      </div>

      {/* Stats 2×2 bento */}
      <div className="grid grid-cols-2 gap-3">
        <div className="bg-card rounded-[var(--radius-card)] border border-line p-4">
          <div className="w-8 h-8 rounded-lg bg-warning-soft flex items-center justify-center mb-3">
            <Clock size={16} className="text-warning" />
          </div>
          <p className="text-2xl font-semibold text-ink">{openCount}</p>
          <p className="text-xs text-ink-muted mt-0.5">En cours</p>
        </div>
        <div className={`rounded-[var(--radius-card)] border p-4 ${urgentCount > 0 ? 'bg-accent-soft border-accent/20' : 'bg-card border-line'}`}>
          <div className={`w-8 h-8 rounded-lg flex items-center justify-center mb-3 ${urgentCount > 0 ? 'bg-accent/10' : 'bg-neutral-soft'}`}>
            <AlertCircle size={16} className={urgentCount > 0 ? 'text-accent' : 'text-ink-muted'} />
          </div>
          <p className={`text-2xl font-semibold ${urgentCount > 0 ? 'text-accent' : 'text-ink'}`}>{urgentCount}</p>
          <p className={`text-xs mt-0.5 ${urgentCount > 0 ? 'text-accent' : 'text-ink-muted'}`}>Urgents</p>
        </div>
        <div className="bg-card rounded-[var(--radius-card)] border border-line p-4">
          <div className="w-8 h-8 rounded-lg bg-success-soft flex items-center justify-center mb-3">
            <CheckCircle size={16} className="text-success" />
          </div>
          <p className="text-2xl font-semibold text-ink">{resolvedMonthCount}</p>
          <p className="text-xs text-ink-muted mt-0.5">Résolus ce mois</p>
        </div>
        <div className="bg-card rounded-[var(--radius-card)] border border-line p-4">
          <div className="w-8 h-8 rounded-lg bg-info-soft flex items-center justify-center mb-3">
            <Printer size={16} className="text-info" />
          </div>
          <p className="text-2xl font-semibold text-ink">{totalCount}</p>
          <p className="text-xs text-ink-muted mt-0.5">Total assignés</p>
        </div>
      </div>

      {/* Prochaine intervention */}
      {nextIntervention && (
        <Link
          href={`/tech/incidents/${nextIntervention.id}`}
          className="block bg-card rounded-[var(--radius-card)] border border-line shadow-card p-4"
        >
          <h2 className="text-xs font-semibold text-ink-muted uppercase tracking-wider mb-3">
            Prochaine intervention
          </h2>
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold text-ink truncate">
                {nextIntervention.clients?.nom_client ?? '—'}
              </p>
              <p className="text-xs text-ink-muted mt-0.5 truncate">{nextIntervention.title}</p>
              <div className="mt-2">
                <Badge variant={PRIORITY_BADGE[nextIntervention.priority] ?? 'neutral'}>
                  {PRIORITY_LABEL[nextIntervention.priority] ?? nextIntervention.priority}
                </Badge>
              </div>
            </div>
            <ChevronRight size={18} className="text-ink-muted shrink-0" />
          </div>
        </Link>
      )}

      {/* Interventions actives */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-semibold text-ink lg:text-base">
            Interventions en cours
          </h2>
          <span className="text-xs text-ink-muted">{activeIncidents.length} actives</span>
        </div>

        {/* Mobile: cards */}
        <div className="lg:hidden">
          {activeIncidents.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-center bg-card rounded-[var(--radius-card)] border border-line">
              <Clock size={32} className="text-line mb-3" />
              <p className="text-sm font-medium text-ink-muted">Aucune intervention assignée</p>
            </div>
          ) : (
            <div className="space-y-3">
              {activeIncidents.map((inc) => (
                <Link key={inc.id} href={`/tech/incidents/${inc.id}`} className="block bg-card rounded-[var(--radius-card)] border border-line p-4">
                  <div className="flex items-start justify-between gap-3 mb-3">
                    <p className="text-sm font-semibold text-ink leading-snug">{inc.title}</p>
                    <Badge variant={PRIORITY_BADGE[inc.priority] ?? 'neutral'}>
                      {PRIORITY_LABEL[inc.priority] ?? inc.priority}
                    </Badge>
                  </div>
                  <div className="flex items-center justify-between">
                    <p className="text-xs text-ink-muted">{inc.clients?.nom_client ?? '—'}</p>
                    <Badge variant={STATUS_BADGE[inc.status] ?? 'neutral'}>
                      {STATUS_LABEL[inc.status] ?? inc.status}
                    </Badge>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </div>

        {/* Desktop: table */}
        <Card className="hidden lg:block overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-line bg-neutral-soft">
                <th className="text-left px-5 py-3.5 text-[10px] font-semibold text-ink-muted uppercase tracking-[0.06em]">Titre</th>
                <th className="text-left px-5 py-3.5 text-[10px] font-semibold text-ink-muted uppercase tracking-[0.06em]">Client</th>
                <th className="text-left px-5 py-3.5 text-[10px] font-semibold text-ink-muted uppercase tracking-[0.06em]">Priorité</th>
                <th className="text-left px-5 py-3.5 text-[10px] font-semibold text-ink-muted uppercase tracking-[0.06em]">Statut</th>
                <th className="text-left px-5 py-3.5 text-[10px] font-semibold text-ink-muted uppercase tracking-[0.06em]">Date</th>
                <th />
              </tr>
            </thead>
            <tbody className="divide-y divide-line-subtle">
              {activeIncidents.length === 0 && (
                <tr><td colSpan={6} className="px-5 py-10 text-center text-ink-muted">Aucune intervention en cours</td></tr>
              )}
              {activeIncidents.map((inc) => (
                <tr key={inc.id} className="hover:bg-neutral-soft transition-colors">
                  <td className="px-5 py-4 font-medium text-ink">{inc.title}</td>
                  <td className="px-5 py-4 text-ink-muted text-xs">{inc.clients?.nom_client ?? '—'}</td>
                  <td className="px-5 py-4">
                    <Badge variant={PRIORITY_BADGE[inc.priority] ?? 'neutral'}>
                      {PRIORITY_LABEL[inc.priority] ?? inc.priority}
                    </Badge>
                  </td>
                  <td className="px-5 py-4">
                    <Badge variant={STATUS_BADGE[inc.status] ?? 'neutral'}>
                      {STATUS_LABEL[inc.status] ?? inc.status}
                    </Badge>
                  </td>
                  <td className="px-5 py-4 text-ink-muted text-xs">{new Date(inc.created_at).toLocaleDateString('fr-FR')}</td>
                  <td className="px-5 py-4 text-right">
                    <Link href={`/tech/incidents/${inc.id}`} className="text-sm font-medium text-ink-muted hover:text-ink underline underline-offset-2">
                      Voir
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Verificar TypeScript**

```bash
npx tsc --noEmit 2>&1 | head -20
```

- [ ] **Step 3: Commit**

```bash
git add src/app/tech/page.tsx
git commit -m "refactor(tech): dashboard tokens + Badge + Card"
```

---

## Task 5: Incidents list — `incidents/page.tsx` + `TechIncidentList.tsx`

**Files:**
- Modify: `src/app/tech/incidents/page.tsx`
- Modify: `src/components/tech/TechIncidentList.tsx`

- [ ] **Step 1: Escribir `incidents/page.tsx`**

```tsx
import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import TechIncidentList from '@/components/tech/TechIncidentList'
import type { TechIncident } from '@/components/tech/TechIncidentList'

export default async function TechIncidentsPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data } = await supabase
    .from('incidents')
    .select('id, numero_incident, title, status, priority, created_at, clients!client_id(nom_client)')
    .eq('assigned_to', user.id)
    .order('created_at', { ascending: false })

  const incidents = (data ?? []) as unknown as TechIncident[]

  return (
    <div className="p-4 space-y-4">
      <h1 className="text-lg font-semibold text-ink pt-2 font-display">
        Mes interventions
      </h1>
      <TechIncidentList incidents={incidents} />
    </div>
  )
}
```

- [ ] **Step 2: Escribir `TechIncidentList.tsx`**

IMPORTANTE: Conservar `PRIORITY_COLOR` hex dict completo — la stripe lateral y el texto de prioridad usan hex directamente porque orange `#F97316` no tiene token equivalente. Solo migrar `STATUS_STYLE` → `Badge`.

```tsx
'use client'

import Link from 'next/link'
import { useState } from 'react'
import { Badge } from '@/components/ui/Badge'
import type { BadgeVariant } from '@/components/ui/Badge'

const PRIORITY_COLOR: Record<string, string> = {
  urgente: '#BF0D0D',
  haute:   '#F97316',
  normale: '#3B82F6',
  basse:   '#9CA3AF',
}

const PRIORITY_LABEL: Record<string, string> = {
  urgente: 'Urgente',
  haute:   'Haute',
  normale: 'Normale',
  basse:   'Basse',
}

const STATUS_BADGE: Record<string, BadgeVariant> = {
  nouveau: 'info', assigné: 'violet', en_cours: 'warning', résolu: 'success', fermé: 'neutral',
}

const STATUS_LABEL: Record<string, string> = {
  nouveau: 'Nouveau', assigné: 'Assigné', en_cours: 'En cours', résolu: 'Résolu', fermé: 'Fermé',
}

export type TechIncident = {
  id: string
  numero_incident: string
  title: string
  status: string
  priority: string
  created_at: string
  clients: { nom_client: string } | null
}

type Filter = 'all' | 'urgent' | 'today'

function isToday(dateStr: string): boolean {
  const d = new Date(dateStr)
  const now = new Date()
  return (
    d.getFullYear() === now.getFullYear() &&
    d.getMonth()    === now.getMonth()    &&
    d.getDate()     === now.getDate()
  )
}

export default function TechIncidentList({ incidents }: { incidents: TechIncident[] }) {
  const [filter, setFilter] = useState<Filter>('all')

  const urgentCount = incidents.filter(i => i.priority === 'urgente').length
  const todayCount  = incidents.filter(i => isToday(i.created_at)).length

  const filtered = incidents.filter(i => {
    if (filter === 'urgent') return i.priority === 'urgente'
    if (filter === 'today')  return isToday(i.created_at)
    return true
  })

  const chips: { key: Filter; label: string; count: number }[] = [
    { key: 'all',    label: 'Tous',        count: incidents.length },
    { key: 'urgent', label: 'Urgents',     count: urgentCount },
    { key: 'today',  label: "Aujourd'hui", count: todayCount },
  ]

  return (
    <div className="space-y-4">
      <div className="flex gap-2 overflow-x-auto pb-1 -mx-4 px-4">
        {chips.map(chip => (
          <button
            key={chip.key}
            onClick={() => setFilter(chip.key)}
            className={`whitespace-nowrap px-4 py-1.5 rounded-full text-xs font-semibold border transition-colors ${
              filter === chip.key
                ? 'bg-accent text-white border-transparent'
                : 'bg-card text-ink-muted border-line hover:border-line'
            }`}
          >
            {chip.label} ({chip.count})
          </button>
        ))}
      </div>

      {filtered.length === 0 ? (
        <p className="text-sm text-ink-muted text-center py-12">Aucune intervention</p>
      ) : (
        <div className="space-y-3">
          {filtered.map(inc => (
            <Link
              key={inc.id}
              href={`/tech/incidents/${inc.id}`}
              className="relative flex items-center justify-between bg-card rounded-[var(--radius-card)] border border-line p-4 pl-5 overflow-hidden active:scale-[0.98] transition-transform"
            >
              <div
                className="absolute left-0 top-0 bottom-0 w-1"
                style={{ backgroundColor: PRIORITY_COLOR[inc.priority] ?? '#9CA3AF' }}
              />
              <div className="min-w-0 flex-1">
                <p className="font-mono text-[10px] font-semibold tracking-wide mb-0.5 text-accent">
                  {inc.numero_incident}
                </p>
                <p className="text-sm font-semibold text-ink truncate">
                  {inc.clients?.nom_client ?? inc.title}
                </p>
                <p className="text-xs text-ink-muted truncate mt-0.5">{inc.title}</p>
                <div className="flex items-center gap-2 mt-1.5">
                  <span
                    className="text-[10px] font-bold uppercase tracking-wide"
                    style={{ color: PRIORITY_COLOR[inc.priority] ?? '#9CA3AF' }}
                  >
                    {PRIORITY_LABEL[inc.priority] ?? inc.priority}
                  </span>
                  <span className="text-gray-300">·</span>
                  <span className="text-[10px] text-ink-muted">
                    {new Date(inc.created_at).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })}
                  </span>
                </div>
              </div>
              <Badge variant={STATUS_BADGE[inc.status] ?? 'neutral'} className="shrink-0 ml-3">
                {STATUS_LABEL[inc.status] ?? inc.status}
              </Badge>
            </Link>
          ))}
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 3: Verificar TypeScript**

```bash
npx tsc --noEmit 2>&1 | head -20
```

- [ ] **Step 4: Commit**

```bash
git add src/app/tech/incidents/page.tsx src/components/tech/TechIncidentList.tsx
git commit -m "refactor(tech): lista incidents tokens + Badge"
```

---

## Task 6: Intervention form — `intervention-form.tsx`

**Files:**
- Modify: `src/app/tech/incidents/[id]/intervention-form.tsx`

- [ ] **Step 1: Escribir `intervention-form.tsx`**

Cambios: `STATUS_BADGE` string dict → BadgeVariant. Cards a `Card`. Submit `bg-accent`. `accent-red-600` en radio/checkbox conservado. Error banner conservado.

```tsx
'use client'

import { useActionState } from 'react'
import Link from 'next/link'
import { ArrowLeft, Loader2, MapPin, Building2, FileText } from 'lucide-react'
import { Badge } from '@/components/ui/Badge'
import { Card } from '@/components/ui/Card'
import type { BadgeVariant } from '@/components/ui/Badge'

type FormState = { error: string } | null

const PARTS = [
  { id: 1, name: 'Four' }, { id: 2, name: 'Transfer Belt' },
  { id: 3, name: 'Tambour BK' }, { id: 4, name: 'Tambour C' },
  { id: 5, name: 'Tambour M' }, { id: 6, name: 'Tambour Y' },
  { id: 7, name: 'Toner BK' }, { id: 8, name: 'Toner C' },
  { id: 9, name: 'Toner M' }, { id: 10, name: 'Toner Y' },
  { id: 11, name: 'Cassette' }, { id: 12, name: 'Rouleau Pression' },
]

const STATUS_OPTIONS = [
  { value: 'en_cours', label: 'En cours — intervention démarrée' },
  { value: 'résolu',   label: 'Résolu — problème réglé' },
]

const STATUS_BADGE: Record<string, BadgeVariant> = {
  nouveau: 'info', assigné: 'violet', en_cours: 'warning', résolu: 'success',
}
const STATUS_LABEL: Record<string, string> = {
  nouveau: 'Nouveau', assigné: 'Assigné', en_cours: 'En cours', résolu: 'Résolu',
}

type Props = {
  incident: {
    id: string; numero_incident: string; title: string; description: string | null; status: string;
    priority: string; category: string; rapport_intervention: string | null; autres_pieces: string | null;
  }
  boundAction: (prev: FormState, data: FormData) => Promise<FormState>
  clientName: string | null
  machineName: string
  machineLocation: string | null
  contractNumber: string | null
  checkedParts: Set<number>
}

export default function InterventionForm({
  incident, boundAction, clientName, machineName, machineLocation, contractNumber, checkedParts,
}: Props) {
  const [state, formAction, pending] = useActionState(boundAction, null)

  return (
    <div className="p-4 space-y-5 pb-8">

      {/* Header */}
      <div className="flex items-center gap-3 pt-2">
        <Link href="/tech" className="flex items-center justify-center w-9 h-9 rounded-xl border border-line bg-card shrink-0">
          <ArrowLeft size={16} className="text-ink-muted" />
        </Link>
        <div className="min-w-0">
          <p className="font-mono text-[10px] font-semibold tracking-wide text-accent">
            {incident.numero_incident}
          </p>
          <h1 className="text-base font-semibold text-ink truncate font-display">
            {incident.title}
          </h1>
          <div className="mt-0.5">
            <Badge variant={STATUS_BADGE[incident.status] ?? 'neutral'}>
              {STATUS_LABEL[incident.status] ?? incident.status}
            </Badge>
          </div>
        </div>
      </div>

      {/* Infos machine */}
      <Card className="p-4 space-y-3">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg flex items-center justify-center bg-accent">
            <FileText size={14} className="text-white" />
          </div>
          <div>
            <p className="text-sm font-semibold text-ink">{machineName}</p>
            {contractNumber && <p className="text-xs text-ink-muted font-mono">{contractNumber}</p>}
          </div>
        </div>
        {clientName && (
          <div className="flex items-center gap-2 text-sm text-ink-soft">
            <Building2 size={14} className="text-ink-muted shrink-0" />
            {clientName}
          </div>
        )}
        {machineLocation && (
          <div className="flex items-center gap-2 text-sm text-ink-soft">
            <MapPin size={14} className="text-ink-muted shrink-0" />
            {machineLocation}
          </div>
        )}
        {incident.description && (
          <div className="pt-2 border-t border-line-subtle">
            <p className="text-xs font-medium text-ink-muted mb-1">Description du problème</p>
            <p className="text-sm text-ink-soft">{incident.description}</p>
          </div>
        )}
      </Card>

      {/* Formulaire intervention */}
      <form action={formAction} className="space-y-5">
        <input type="hidden" name="old_status" value={incident.status} />

        {state?.error && (
          <div className="px-4 py-3 rounded-xl bg-red-50 border border-red-200 text-sm text-red-700">
            {state.error}
          </div>
        )}

        {/* Statut */}
        <Card className="p-4">
          <p className="text-sm font-semibold text-ink-soft mb-3">Statut de l&apos;intervention</p>
          <div className="space-y-2">
            {STATUS_OPTIONS.map((o) => (
              <label key={o.value} className="flex items-center gap-3 p-3 rounded-xl border border-line cursor-pointer">
                <input
                  type="radio"
                  name="status"
                  value={o.value}
                  defaultChecked={incident.status === o.value || (incident.status === 'assigné' && o.value === 'en_cours')}
                  className="accent-red-600"
                />
                <span className="text-sm text-ink-soft">{o.label}</span>
              </label>
            ))}
          </div>
        </Card>

        {/* Rapport */}
        <Card className="p-4">
          <p className="text-sm font-semibold text-ink-soft mb-3">Rapport d&apos;intervention</p>
          <textarea
            name="rapport"
            rows={4}
            defaultValue={incident.rapport_intervention ?? ''}
            placeholder="Décrivez les actions effectuées, l'état de la machine, les pièces changées..."
            className="w-full px-3 py-2.5 rounded-xl border border-line text-sm text-ink placeholder-ink-muted focus:outline-none focus:ring-2 focus:ring-accent focus:border-transparent resize-none"
          />
        </Card>

        {/* Pièces remplacées */}
        <Card className="p-4">
          <p className="text-sm font-semibold text-ink-soft mb-3">Pièces remplacées</p>
          <div className="grid grid-cols-2 gap-2">
            {PARTS.map((p) => (
              <label key={p.id} className="flex items-center gap-2.5 p-2.5 rounded-xl border border-line cursor-pointer">
                <input
                  type="checkbox"
                  name={`part_${p.id}`}
                  defaultChecked={checkedParts.has(p.id)}
                  className="w-4 h-4 rounded accent-red-600"
                />
                <span className="text-sm text-ink-soft">{p.name}</span>
              </label>
            ))}
          </div>
          <div className="mt-3">
            <input
              name="autres_pieces"
              type="text"
              defaultValue={incident.autres_pieces ?? ''}
              placeholder="Autres pièces (libre)"
              className="w-full px-3 py-2.5 rounded-xl border border-line text-sm text-ink placeholder-ink-muted focus:outline-none focus:ring-2 focus:ring-accent focus:border-transparent"
            />
          </div>
        </Card>

        {/* Commentaire */}
        <Card className="p-4">
          <p className="text-sm font-semibold text-ink-soft mb-1">Commentaire</p>
          <p className="text-xs text-ink-muted mb-3">Ajouté à l&apos;historique si le statut change</p>
          <input
            name="comment"
            type="text"
            placeholder="Ex : Pièce commandée, retour prévu demain"
            className="w-full px-3 py-2.5 rounded-xl border border-line text-sm text-ink placeholder-ink-muted focus:outline-none focus:ring-2 focus:ring-accent focus:border-transparent"
          />
        </Card>

        <button
          type="submit"
          disabled={pending}
          className="w-full flex items-center justify-center gap-2 py-3.5 rounded-2xl text-sm font-semibold text-white bg-accent disabled:opacity-60 transition-opacity"
        >
          {pending && <Loader2 size={16} className="animate-spin" />}
          Enregistrer l&apos;intervention
        </button>
      </form>
    </div>
  )
}
```

- [ ] **Step 2: Verificar TypeScript**

```bash
npx tsc --noEmit 2>&1 | head -20
```

- [ ] **Step 3: Commit**

```bash
git add src/app/tech/incidents/[id]/intervention-form.tsx
git commit -m "refactor(tech): intervention form tokens + Card + Badge"
```

---

## Task 7: Machines — `tech/machines/page.tsx`

**Files:**
- Modify: `src/app/tech/machines/page.tsx`

- [ ] **Step 1: Escribir `tech/machines/page.tsx`**

```tsx
import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { Badge } from '@/components/ui/Badge'
import { Card } from '@/components/ui/Card'

export default async function TechMachinesPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: assignedIncidents } = await supabase
    .from('incidents')
    .select('machine_id')
    .eq('assigned_to', user.id)
    .not('status', 'in', '("fermé")')

  const machineIds = [...new Set((assignedIncidents ?? []).map(i => i.machine_id))]

  const { data: machines } = machineIds.length > 0
    ? await supabase
        .from('machines')
        .select('numero_serie, marque, modele, type, localisation, active')
        .in('numero_serie', machineIds)
        .order('marque')
    : { data: [] }

  return (
    <div className="p-4 lg:p-8">
      <div className="mb-6">
        <h1 className="text-xl font-semibold text-ink lg:text-2xl font-display">
          Machines
        </h1>
        <p className="text-sm text-ink-muted mt-1">Machines liées à vos interventions</p>
      </div>

      <Card className="overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-line bg-neutral-soft">
              <th className="text-left px-5 py-3.5 text-[10px] font-semibold text-ink-muted uppercase tracking-[0.06em]">Nº Série</th>
              <th className="text-left px-5 py-3.5 text-[10px] font-semibold text-ink-muted uppercase tracking-[0.06em]">Marque / Modèle</th>
              <th className="text-left px-5 py-3.5 text-[10px] font-semibold text-ink-muted uppercase tracking-[0.06em]">Type</th>
              <th className="text-left px-5 py-3.5 text-[10px] font-semibold text-ink-muted uppercase tracking-[0.06em]">Localisation</th>
              <th className="text-left px-5 py-3.5 text-[10px] font-semibold text-ink-muted uppercase tracking-[0.06em]">Statut</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line-subtle">
            {(!machines || machines.length === 0) && (
              <tr>
                <td colSpan={5} className="px-5 py-10 text-center text-ink-muted">
                  Aucune machine liée à vos interventions
                </td>
              </tr>
            )}
            {machines?.map((m) => (
              <tr key={m.numero_serie} className="hover:bg-neutral-soft transition-colors">
                <td className="px-5 py-4 font-mono text-xs text-ink-muted">{m.numero_serie}</td>
                <td className="px-5 py-4">
                  <span className="font-medium text-ink">{m.marque}</span>
                  <span className="text-gray-300 mx-1.5">·</span>
                  <span className="text-ink-soft">{m.modele}</span>
                </td>
                <td className="px-5 py-4">
                  <Badge variant={m.type === 'color' ? 'violet' : 'neutral'}>
                    {m.type === 'color' ? 'Couleur' : 'N&B'}
                  </Badge>
                </td>
                <td className="px-5 py-4 text-ink-soft">{m.localisation || '—'}</td>
                <td className="px-5 py-4">
                  <span className={`inline-flex items-center gap-1.5 text-xs font-medium ${m.active ? 'text-success' : 'text-ink-muted'}`}>
                    <span className={`w-1.5 h-1.5 rounded-full ${m.active ? 'bg-success' : 'bg-line'}`} />
                    {m.active ? 'Active' : 'Inactive'}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
    </div>
  )
}
```

- [ ] **Step 2: Verificar TypeScript**

```bash
npx tsc --noEmit 2>&1 | head -20
```

- [ ] **Step 3: Commit**

```bash
git add src/app/tech/machines/page.tsx
git commit -m "refactor(tech): machines tabla tokens + Card + Badge"
```

---

## Task 8: Planning — `tech/planning/page.tsx`

**Files:**
- Modify: `src/app/tech/planning/page.tsx`

- [ ] **Step 1: Escribir `tech/planning/page.tsx`**

Cambios: `STATUS_BADGE` string → BadgeVariant. Overdue card `border-accent/30 bg-card`. Icon colors → semantic tokens. Cards planificadas y de intervención → card tokens.

```tsx
import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { Wrench, AlertCircle, AlertTriangle } from 'lucide-react'
import { Badge } from '@/components/ui/Badge'
import type { BadgeVariant } from '@/components/ui/Badge'

function fmtDate(dateStr: string): { label: string; isOverdue: boolean } {
  const d = new Date(dateStr + 'T00:00:00')
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const diff = Math.round((d.getTime() - today.getTime()) / 86400000)
  if (diff < 0)  return { label: `${Math.abs(diff)} jour${Math.abs(diff) > 1 ? 's' : ''} de retard`, isOverdue: true }
  if (diff === 0) return { label: "Aujourd'hui", isOverdue: false }
  if (diff === 1) return { label: 'Demain', isOverdue: false }
  return {
    label: d.toLocaleDateString('fr-FR', { weekday: 'short', day: 'numeric', month: 'short' }),
    isOverdue: false,
  }
}

const STATUS_BADGE: Record<string, BadgeVariant> = {
  nouveau: 'info', assigné: 'violet', en_cours: 'warning',
}
const STATUS_LABEL: Record<string, string> = {
  nouveau: 'Nouveau', assigné: 'Assigné', en_cours: 'En cours',
}

export default async function TechPlanningPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const now   = new Date()
  const in14  = new Date(now)
  in14.setDate(now.getDate() + 14)
  const in14Str = in14.toISOString().split('T')[0]

  const [{ data: rawVisits }, { data: incidents }] = await Promise.all([
    supabase
      .from('maintenance_visits')
      .select(`
        id, scheduled_date, status,
        maintenance_plans (
          contracts (
            lieu_installation,
            clients  ( nom_client ),
            machines ( numero_serie, marque, modele )
          )
        )
      `)
      .in('status', ['planifié', 'en_retard'])
      .order('scheduled_date')
      .limit(30),
    supabase
      .from('incidents')
      .select('id, title, status, priority, machine_id, created_at')
      .eq('assigned_to', user.id)
      .not('status', 'in', '("résolu","fermé")')
      .order('created_at', { ascending: false }),
  ])

  const visits = (rawVisits ?? []).filter(v =>
    v.status === 'en_retard' || v.scheduled_date <= in14Str
  )

  const overdueVisits  = visits.filter(v => v.status === 'en_retard')
  const plannedVisits  = visits.filter(v => v.status === 'planifié')

  return (
    <div className="p-4 space-y-6 pt-5">

      <div>
        <h1 className="text-lg font-semibold text-ink font-display">
          Planning
        </h1>
        <p className="text-xs text-ink-muted mt-0.5">
          {now.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' })}
        </p>
      </div>

      {/* ── MAINTENANCES EN RETARD ── */}
      {overdueVisits.length > 0 && (
        <section className="space-y-2">
          <div className="flex items-center gap-2">
            <AlertTriangle size={14} className="text-accent" />
            <p className="text-sm font-semibold text-accent">En retard ({overdueVisits.length})</p>
          </div>
          {overdueVisits.map(v => {
            const plan     = v.maintenance_plans as any
            const contract = plan?.contracts as any
            const machine  = contract?.machines as any
            const { label } = fmtDate(v.scheduled_date)
            const serie = machine?.numero_serie as string | undefined
            return (
              <Link
                key={v.id}
                href={serie ? `/tech/scan/${encodeURIComponent(serie)}` : '/tech'}
                className="flex items-start gap-3 bg-card rounded-[var(--radius-card)] border-2 border-accent/30 p-4"
              >
                <div className="w-9 h-9 rounded-xl bg-accent-soft flex items-center justify-center shrink-0">
                  <Wrench size={16} className="text-accent" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold text-ink truncate">
                    {contract?.clients?.nom_client ?? '—'}
                  </p>
                  <p className="text-xs text-ink-soft truncate">
                    {machine?.marque} {machine?.modele}
                  </p>
                  {contract?.lieu_installation && (
                    <p className="text-xs text-ink-muted truncate mt-0.5">{contract.lieu_installation}</p>
                  )}
                </div>
                <span className="shrink-0 text-xs font-semibold text-accent whitespace-nowrap">{label}</span>
              </Link>
            )
          })}
        </section>
      )}

      {/* ── MAINTENANCES PLANIFIÉES ── */}
      <section className="space-y-2">
        <div className="flex items-center gap-2">
          <Wrench size={14} className="text-ink-muted" />
          <p className="text-sm font-semibold text-ink-soft">
            Maintenance — 14 prochains jours
            {plannedVisits.length > 0 && (
              <span className="ml-2 text-xs font-normal text-ink-muted">({plannedVisits.length})</span>
            )}
          </p>
        </div>

        {plannedVisits.length === 0 ? (
          <div className="bg-card rounded-[var(--radius-card)] border border-line p-6 text-center">
            <p className="text-sm text-ink-muted">Aucune visite planifiée dans 14 jours</p>
          </div>
        ) : (
          plannedVisits.map(v => {
            const plan     = v.maintenance_plans as any
            const contract = plan?.contracts as any
            const machine  = contract?.machines as any
            const { label, isOverdue } = fmtDate(v.scheduled_date)
            const serie = machine?.numero_serie as string | undefined
            return (
              <Link
                key={v.id}
                href={serie ? `/tech/scan/${encodeURIComponent(serie)}` : '/tech'}
                className="flex items-start gap-3 bg-card rounded-[var(--radius-card)] border border-line p-4"
              >
                <div className="w-9 h-9 rounded-xl bg-info-soft flex items-center justify-center shrink-0">
                  <Wrench size={16} className="text-info" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold text-ink truncate">
                    {contract?.clients?.nom_client ?? '—'}
                  </p>
                  <p className="text-xs text-ink-soft truncate">
                    {machine?.marque} {machine?.modele}
                  </p>
                  {contract?.lieu_installation && (
                    <p className="text-xs text-ink-muted truncate mt-0.5">{contract.lieu_installation}</p>
                  )}
                </div>
                <span className={`shrink-0 text-xs font-semibold whitespace-nowrap ${isOverdue ? 'text-accent' : 'text-info'}`}>
                  {label}
                </span>
              </Link>
            )
          })
        )}
      </section>

      {/* ── MES INTERVENTIONS ── */}
      <section className="space-y-2">
        <div className="flex items-center gap-2">
          <AlertCircle size={14} className="text-ink-muted" />
          <p className="text-sm font-semibold text-ink-soft">
            Mes interventions
            {(incidents?.length ?? 0) > 0 && (
              <span className="ml-2 text-xs font-normal text-ink-muted">({incidents!.length})</span>
            )}
          </p>
        </div>

        {(!incidents || incidents.length === 0) ? (
          <div className="bg-card rounded-[var(--radius-card)] border border-line p-6 text-center">
            <p className="text-sm text-ink-muted">Aucune intervention assignée</p>
          </div>
        ) : (
          incidents.map(inc => (
            <Link
              key={inc.id}
              href={`/tech/incidents/${inc.id}`}
              className="flex items-start gap-3 bg-card rounded-[var(--radius-card)] border border-line p-4"
            >
              <div className="w-9 h-9 rounded-xl bg-neutral-soft flex items-center justify-center shrink-0">
                <AlertCircle size={16} className="text-ink-muted" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold text-ink truncate">{inc.title}</p>
                <p className="font-mono text-xs text-ink-muted mt-0.5">{inc.machine_id}</p>
                <p className="text-xs text-ink-muted">
                  {new Date(inc.created_at).toLocaleDateString('fr-FR')}
                </p>
              </div>
              <Badge variant={STATUS_BADGE[inc.status] ?? 'neutral'}>
                {STATUS_LABEL[inc.status] ?? inc.status}
              </Badge>
            </Link>
          ))
        )}
      </section>

    </div>
  )
}
```

- [ ] **Step 2: Verificar TypeScript**

```bash
npx tsc --noEmit 2>&1 | head -20
```

- [ ] **Step 3: Commit**

```bash
git add src/app/tech/planning/page.tsx
git commit -m "refactor(tech): planning tokens + Badge"
```

---

## Task 9: Scan pages — `scan/page.tsx` + `scan/[serie]/page.tsx`

**Files:**
- Modify: `src/app/tech/scan/page.tsx`
- Modify: `src/app/tech/scan/[serie]/page.tsx`

- [ ] **Step 1: Escribir `scan/page.tsx`**

```tsx
import QrScanner from './qr-scanner'
import { QrCode } from 'lucide-react'
import { Card } from '@/components/ui/Card'

export default function ScanPage() {
  return (
    <div className="p-4 space-y-4">
      <h1 className="text-lg font-semibold text-ink pt-2 font-display">
        Scanner une machine
      </h1>

      {/* Mobile: scanner actif */}
      <div className="lg:hidden">
        <p className="text-sm text-ink-muted mb-4">
          Pointez la caméra sur le QR code collé sur la machine.
        </p>
        <QrScanner />
      </div>

      {/* Desktop: message */}
      <Card className="hidden lg:flex flex-col items-center justify-center py-20 text-center">
        <div className="w-16 h-16 rounded-2xl bg-neutral-soft flex items-center justify-center mb-4">
          <QrCode size={28} className="text-ink-muted" />
        </div>
        <p className="text-base font-medium text-ink-soft mb-2">
          Fonctionnalité mobile uniquement
        </p>
        <p className="text-sm text-ink-muted max-w-xs">
          Le scanner QR est disponible depuis l&apos;application mobile. Utilisez votre téléphone pour scanner les machines sur le terrain.
        </p>
      </Card>
    </div>
  )
}
```

- [ ] **Step 2: Escribir `scan/[serie]/page.tsx`**

Cambios clave: estilos condicionales de maintenance visit via className tokens; STATUS_STYLE → `STATUS_BADGE: Record<string, BadgeVariant>`; machine icon `bg-accent`; "Faire l'intervention" `text-accent`.

```tsx
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { notFound, redirect } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft, Printer, MapPin, Building2, Wrench, AlertTriangle } from 'lucide-react'
import { Badge } from '@/components/ui/Badge'
import { Card } from '@/components/ui/Card'
import type { BadgeVariant } from '@/components/ui/Badge'

const STATUS_BADGE: Record<string, BadgeVariant> = {
  nouveau: 'info', assigné: 'violet', en_cours: 'warning', résolu: 'success',
}
const STATUS_LABEL: Record<string, string> = {
  nouveau: 'Nouveau', assigné: 'Assigné', en_cours: 'En cours', résolu: 'Résolu',
}

export default async function MachineScanPage({
  params,
}: {
  params: Promise<{ serie: string }>
}) {
  const { serie } = await params
  const numero_serie = decodeURIComponent(serie)
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')
  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single()
  if (!profile || !['admin', 'technician'].includes(profile.role)) redirect('/login')

  const { data: machine } = await supabase
    .from('machines')
    .select('*')
    .eq('numero_serie', numero_serie)
    .single()

  if (!machine || !machine.active) notFound()

  const admin = createAdminClient()
  const { data: toTransition } = await admin
    .from('incidents')
    .select('id')
    .eq('machine_id', numero_serie)
    .eq('assigned_to', user.id)
    .eq('status', 'assigné')

  if (toTransition && toTransition.length > 0) {
    await admin
      .from('incidents')
      .update({ status: 'en_cours' })
      .in('id', toTransition.map((i) => i.id))
    await admin.from('incident_history').insert(
      toTransition.map((i) => ({
        incident_id: i.id,
        changed_by: user.id,
        old_status: 'assigné',
        new_status: 'en_cours',
        comment: 'Mise en cours automatique — scan QR',
      }))
    )
  }

  const { data: contract } = await supabase
    .from('contracts')
    .select('id, numero_contrat, lieu_installation, statut, clients(nom_client)')
    .eq('machine_id', numero_serie)
    .eq('statut', 'actif')
    .single()

  const client = contract?.clients as unknown as { nom_client: string } | null

  const { data: incidents } = await supabase
    .from('incidents')
    .select('id, title, status, priority, created_at')
    .eq('machine_id', numero_serie)
    .not('status', 'in', '("fermé")')
    .order('created_at', { ascending: false })
    .limit(5)

  let pendingVisit: { id: string; scheduled_date: string; status: string } | null = null
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

  return (
    <div className="p-4 space-y-5">
      <div className="flex items-center gap-3 pt-2">
        <Link href="/tech/scan" className="flex items-center justify-center w-9 h-9 rounded-xl border border-line bg-card shrink-0">
          <ArrowLeft size={16} className="text-ink-muted" />
        </Link>
        <h1 className="text-base font-semibold text-ink font-display">
          Fiche machine
        </h1>
      </div>

      {/* Machine info */}
      <Card className="p-4 space-y-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0 bg-accent">
            <Printer size={18} className="text-white" />
          </div>
          <div>
            <p className="text-sm font-bold text-ink">{machine.marque} {machine.modele}</p>
            <p className="font-mono text-xs text-ink-muted">{machine.numero_serie}</p>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3 pt-1 border-t border-line-subtle">
          <div>
            <p className="text-xs text-ink-muted mb-0.5">Type</p>
            <Badge variant={machine.type === 'color' ? 'violet' : 'neutral'}>
              {machine.type === 'color' ? 'Couleur' : 'N&B'}
            </Badge>
          </div>
          {machine.localisation && (
            <div>
              <p className="text-xs text-ink-muted mb-0.5">Position</p>
              <div className="flex items-center gap-1 text-xs text-ink-soft">
                <MapPin size={11} className="text-ink-muted" />
                {machine.localisation}
              </div>
            </div>
          )}
        </div>

        {client && (
          <div className="flex items-center gap-2 text-sm text-ink-soft pt-1 border-t border-line-subtle">
            <Building2 size={14} className="text-ink-muted shrink-0" />
            <span className="font-medium">{client.nom_client}</span>
            {contract?.lieu_installation && (
              <span className="text-ink-muted text-xs truncate">— {contract.lieu_installation}</span>
            )}
          </div>
        )}
      </Card>

      {/* Maintenance en attente */}
      {pendingVisit && (
        <div>
          <p className="text-sm font-semibold text-ink mb-3">Maintenance préventive</p>
          <Link
            href={`/tech/scan/${encodeURIComponent(serie)}/maintenance/${pendingVisit.id}`}
            className={`flex items-center justify-between rounded-[var(--radius-card)] border-2 p-4 ${
              pendingVisit.status === 'en_retard'
                ? 'border-accent/50 bg-accent-soft'
                : 'border-info/50 bg-info-soft'
            }`}
          >
            <div className="flex items-center gap-3">
              <div className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${
                pendingVisit.status === 'en_retard' ? 'bg-accent/10' : 'bg-info/10'
              }`}>
                {pendingVisit.status === 'en_retard'
                  ? <AlertTriangle size={16} className="text-accent" />
                  : <Wrench size={16} className="text-info" />
                }
              </div>
              <div>
                <p className="text-sm font-semibold text-ink">
                  {pendingVisit.status === 'en_retard' ? 'Maintenance en retard' : 'Maintenance planifiée'}
                </p>
                <p className="text-xs text-ink-muted mt-0.5">
                  Prévue le {new Date(pendingVisit.scheduled_date + 'T00:00:00').toLocaleDateString('fr-FR')}
                </p>
              </div>
            </div>
            <span className="text-sm text-ink-muted">→</span>
          </Link>
        </div>
      )}

      {/* Incidents actifs */}
      <div>
        <p className="text-sm font-semibold text-ink mb-3">Incidents actifs</p>
        {(!incidents || incidents.length === 0) ? (
          <Card className="p-6 text-center">
            <p className="text-sm text-ink-muted">Aucun incident actif sur cette machine</p>
          </Card>
        ) : (
          <div className="space-y-2">
            {incidents.map((inc) => (
              <Link
                key={inc.id}
                href={`/tech/incidents/${inc.id}`}
                className={`flex items-center justify-between bg-card rounded-[var(--radius-card)] border p-4 ${
                  inc.status === 'en_cours' ? 'border-warning/50' : 'border-line'
                }`}
              >
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-ink truncate">{inc.title}</p>
                  <p className="text-xs text-ink-muted mt-0.5">{new Date(inc.created_at).toLocaleDateString('fr-FR')}</p>
                  {inc.status === 'en_cours' && (
                    <p className="text-xs font-medium mt-1 text-accent">
                      Faire l&apos;intervention →
                    </p>
                  )}
                </div>
                <Badge variant={STATUS_BADGE[inc.status] ?? 'neutral'} className="shrink-0 ml-3">
                  {STATUS_LABEL[inc.status] ?? inc.status}
                </Badge>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
```

- [ ] **Step 3: Verificar TypeScript**

```bash
npx tsc --noEmit 2>&1 | head -20
```

- [ ] **Step 4: Commit**

```bash
git add src/app/tech/scan/page.tsx src/app/tech/scan/[serie]/page.tsx
git commit -m "refactor(tech): scan pages tokens + Card + Badge"
```

---

## Task 10: MaintenanceVisitForm

**Files:**
- Modify: `src/components/tech/MaintenanceVisitForm.tsx`

- [ ] **Step 1: Escribir `MaintenanceVisitForm.tsx`**

```tsx
'use client'

import { useActionState } from 'react'
import Link from 'next/link'
import { ArrowLeft, Loader2, Building2, MapPin, Wrench, AlertTriangle } from 'lucide-react'
import { Card } from '@/components/ui/Card'

type FormState = { error: string } | null

const PARTS = [
  { id: 1,  name: 'Four'            }, { id: 2,  name: 'Transfer Belt'   },
  { id: 3,  name: 'Tambour BK'      }, { id: 4,  name: 'Tambour C'       },
  { id: 5,  name: 'Tambour M'       }, { id: 6,  name: 'Tambour Y'       },
  { id: 7,  name: 'Toner BK'        }, { id: 8,  name: 'Toner C'         },
  { id: 9,  name: 'Toner M'         }, { id: 10, name: 'Toner Y'         },
  { id: 11, name: 'Cassette'        }, { id: 12, name: 'Rouleau Pression' },
]

type Props = {
  boundAction:     (prev: FormState, data: FormData) => Promise<FormState>
  backHref:        string
  scheduledDate:   string
  isOverdue:       boolean
  clientName:      string | null
  machineName:     string
  machineLocation: string | null
  planNotes:       string | null
}

export default function MaintenanceVisitForm({
  boundAction, backHref, scheduledDate, isOverdue,
  clientName, machineName, machineLocation, planNotes,
}: Props) {
  const [state, formAction, pending] = useActionState(boundAction, null)

  return (
    <div className="p-4 space-y-5 pb-10">

      {/* Header */}
      <div className="flex items-center gap-3 pt-2">
        <Link href={backHref} className="flex items-center justify-center w-9 h-9 rounded-xl border border-line bg-card shrink-0">
          <ArrowLeft size={16} className="text-ink-muted" />
        </Link>
        <div>
          <h1 className="text-base font-semibold text-ink font-display">
            Maintenance préventive
          </h1>
          <div className="flex items-center gap-1.5 mt-0.5">
            {isOverdue
              ? <span className="inline-flex items-center gap-1 text-xs font-medium text-accent"><AlertTriangle size={11} /> En retard</span>
              : <span className="text-xs text-info font-medium">Planifiée</span>
            }
            <span className="text-xs text-ink-muted">· {new Date(scheduledDate + 'T00:00:00').toLocaleDateString('fr-FR')}</span>
          </div>
        </div>
      </div>

      {/* Infos */}
      <Card className="p-4 space-y-3">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0 bg-accent">
            <Wrench size={14} className="text-white" />
          </div>
          <p className="text-sm font-semibold text-ink">{machineName}</p>
        </div>
        {clientName && (
          <div className="flex items-center gap-2 text-sm text-ink-soft">
            <Building2 size={14} className="text-ink-muted shrink-0" />
            {clientName}
          </div>
        )}
        {machineLocation && (
          <div className="flex items-center gap-2 text-sm text-ink-soft">
            <MapPin size={14} className="text-ink-muted shrink-0" />
            {machineLocation}
          </div>
        )}
        {planNotes && (
          <div className="pt-2 border-t border-line-subtle">
            <p className="text-xs font-medium text-ink-muted mb-1">Points à vérifier</p>
            <p className="text-sm text-ink-soft">{planNotes}</p>
          </div>
        )}
      </Card>

      <form action={formAction} className="space-y-5">

        {state?.error && (
          <div className="px-4 py-3 rounded-xl bg-red-50 border border-red-200 text-sm text-red-700">
            {state.error}
          </div>
        )}

        {/* Piezas */}
        <Card className="p-4">
          <p className="text-sm font-semibold text-ink-soft mb-3">Pièces remplacées</p>
          <div className="grid grid-cols-2 gap-2">
            {PARTS.map(p => (
              <label key={p.id} className="flex items-center gap-2.5 p-2.5 rounded-xl border border-line cursor-pointer active:bg-neutral-soft">
                <input
                  type="checkbox"
                  name={`part_${p.id}`}
                  className="w-4 h-4 rounded accent-red-600"
                />
                <span className="text-sm text-ink-soft">{p.name}</span>
              </label>
            ))}
          </div>
          <input
            name="autres_pieces"
            type="text"
            placeholder="Autres pièces (libre)"
            className="mt-3 w-full px-3 py-2.5 rounded-xl border border-line text-sm text-ink placeholder-ink-muted focus:outline-none focus:ring-2 focus:ring-accent focus:border-transparent"
          />
        </Card>

        {/* Notes */}
        <Card className="p-4">
          <p className="text-sm font-semibold text-ink-soft mb-3">Notes de la visite</p>
          <textarea
            name="notes"
            rows={4}
            placeholder="État de la machine, observations, anomalies constatées..."
            className="w-full px-3 py-2.5 rounded-xl border border-line text-sm text-ink placeholder-ink-muted focus:outline-none focus:ring-2 focus:ring-accent focus:border-transparent resize-none"
          />
        </Card>

        <button
          type="submit"
          disabled={pending}
          className="w-full flex items-center justify-center gap-2 py-3.5 rounded-2xl text-sm font-semibold text-white bg-accent disabled:opacity-60 transition-opacity"
        >
          {pending && <Loader2 size={16} className="animate-spin" />}
          Clôturer la maintenance
        </button>
      </form>
    </div>
  )
}
```

- [ ] **Step 2: Verificar TypeScript**

```bash
npx tsc --noEmit 2>&1 | head -20
```

- [ ] **Step 3: Commit**

```bash
git add src/components/tech/MaintenanceVisitForm.tsx
git commit -m "refactor(tech): MaintenanceVisitForm tokens + Card"
```

---

## Task 11: AgendaPanel

**Files:**
- Modify: `src/components/tech/AgendaPanel.tsx`

- [ ] **Step 1: Escribir `AgendaPanel.tsx`**

Nota: AgendaPanel es el panel lateral derecho en desktop — superficie de CONTENIDO (no chrome). Usa `bg-card border-l border-line`, NO `bg-chrome`.

```tsx
import { createClient } from '@/lib/supabase/server'
import Link from 'next/link'
import { Wrench, AlertCircle, AlertTriangle } from 'lucide-react'
import { Badge } from '@/components/ui/Badge'
import type { BadgeVariant } from '@/components/ui/Badge'

function fmtDate(dateStr: string): { label: string; isOverdue: boolean } {
  const d = new Date(dateStr + 'T00:00:00')
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const diff = Math.round((d.getTime() - today.getTime()) / 86400000)
  if (diff < 0)  return { label: `${Math.abs(diff)}j de retard`, isOverdue: true }
  if (diff === 0) return { label: "Aujourd'hui", isOverdue: false }
  if (diff === 1) return { label: 'Demain', isOverdue: false }
  return { label: d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' }), isOverdue: false }
}

const STATUS_BADGE: Record<string, BadgeVariant> = {
  nouveau: 'info', assigné: 'violet', en_cours: 'warning',
}

const STATUS_LABEL: Record<string, string> = {
  nouveau: 'Nouveau', assigné: 'Assigné', en_cours: 'En cours',
}

export default async function TechAgendaPanel() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null

  const now   = new Date()
  const in7   = new Date(now)
  in7.setDate(now.getDate() + 7)
  const in7Str = in7.toISOString().split('T')[0]

  const [{ data: rawVisits }, { data: incidents }] = await Promise.all([
    supabase
      .from('maintenance_visits')
      .select(`
        id, scheduled_date, status,
        maintenance_plans (
          contracts (
            clients  ( nom_client ),
            machines ( numero_serie, marque, modele )
          )
        )
      `)
      .in('status', ['planifié', 'en_retard'])
      .order('scheduled_date')
      .limit(20),
    supabase
      .from('incidents')
      .select('id, title, status, machine_id')
      .eq('assigned_to', user.id)
      .not('status', 'in', '("résolu","fermé")')
      .order('created_at', { ascending: false })
      .limit(6),
  ])

  const visits = (rawVisits ?? []).filter(v =>
    v.status === 'en_retard' || v.scheduled_date <= in7Str
  )

  return (
    <aside className="fixed top-0 right-0 h-screen w-72 bg-card border-l border-line overflow-y-auto z-10">

      {/* Header */}
      <div className="px-4 py-5 border-b border-line-subtle sticky top-0 bg-card z-10">
        <h2 className="text-sm font-semibold text-ink font-display">
          Mon planning
        </h2>
        <p className="text-xs text-ink-muted mt-0.5">
          {now.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' })}
        </p>
      </div>

      <div className="px-4 py-4 space-y-5">

        {/* ── MAINTENANCE ── */}
        <section>
          <div className="flex items-center gap-1.5 mb-2">
            <Wrench size={13} className="text-ink-muted" />
            <span className="text-xs font-semibold text-ink-muted uppercase tracking-wide">Maintenance</span>
          </div>

          {visits.length === 0 ? (
            <p className="text-xs text-ink-muted py-1">Aucune visite cette semaine</p>
          ) : (
            <div className="space-y-0.5">
              {visits.map(v => {
                const plan     = v.maintenance_plans as any
                const contract = plan?.contracts as any
                const machine  = contract?.machines as any
                const { label, isOverdue } = fmtDate(v.scheduled_date)
                const serie = machine?.numero_serie as string | undefined
                return (
                  <Link
                    key={v.id}
                    href={serie ? `/tech/scan/${encodeURIComponent(serie)}` : '/tech'}
                    className="flex items-start gap-2.5 px-2.5 py-2 rounded-lg hover:bg-neutral-soft transition-colors"
                  >
                    <div className={`mt-1 w-1.5 h-1.5 rounded-full shrink-0 ${isOverdue ? 'bg-accent' : 'bg-info'}`} />
                    <div className="min-w-0 flex-1">
                      <p className="text-xs font-medium text-ink-soft truncate leading-tight">
                        {contract?.clients?.nom_client ?? '—'}
                      </p>
                      <p className="text-[11px] text-ink-muted truncate">
                        {machine?.marque} {machine?.modele}
                      </p>
                    </div>
                    <span className={`shrink-0 text-[11px] font-medium whitespace-nowrap ${isOverdue ? 'text-accent' : 'text-ink-muted'}`}>
                      {label}
                    </span>
                  </Link>
                )
              })}
            </div>
          )}
        </section>

        <div className="border-t border-line-subtle" />

        {/* ── MES INTERVENTIONS ── */}
        <section>
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-1.5">
              <AlertCircle size={13} className="text-ink-muted" />
              <span className="text-xs font-semibold text-ink-muted uppercase tracking-wide">Mes interventions</span>
            </div>
            {(incidents?.length ?? 0) > 0 && (
              <Link href="/tech/incidents" className="text-xs text-ink-muted hover:text-ink-soft transition-colors">
                Voir tout →
              </Link>
            )}
          </div>

          {(!incidents || incidents.length === 0) ? (
            <p className="text-xs text-ink-muted py-1">Aucune intervention assignée</p>
          ) : (
            <div className="space-y-0.5">
              {incidents.map(inc => (
                <Link
                  key={inc.id}
                  href={`/tech/incidents/${inc.id}`}
                  className="flex items-start gap-2.5 px-2.5 py-2 rounded-lg hover:bg-neutral-soft transition-colors"
                >
                  <AlertTriangle size={12} className="mt-0.5 shrink-0 text-ink-muted/40" />
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-medium text-ink-soft truncate leading-tight">{inc.title}</p>
                    <p className="font-mono text-[10px] text-ink-muted">{inc.machine_id}</p>
                  </div>
                  <Badge variant={STATUS_BADGE[inc.status] ?? 'neutral'}>
                    {STATUS_LABEL[inc.status] ?? inc.status}
                  </Badge>
                </Link>
              ))}
            </div>
          )}
        </section>

      </div>
    </aside>
  )
}
```

- [ ] **Step 2: Verificar TypeScript**

```bash
npx tsc --noEmit 2>&1 | head -20
```

- [ ] **Step 3: Commit**

```bash
git add src/components/tech/AgendaPanel.tsx
git commit -m "refactor(tech): AgendaPanel tokens + Badge"
```

---

## Verificación final

- [ ] **Compilar y revisar**

```bash
npx tsc --noEmit 2>&1
```
Esperado: 0 errores.

- [ ] **Revisar git log**

```bash
git log --oneline -12
```
Deben aparecer 11 commits (Tasks 1–11) en la rama `refactor/tech-fase3-design-tokens`.

- [ ] **Nota sobre validación visual**

El dev server lanzado por Claude no hace HMR en este entorno. Para validar visualmente, el usuario debe ejecutar `npm run dev` en su propia terminal. Las URLs a revisar:
- http://localhost:3000/tech (requiere sesión de técnico)
- Verificar: bottom nav oscura, sidebar desktop oscura, FAB rojo, fondo claro en páginas, badges de estado, Cards en listas y formularios
