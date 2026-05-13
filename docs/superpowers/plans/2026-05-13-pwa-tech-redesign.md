# PWA Técnico — Rediseño Visual e Interactivo

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Mejorar la experiencia del técnico de campo en el PWA `/tech` con stats bento 2×2, widget de próxima intervención, tarjetas de incidents con borde de prioridad, chips de filtro, y navegación móvil con scanner como FAB.

**Architecture:** Server Components hacen el fetch de datos; un único Client Component (`TechIncidentList`) gestiona los chips de filtro reactivos en la página de incidents. El FAB del scanner se añade en `layout.tsx` para ser persistente en todas las páginas del PWA.

**Tech Stack:** Next.js App Router · TypeScript · Tailwind CSS v4 · Supabase SSR · lucide-react

---

## Archivos del plan

| Acción | Archivo |
|---|---|
| Modificar | `src/app/tech/tech-nav.tsx` |
| Modificar | `src/app/tech/layout.tsx` |
| Crear | `src/components/tech/TechIncidentList.tsx` |
| Modificar | `src/app/tech/incidents/page.tsx` |
| Modificar | `src/app/tech/page.tsx` |

---

### Task 1: Navegación móvil — 4 ítems sin Scanner

**Files:**
- Modify: `src/app/tech/tech-nav.tsx`

Reemplazar Scanner por Machines. El scanner pasa a ser FAB (Task 2).

- [ ] **Step 1: Reescribir `tech-nav.tsx`**

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
    <nav className="fixed bottom-0 left-0 right-0 max-w-lg mx-auto bg-white border-t border-gray-200 z-10">
      <div className="grid grid-cols-4 h-16">
        {NAV.map(({ href, label, icon: Icon, exact }) => {
          const active = exact ? pathname === href : pathname.startsWith(href)
          return (
            <Link
              key={href}
              href={href}
              className={`flex flex-col items-center justify-center gap-1 text-xs font-medium transition-colors ${
                active ? 'text-red-600' : 'text-gray-400 hover:text-gray-600'
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
npx tsc --noEmit 2>&1 | grep -v "supabase/functions"
```

Expected: sin errores.

- [ ] **Step 3: Commit**

```bash
git add src/app/tech/tech-nav.tsx
git commit -m "feat(tech): replace scanner nav item with machines, scanner becomes FAB"
```

---

### Task 2: FAB Scanner persistente en layout

**Files:**
- Modify: `src/app/tech/layout.tsx`

Añadir el FAB fijo encima de la nav móvil. Visible en todas las páginas del PWA.

- [ ] **Step 1: Reescribir `layout.tsx`**

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
    <div className="min-h-screen bg-gray-50">
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
          className="pointer-events-auto flex items-center gap-2 px-6 py-3.5 rounded-full shadow-lg text-white text-sm font-semibold"
          style={{ backgroundColor: '#BF0D0D' }}
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

- [ ] **Step 2: Verificar TypeScript**

```bash
npx tsc --noEmit 2>&1 | grep -v "supabase/functions"
```

Expected: sin errores.

- [ ] **Step 3: Verificar en navegador**

Abrir http://localhost:3000/tech en viewport móvil (≤768px). Debe verse:
- Nav inferior con 4 ítems: Accueil, Incidents, Machines, Planning.
- FAB rojo "Scanner une machine" centrado encima de la nav.

- [ ] **Step 4: Commit**

```bash
git add src/app/tech/layout.tsx
git commit -m "feat(tech): add persistent scanner FAB above mobile nav"
```

---

### Task 3: TechIncidentList — Client Component con filtros y tarjetas

**Files:**
- Create: `src/components/tech/TechIncidentList.tsx`

Nuevo componente cliente. Exporta también el tipo `TechIncident` que usa la página de incidents (Task 4).

- [ ] **Step 1: Crear `src/components/tech/TechIncidentList.tsx`**

```tsx
'use client'

import Link from 'next/link'
import { useState } from 'react'

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

const STATUS_STYLE: Record<string, string> = {
  nouveau:  'bg-blue-50 text-blue-700',
  assigné:  'bg-purple-50 text-purple-700',
  en_cours: 'bg-amber-50 text-amber-700',
  résolu:   'bg-green-50 text-green-700',
  fermé:    'bg-gray-100 text-gray-500',
}

const STATUS_LABEL: Record<string, string> = {
  nouveau: 'Nouveau', assigné: 'Assigné', en_cours: 'En cours', résolu: 'Résolu', fermé: 'Fermé',
}

export type TechIncident = {
  id: string
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
                ? 'text-white border-transparent'
                : 'bg-white text-gray-500 border-gray-200 hover:border-gray-300'
            }`}
            style={filter === chip.key ? { backgroundColor: '#BF0D0D' } : {}}
          >
            {chip.label} ({chip.count})
          </button>
        ))}
      </div>

      {filtered.length === 0 ? (
        <p className="text-sm text-gray-400 text-center py-12">Aucune intervention</p>
      ) : (
        <div className="space-y-3">
          {filtered.map(inc => (
            <Link
              key={inc.id}
              href={`/tech/incidents/${inc.id}`}
              className="relative flex items-center justify-between bg-white rounded-xl border border-gray-200 p-4 pl-5 overflow-hidden active:scale-[0.98] transition-transform"
            >
              <div
                className="absolute left-0 top-0 bottom-0 w-1"
                style={{ backgroundColor: PRIORITY_COLOR[inc.priority] ?? '#9CA3AF' }}
              />
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold text-gray-900 truncate">
                  {inc.clients?.nom_client ?? inc.title}
                </p>
                <p className="text-xs text-gray-500 truncate mt-0.5">{inc.title}</p>
                <div className="flex items-center gap-2 mt-1.5">
                  <span
                    className="text-[10px] font-bold uppercase tracking-wide"
                    style={{ color: PRIORITY_COLOR[inc.priority] ?? '#9CA3AF' }}
                  >
                    {PRIORITY_LABEL[inc.priority] ?? inc.priority}
                  </span>
                  <span className="text-gray-300">·</span>
                  <span className="text-[10px] text-gray-400">
                    {new Date(inc.created_at).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })}
                  </span>
                </div>
              </div>
              <span className={`shrink-0 ml-3 inline-flex px-2 py-0.5 rounded text-xs font-medium ${STATUS_STYLE[inc.status] ?? ''}`}>
                {STATUS_LABEL[inc.status] ?? inc.status}
              </span>
            </Link>
          ))}
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 2: Verificar TypeScript**

```bash
npx tsc --noEmit 2>&1 | grep -v "supabase/functions"
```

Expected: sin errores.

- [ ] **Step 3: Commit**

```bash
git add src/components/tech/TechIncidentList.tsx
git commit -m "feat(tech): add TechIncidentList client component with filter chips and priority border cards"
```

---

### Task 4: Página de incidents — join con clients + TechIncidentList

**Files:**
- Modify: `src/app/tech/incidents/page.tsx`

Ampliar la query para incluir el cliente y delegar el render al componente cliente.

- [ ] **Step 1: Reescribir `src/app/tech/incidents/page.tsx`**

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
    .select('id, title, status, priority, created_at, clients!client_id(nom_client)')
    .eq('assigned_to', user.id)
    .order('created_at', { ascending: false })

  const incidents = (data ?? []) as unknown as TechIncident[]

  return (
    <div className="p-4 space-y-4">
      <h1 className="text-lg font-semibold text-gray-900 pt-2" style={{ fontFamily: 'Poppins, sans-serif' }}>
        Mes interventions
      </h1>
      <TechIncidentList incidents={incidents} />
    </div>
  )
}
```

- [ ] **Step 2: Verificar TypeScript**

```bash
npx tsc --noEmit 2>&1 | grep -v "supabase/functions"
```

Expected: sin errores.

- [ ] **Step 3: Verificar en navegador**

Abrir http://localhost:3000/tech/incidents. Debe verse:
- Título "Mes interventions".
- Chips: Tous (N), Urgents (N), Aujourd'hui (N).
- Al pulsar un chip, la lista se filtra sin recarga de página.
- Cada tarjeta tiene borde izquierdo de color según prioridad.

- [ ] **Step 4: Commit**

```bash
git add src/app/tech/incidents/page.tsx
git commit -m "feat(tech): enrich incidents page with client join and TechIncidentList"
```

---

### Task 5: Home page — stats bento 2×2 + Prochaine intervention

**Files:**
- Modify: `src/app/tech/page.tsx`

Ampliar la query existente, calcular 4 stats y la próxima intervención, y reescribir el layout de la home. Se elimina el botón "Quick scan" móvil (ya cubierto por el FAB del layout).

- [ ] **Step 1: Reescribir `src/app/tech/page.tsx`**

```tsx
import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { signOut } from '@/app/login/actions'
import { LogOut, Clock, CheckCircle, AlertCircle, Printer, ChevronRight } from 'lucide-react'

const STATUS_STYLE: Record<string, string> = {
  nouveau:  'bg-blue-50 text-blue-700',
  assigné:  'bg-purple-50 text-purple-700',
  en_cours: 'bg-amber-50 text-amber-700',
  résolu:   'bg-green-50 text-green-700',
}
const STATUS_LABEL: Record<string, string> = {
  nouveau: 'Nouveau', assigné: 'Assigné', en_cours: 'En cours', résolu: 'Résolu',
}
const PRIORITY_STYLE: Record<string, string> = {
  basse:   'bg-gray-100 text-gray-500',
  normale: 'bg-blue-50 text-blue-600',
  haute:   'bg-orange-50 text-orange-700',
  urgente: 'bg-red-50 text-red-700',
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
          <p className="text-xs text-gray-400">Bonjour,</p>
          <h1 className="text-xl font-semibold text-gray-900" style={{ fontFamily: 'Poppins, sans-serif' }}>{firstName}</h1>
        </div>
        <form action={signOut}>
          <button type="submit" className="w-9 h-9 flex items-center justify-center rounded-xl border border-gray-200 bg-white text-gray-400">
            <LogOut size={16} />
          </button>
        </form>
      </div>

      {/* Header desktop */}
      <div className="hidden lg:block">
        <h1 className="text-2xl font-semibold text-gray-900" style={{ fontFamily: 'Poppins, sans-serif' }}>
          Bonjour, {firstName}
        </h1>
        <p className="text-sm text-gray-500 mt-1">Voici vos interventions en cours.</p>
      </div>

      {/* Stats 2×2 bento */}
      <div className="grid grid-cols-2 gap-3">
        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <div className="w-8 h-8 rounded-lg bg-amber-50 flex items-center justify-center mb-3">
            <Clock size={16} className="text-amber-600" />
          </div>
          <p className="text-2xl font-semibold text-gray-900">{openCount}</p>
          <p className="text-xs text-gray-500 mt-0.5">En cours</p>
        </div>
        <div className={`rounded-xl border p-4 ${urgentCount > 0 ? 'bg-red-50 border-red-100' : 'bg-white border-gray-200'}`}>
          <div className={`w-8 h-8 rounded-lg flex items-center justify-center mb-3 ${urgentCount > 0 ? 'bg-red-100' : 'bg-gray-100'}`}>
            <AlertCircle size={16} className={urgentCount > 0 ? 'text-red-600' : 'text-gray-400'} />
          </div>
          <p className={`text-2xl font-semibold ${urgentCount > 0 ? 'text-red-700' : 'text-gray-900'}`}>{urgentCount}</p>
          <p className={`text-xs mt-0.5 ${urgentCount > 0 ? 'text-red-500' : 'text-gray-500'}`}>Urgents</p>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <div className="w-8 h-8 rounded-lg bg-green-50 flex items-center justify-center mb-3">
            <CheckCircle size={16} className="text-green-600" />
          </div>
          <p className="text-2xl font-semibold text-gray-900">{resolvedMonthCount}</p>
          <p className="text-xs text-gray-500 mt-0.5">Résolus ce mois</p>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <div className="w-8 h-8 rounded-lg bg-blue-50 flex items-center justify-center mb-3">
            <Printer size={16} className="text-blue-600" />
          </div>
          <p className="text-2xl font-semibold text-gray-900">{totalCount}</p>
          <p className="text-xs text-gray-500 mt-0.5">Total assignés</p>
        </div>
      </div>

      {/* Prochaine intervention */}
      {nextIntervention && (
        <Link
          href={`/tech/incidents/${nextIntervention.id}`}
          className="block bg-white rounded-xl border border-gray-200 p-4"
        >
          <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">
            Prochaine intervention
          </h2>
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold text-gray-900 truncate">
                {nextIntervention.clients?.nom_client ?? '—'}
              </p>
              <p className="text-xs text-gray-500 mt-0.5 truncate">{nextIntervention.title}</p>
              <span className={`inline-flex mt-2 px-2 py-0.5 rounded text-xs font-medium ${PRIORITY_STYLE[nextIntervention.priority] ?? ''}`}>
                {PRIORITY_LABEL[nextIntervention.priority] ?? nextIntervention.priority}
              </span>
            </div>
            <ChevronRight size={18} className="text-gray-400 shrink-0" />
          </div>
        </Link>
      )}

      {/* Interventions actives */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-semibold text-gray-900 lg:text-base">
            Interventions en cours
          </h2>
          <span className="text-xs text-gray-400">{activeIncidents.length} actives</span>
        </div>

        {/* Mobile: cards */}
        <div className="lg:hidden">
          {activeIncidents.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-center bg-white rounded-2xl border border-gray-200">
              <Clock size={32} className="text-gray-200 mb-3" />
              <p className="text-sm font-medium text-gray-500">Aucune intervention assignée</p>
            </div>
          ) : (
            <div className="space-y-3">
              {activeIncidents.map((inc) => (
                <Link key={inc.id} href={`/tech/incidents/${inc.id}`} className="block bg-white rounded-2xl border border-gray-200 p-4">
                  <div className="flex items-start justify-between gap-3 mb-3">
                    <p className="text-sm font-semibold text-gray-900 leading-snug">{inc.title}</p>
                    <span className={`shrink-0 inline-flex px-2 py-0.5 rounded text-xs font-medium ${PRIORITY_STYLE[inc.priority] ?? ''}`}>
                      {PRIORITY_LABEL[inc.priority] ?? inc.priority}
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <p className="text-xs text-gray-400">{inc.clients?.nom_client ?? '—'}</p>
                    <span className={`inline-flex px-2 py-0.5 rounded text-xs font-medium ${STATUS_STYLE[inc.status] ?? ''}`}>
                      {STATUS_LABEL[inc.status] ?? inc.status}
                    </span>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </div>

        {/* Desktop: table */}
        <div className="hidden lg:block bg-white rounded-xl border border-gray-200 overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-200 bg-gray-50">
                <th className="text-left px-5 py-3.5 font-medium text-gray-500">Titre</th>
                <th className="text-left px-5 py-3.5 font-medium text-gray-500">Client</th>
                <th className="text-left px-5 py-3.5 font-medium text-gray-500">Priorité</th>
                <th className="text-left px-5 py-3.5 font-medium text-gray-500">Statut</th>
                <th className="text-left px-5 py-3.5 font-medium text-gray-500">Date</th>
                <th />
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {activeIncidents.length === 0 && (
                <tr><td colSpan={6} className="px-5 py-10 text-center text-gray-400">Aucune intervention en cours</td></tr>
              )}
              {activeIncidents.map((inc) => (
                <tr key={inc.id} className="hover:bg-gray-50 transition-colors">
                  <td className="px-5 py-4 font-medium text-gray-900">{inc.title}</td>
                  <td className="px-5 py-4 text-gray-500 text-xs">{inc.clients?.nom_client ?? '—'}</td>
                  <td className="px-5 py-4">
                    <span className={`inline-flex px-2 py-0.5 rounded text-xs font-medium ${PRIORITY_STYLE[inc.priority] ?? ''}`}>
                      {PRIORITY_LABEL[inc.priority] ?? inc.priority}
                    </span>
                  </td>
                  <td className="px-5 py-4">
                    <span className={`inline-flex px-2 py-0.5 rounded text-xs font-medium ${STATUS_STYLE[inc.status] ?? ''}`}>
                      {STATUS_LABEL[inc.status] ?? inc.status}
                    </span>
                  </td>
                  <td className="px-5 py-4 text-gray-400 text-xs">{new Date(inc.created_at).toLocaleDateString('fr-FR')}</td>
                  <td className="px-5 py-4 text-right">
                    <Link href={`/tech/incidents/${inc.id}`} className="text-sm font-medium text-gray-600 hover:text-gray-900 underline underline-offset-2">
                      Voir
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Verificar TypeScript**

```bash
npx tsc --noEmit 2>&1 | grep -v "supabase/functions"
```

Expected: sin errores.

- [ ] **Step 3: Verificar en navegador — móvil**

Abrir http://localhost:3000/tech en viewport móvil (≤768px). Debe verse:
- Grid 2×2 con: En cours · Urgents (rojo si >0) · Résolus ce mois · Total assignés.
- Tarjeta "Prochaine intervention" con cliente, título, badge de prioridad y chevron. (Solo si hay incidents activos.)
- Lista de interventions activas con tarjetas.
- NO debe aparecer el antiguo botón "Scanner une machine" inline (ese bloque fue eliminado).
- FAB rojo "Scanner une machine" visible encima de la nav.

- [ ] **Step 4: Verificar en navegador — desktop**

Abrir http://localhost:3000/tech en viewport ≥1024px. Debe verse:
- Stats 2×2 visibles.
- "Prochaine intervention" visible.
- Tabla de incidents activos.
- FAB NO visible (lg:hidden en layout).

- [ ] **Step 5: Commit**

```bash
git add src/app/tech/page.tsx
git commit -m "feat(tech): redesign home with bento stats grid and prochaine intervention widget"
```
