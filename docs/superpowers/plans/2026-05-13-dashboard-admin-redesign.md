# Dashboard Admin Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Extraer los componentes inline de `src/app/admin/page.tsx` a archivos propios y añadir una tabla de incidencias recientes con un botón "Nouveau Ticket" en el header.

**Architecture:** Cada componente inline de `page.tsx` se extrae a su propio archivo en `src/components/admin/`. Un nuevo Server Component (`DashboardRecentIncidents`) hace su propio fetch a Supabase con joins a `clients` y `profiles`. Al finalizar, `page.tsx` contiene solo `getDashboardData()` y composición JSX sin ningún componente ni lógica inline.

**Tech Stack:** Next.js 16 App Router, TypeScript, Tailwind CSS v4, Supabase SSR (`@supabase/ssr`)

---

## Mapa de archivos

| Acción | Archivo |
|---|---|
| Crear | `src/components/admin/DashboardKpiStrip.tsx` |
| Crear | `src/components/admin/DashboardCopiesBanner.tsx` |
| Crear | `src/components/admin/DashboardTechTable.tsx` |
| Crear | `src/components/admin/DashboardStatusDist.tsx` |
| Crear | `src/components/admin/DashboardRecentIncidents.tsx` |
| Modificar | `src/app/admin/page.tsx` |

**No se tocan:** `DashboardCharts.tsx`, `AgendaPanel.tsx`, `AgendaPanelWrapper.tsx`, `layout.tsx`

---

## Task 1: Crear DashboardKpiStrip

Extrae `KpiCard` y `CsatStars` (actualmente inline en `page.tsx`) a un componente propio y actualiza `page.tsx` para usarlo.

**Files:**
- Create: `src/components/admin/DashboardKpiStrip.tsx`
- Modify: `src/app/admin/page.tsx`

- [ ] **Step 1.1: Crear el componente**

Crear `src/components/admin/DashboardKpiStrip.tsx`:

```tsx
import { Users, Printer, FileText, AlertCircle } from 'lucide-react'

type Props = {
  clients: number
  machines: number
  contracts: number
  openIncidents: number
  avgCsat: number
}

function KpiCard({
  label, value, sub, icon: Icon, accent,
}: {
  label: string
  value: string | number
  sub?: string
  icon: React.ElementType
  accent: string
}) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 p-5">
      <div className="flex items-start justify-between mb-3">
        <p className="text-xs font-medium text-gray-400 uppercase tracking-wider leading-none">{label}</p>
        <div
          className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0"
          style={{ backgroundColor: `${accent}18` }}
        >
          <Icon size={16} style={{ color: accent }} />
        </div>
      </div>
      <p className="text-3xl font-bold text-gray-900 leading-none" style={{ fontFamily: 'Poppins, sans-serif' }}>
        {value}
      </p>
      {sub && <p className="text-xs text-gray-400 mt-2">{sub}</p>}
    </div>
  )
}

function CsatStars({ avg }: { avg: number }) {
  const filled = Math.round(avg)
  return (
    <div className="flex gap-0.5 mt-2">
      {[1, 2, 3, 4, 5].map(n => (
        <span key={n} className="text-base leading-none" style={{ color: n <= filled ? '#F59E0B' : '#E5E7EB' }}>
          ★
        </span>
      ))}
    </div>
  )
}

export default function DashboardKpiStrip({ clients, machines, contracts, openIncidents, avgCsat }: Props) {
  return (
    <div className="grid grid-cols-5 gap-4">
      <KpiCard label="Clients actifs" value={clients} icon={Users} accent="#3B82F6" sub="entreprises & institutions" />
      <KpiCard label="Machines actives" value={machines} icon={Printer} accent="#10B981" sub="en location" />
      <KpiCard label="Contrats actifs" value={contracts} icon={FileText} accent="#8B5CF6" />
      <div className="bg-white rounded-xl border border-gray-200 p-5">
        <div className="flex items-start justify-between mb-3">
          <p className="text-xs font-medium text-gray-400 uppercase tracking-wider leading-none">CSAT moyen</p>
          <div className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0" style={{ backgroundColor: '#F59E0B18' }}>
            <span style={{ color: '#F59E0B', fontSize: 16, lineHeight: 1 }}>★</span>
          </div>
        </div>
        <p className="text-3xl font-bold text-gray-900 leading-none" style={{ fontFamily: 'Poppins, sans-serif' }}>
          {avgCsat > 0 ? avgCsat.toFixed(1) : '—'}
          {avgCsat > 0 && <span className="text-sm font-normal text-gray-400 ml-1">/5</span>}
        </p>
        {avgCsat > 0 ? <CsatStars avg={avgCsat} /> : <p className="text-xs text-gray-400 mt-2">Aucune réponse</p>}
      </div>
      <KpiCard
        label="Incidents ouverts"
        value={openIncidents}
        icon={AlertCircle}
        accent="#BF0D0D"
        sub={openIncidents > 0 ? 'en attente de résolution' : 'tout est résolu ✓'}
      />
    </div>
  )
}
```

- [ ] **Step 1.2: Actualizar `page.tsx` — añadir import y sustituir KPI strip**

En `src/app/admin/page.tsx`:

a) Añadir import al bloque de imports existente:
```tsx
import DashboardKpiStrip from '@/components/admin/DashboardKpiStrip'
```

b) Eliminar las funciones inline `KpiCard` y `CsatStars` (líneas 157–196 actuales).

c) Eliminar los imports `Users, Printer, FileText, AlertCircle` de `lucide-react` (ya no se usan en este archivo). El import queda:
```tsx
import { BarChart2 } from 'lucide-react'
```

d) Sustituir el bloque `{/* KPI strip */}` (el `<div className="grid grid-cols-5 gap-4">` con los 5 KPI cards) por:
```tsx
<DashboardKpiStrip
  clients={data.stats.clients}
  machines={data.stats.machines}
  contracts={data.stats.contracts}
  openIncidents={data.stats.openIncidents}
  avgCsat={data.avgCsat}
/>
```

- [ ] **Step 1.3: Verificar TypeScript**

```bash
cd "/Users/juanmiguel/Claude/Web AMD Codex/web-amd" && npx tsc --noEmit
```

Resultado esperado: sin output (cero errores).

- [ ] **Step 1.4: Verificar en el navegador**

Abrir `http://localhost:3000/admin`. Los 5 KPI cards deben aparecer idénticos a antes.

---

## Task 2: Crear DashboardCopiesBanner

Extrae el banner rojo de copias a su propio componente.

**Files:**
- Create: `src/components/admin/DashboardCopiesBanner.tsx`
- Modify: `src/app/admin/page.tsx`

- [ ] **Step 2.1: Crear el componente**

Crear `src/components/admin/DashboardCopiesBanner.tsx`:

```tsx
import Link from 'next/link'
import { BarChart2 } from 'lucide-react'

type Props = {
  totalCopies: number
}

export default function DashboardCopiesBanner({ totalCopies }: Props) {
  if (totalCopies === 0) return null

  return (
    <div
      className="rounded-xl p-5 flex items-center justify-between"
      style={{ backgroundColor: '#BF0D0D', color: 'white' }}
    >
      <div className="flex items-center gap-3">
        <BarChart2 size={20} className="opacity-80" />
        <div>
          <p className="text-xs font-medium opacity-70 uppercase tracking-wider">Copies enregistrées ce mois</p>
          <p className="text-2xl font-bold mt-0.5" style={{ fontFamily: 'Poppins, sans-serif' }}>
            {totalCopies.toLocaleString('fr-FR')}
          </p>
        </div>
      </div>
      <Link
        href="/admin/contadores"
        className="text-sm font-medium opacity-80 hover:opacity-100 transition-opacity border border-white/30 rounded-lg px-3 py-1.5"
      >
        Voir les compteurs →
      </Link>
    </div>
  )
}
```

- [ ] **Step 2.2: Actualizar `page.tsx`**

a) Añadir import:
```tsx
import DashboardCopiesBanner from '@/components/admin/DashboardCopiesBanner'
```

b) Eliminar el import `BarChart2` de `lucide-react` (ya no se usa en `page.tsx`). El import queda vacío — eliminar la línea completa.

c) Sustituir el bloque `{/* Copies KPI — full width banner */}` (el `{data.totalCopies > 0 && (...)}`) por:
```tsx
<DashboardCopiesBanner totalCopies={data.totalCopies} />
```

- [ ] **Step 2.3: Verificar TypeScript**

```bash
cd "/Users/juanmiguel/Claude/Web AMD Codex/web-amd" && npx tsc --noEmit
```

Resultado esperado: sin output.

- [ ] **Step 2.4: Verificar en el navegador**

Abrir `http://localhost:3000/admin`. El banner rojo debe aparecer solo si hay copias registradas este mes.

---

## Task 3: Crear DashboardTechTable

Extrae la tabla de performance de técnicos y `RateChip` a su propio componente. Exporta el tipo `TechPerf` para que `page.tsx` lo importe.

**Files:**
- Create: `src/components/admin/DashboardTechTable.tsx`
- Modify: `src/app/admin/page.tsx`

- [ ] **Step 3.1: Crear el componente**

Crear `src/components/admin/DashboardTechTable.tsx`:

```tsx
import Link from 'next/link'

export type TechPerf = {
  id: string
  fullName: string
  total: number
  resolved: number
  active: number
  rate: number
}

type Props = {
  techPerf: TechPerf[]
}

function RateChip({ rate, total }: { rate: number; total: number }) {
  if (total === 0) return <span className="text-xs text-gray-400">—</span>
  const cls =
    rate >= 80 ? 'bg-green-100 text-green-700' :
    rate >= 50 ? 'bg-orange-100 text-orange-700' :
                 'bg-red-100 text-red-700'
  return (
    <span className={`inline-flex text-xs font-semibold px-2 py-0.5 rounded-full ${cls}`}>
      {rate}%
    </span>
  )
}

export default function DashboardTechTable({ techPerf }: Props) {
  return (
    <div className="col-span-3 bg-white rounded-xl border border-gray-200 overflow-hidden">
      <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
        <h2 className="text-sm font-semibold text-gray-900">Performance équipe technique</h2>
        <Link href="/admin/team" className="text-xs text-gray-400 hover:text-gray-700 transition-colors">
          Gérer l&apos;équipe →
        </Link>
      </div>
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-gray-50 bg-gray-50/60">
            <th className="text-left text-[11px] font-medium text-gray-400 px-6 py-3">Technicien</th>
            <th className="text-right text-[11px] font-medium text-gray-400 px-4 py-3">Total</th>
            <th className="text-right text-[11px] font-medium text-gray-400 px-4 py-3">Résolus</th>
            <th className="text-right text-[11px] font-medium text-gray-400 px-4 py-3">En cours</th>
            <th className="text-right text-[11px] font-medium text-gray-400 px-6 py-3">Taux</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-50">
          {techPerf.length === 0 ? (
            <tr>
              <td colSpan={5} className="px-6 py-10 text-center text-sm text-gray-400">
                Aucun technicien enregistré
              </td>
            </tr>
          ) : (
            techPerf.map(tech => (
              <tr key={tech.id} className="hover:bg-gray-50/60 transition-colors">
                <td className="px-6 py-3.5 font-medium text-gray-900">{tech.fullName}</td>
                <td className="px-4 py-3.5 text-right text-gray-600">{tech.total}</td>
                <td className="px-4 py-3.5 text-right font-medium text-green-600">{tech.resolved}</td>
                <td className="px-4 py-3.5 text-right text-orange-500">{tech.active}</td>
                <td className="px-6 py-3.5 text-right">
                  <RateChip rate={tech.rate} total={tech.total} />
                </td>
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  )
}
```

- [ ] **Step 3.2: Actualizar `page.tsx`**

a) Añadir imports:
```tsx
import DashboardTechTable from '@/components/admin/DashboardTechTable'
import type { TechPerf } from '@/components/admin/DashboardTechTable'
```

b) Eliminar la definición local del tipo `TechPerf` (las líneas `type TechPerf = { ... }`).

c) Eliminar la función inline `RateChip`.

d) En el bloque `{/* Bottom row */}`, sustituir el `<div className="col-span-3 ...">` completo (la tabla de técnicos) por:
```tsx
<DashboardTechTable techPerf={data.techPerf} />
```

- [ ] **Step 3.3: Verificar TypeScript**

```bash
cd "/Users/juanmiguel/Claude/Web AMD Codex/web-amd" && npx tsc --noEmit
```

Resultado esperado: sin output.

- [ ] **Step 3.4: Verificar en el navegador**

Abrir `http://localhost:3000/admin`. La tabla de técnicos debe aparecer idéntica.

---

## Task 4: Crear DashboardStatusDist

Extrae la distribución de estados de incidencias a su propio componente. `STATUS_CONFIG` se mueve aquí ya que solo lo usa este componente.

**Files:**
- Create: `src/components/admin/DashboardStatusDist.tsx`
- Modify: `src/app/admin/page.tsx`

- [ ] **Step 4.1: Crear el componente**

Crear `src/components/admin/DashboardStatusDist.tsx`:

```tsx
import Link from 'next/link'

const STATUS_CONFIG: Record<string, { label: string; color: string }> = {
  nouveau:  { label: 'Nouveau',  color: '#3B82F6' },
  assigné:  { label: 'Assigné',  color: '#F59E0B' },
  en_cours: { label: 'En cours', color: '#F97316' },
  résolu:   { label: 'Résolu',   color: '#10B981' },
  fermé:    { label: 'Fermé',    color: '#6B7280' },
}

type Props = {
  statusDist: Record<string, number>
  statusTotal: number
}

export default function DashboardStatusDist({ statusDist, statusTotal }: Props) {
  return (
    <div className="col-span-2 bg-white rounded-xl border border-gray-200 p-6">
      <div className="flex items-center justify-between mb-5">
        <h2 className="text-sm font-semibold text-gray-900">Statut des incidents</h2>
        <Link href="/admin/incidents" className="text-xs text-gray-400 hover:text-gray-700 transition-colors">
          Voir le kanban →
        </Link>
      </div>

      {statusTotal === 0 ? (
        <div className="flex items-center justify-center h-32 text-sm text-gray-400">
          Aucun incident enregistré
        </div>
      ) : (
        <div className="space-y-4">
          {Object.entries(STATUS_CONFIG).map(([key, { label, color }]) => {
            const count = statusDist[key] ?? 0
            const pct   = Math.round((count / statusTotal) * 100)
            return (
              <div key={key}>
                <div className="flex items-center justify-between mb-1.5">
                  <div className="flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: color }} />
                    <span className="text-xs font-medium text-gray-600">{label}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-semibold text-gray-800">{count}</span>
                    <span className="text-xs text-gray-400 w-8 text-right">{pct}%</span>
                  </div>
                </div>
                <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
                  <div
                    className="h-full rounded-full transition-all duration-500"
                    style={{ width: `${pct}%`, backgroundColor: color }}
                  />
                </div>
              </div>
            )
          })}
        </div>
      )}

      <div className="mt-5 pt-4 border-t border-gray-100 flex items-center justify-between">
        <p className="text-xs text-gray-400">Total enregistrés</p>
        <p className="text-sm font-semibold text-gray-900">{statusTotal}</p>
      </div>
    </div>
  )
}
```

- [ ] **Step 4.2: Actualizar `page.tsx`**

a) Añadir import:
```tsx
import DashboardStatusDist from '@/components/admin/DashboardStatusDist'
```

b) Eliminar la constante `STATUS_CONFIG` del archivo (ya vive en el componente).

c) En el bloque `{/* Bottom row */}`, sustituir el `<div className="col-span-2 ...">` completo (la distribución de estados) por:
```tsx
<DashboardStatusDist statusDist={data.statusDist} statusTotal={data.statusTotal} />
```

- [ ] **Step 4.3: Verificar TypeScript**

```bash
cd "/Users/juanmiguel/Claude/Web AMD Codex/web-amd" && npx tsc --noEmit
```

Resultado esperado: sin output.

- [ ] **Step 4.4: Verificar en el navegador**

Abrir `http://localhost:3000/admin`. Las barras de estado deben aparecer idénticas.

---

## Task 5: Crear DashboardRecentIncidents

Nuevo Server Component que hace su propio fetch a Supabase con joins a `clients` y `profiles`.

**Files:**
- Create: `src/components/admin/DashboardRecentIncidents.tsx`

- [ ] **Step 5.1: Crear el componente**

Crear `src/components/admin/DashboardRecentIncidents.tsx`:

```tsx
import { createClient } from '@/lib/supabase/server'
import Link from 'next/link'

const STATUS_BADGE: Record<string, { label: string; className: string }> = {
  nouveau:  { label: 'Nouveau',  className: 'bg-blue-50 text-blue-700' },
  assigné:  { label: 'Assigné',  className: 'bg-purple-50 text-purple-700' },
  en_cours: { label: 'En cours', className: 'bg-amber-50 text-amber-700' },
}

type RecentIncident = {
  id: string
  title: string
  status: string
  created_at: string
  clients: { nom_client: string } | null
  profiles: { full_name: string } | null
}

export default async function DashboardRecentIncidents() {
  const supabase = await createClient()

  const { data } = await supabase
    .from('incidents')
    .select(`
      id, title, status, created_at,
      clients!client_id ( nom_client ),
      profiles!assigned_to ( full_name )
    `)
    .not('status', 'in', '("résolu","fermé")')
    .order('created_at', { ascending: false })
    .limit(8)

  const incidents = (data ?? []) as RecentIncident[]

  return (
    <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
      <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
        <h2 className="text-sm font-semibold text-gray-900">Incidents récents</h2>
        <Link href="/admin/incidents" className="text-xs text-gray-400 hover:text-gray-700 transition-colors">
          Voir tout →
        </Link>
      </div>
      <table className="w-full text-sm">
        <thead>
          <tr className="bg-gray-50/60 border-b border-gray-50">
            <th className="text-left text-[11px] font-medium text-gray-400 px-6 py-3">Titre</th>
            <th className="text-left text-[11px] font-medium text-gray-400 px-4 py-3">Client</th>
            <th className="text-left text-[11px] font-medium text-gray-400 px-4 py-3">Statut</th>
            <th className="text-left text-[11px] font-medium text-gray-400 px-4 py-3">Technicien</th>
            <th className="text-right text-[11px] font-medium text-gray-400 px-6 py-3">Date</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-50">
          {incidents.length === 0 ? (
            <tr>
              <td colSpan={5} className="px-6 py-10 text-center text-sm text-gray-400">
                Aucun incident ouvert
              </td>
            </tr>
          ) : (
            incidents.map(inc => {
              const badge = STATUS_BADGE[inc.status]
              return (
                <tr key={inc.id} className="hover:bg-gray-50/60 transition-colors">
                  <td className="px-6 py-3.5">
                    <Link
                      href={`/admin/incidents/${inc.id}`}
                      className="font-medium text-gray-900 hover:text-[#BF0D0D] transition-colors truncate block max-w-[220px]"
                    >
                      {inc.title}
                    </Link>
                  </td>
                  <td className="px-4 py-3.5 text-gray-600">{inc.clients?.nom_client ?? '—'}</td>
                  <td className="px-4 py-3.5">
                    {badge ? (
                      <span className={`inline-flex px-2 py-0.5 rounded text-[10px] font-semibold ${badge.className}`}>
                        {badge.label}
                      </span>
                    ) : (
                      <span className="text-xs text-gray-400">{inc.status}</span>
                    )}
                  </td>
                  <td className="px-4 py-3.5 text-gray-600">{inc.profiles?.full_name ?? 'Non assigné'}</td>
                  <td className="px-6 py-3.5 text-right text-xs text-gray-400 whitespace-nowrap">
                    {new Date(inc.created_at).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })}
                  </td>
                </tr>
              )
            })
          )}
        </tbody>
      </table>
    </div>
  )
}
```

- [ ] **Step 5.2: Verificar TypeScript**

```bash
cd "/Users/juanmiguel/Claude/Web AMD Codex/web-amd" && npx tsc --noEmit
```

Resultado esperado: sin output. (El componente no está en uso todavía — esto solo verifica que no hay errores de tipos.)

---

## Task 6: Actualizar page.tsx — nuevo layout

Integra `DashboardRecentIncidents` en el layout, añade el botón "+ Nouveau Ticket" en el header y elimina `currentMonthLabel` (ya no se usa). Al finalizar, `page.tsx` no tiene ningún componente inline ni lógica de presentación.

**Files:**
- Modify: `src/app/admin/page.tsx`

- [ ] **Step 6.1: Reescribir `page.tsx`**

Reemplazar el contenido completo de `src/app/admin/page.tsx` con:

```tsx
import { createClient } from '@/lib/supabase/server'
import Link from 'next/link'
import { Plus } from 'lucide-react'
import { CsatTrendChart, IncidentsTrendChart } from '@/components/admin/DashboardCharts'
import type { CsatPoint, IncidentPoint } from '@/components/admin/DashboardCharts'
import DashboardKpiStrip from '@/components/admin/DashboardKpiStrip'
import DashboardCopiesBanner from '@/components/admin/DashboardCopiesBanner'
import DashboardRecentIncidents from '@/components/admin/DashboardRecentIncidents'
import DashboardTechTable from '@/components/admin/DashboardTechTable'
import type { TechPerf } from '@/components/admin/DashboardTechTable'
import DashboardStatusDist from '@/components/admin/DashboardStatusDist'

const MONTHS_FR = ['', 'Jan', 'Fév', 'Mar', 'Avr', 'Mai', 'Juin', 'Juil', 'Août', 'Sep', 'Oct', 'Nov', 'Déc']

async function getDashboardData() {
  const supabase = await createClient()
  const now = new Date()
  const currentYear  = now.getFullYear()
  const currentMonth = now.getMonth() + 1

  const last6Months = Array.from({ length: 6 }, (_, i) => {
    const d = new Date(now)
    d.setMonth(d.getMonth() - (5 - i))
    return { year: d.getFullYear(), month: d.getMonth() + 1, label: MONTHS_FR[d.getMonth() + 1] }
  })

  const sixMonthsAgo = new Date(now)
  sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6)

  const [
    clientsRes,
    machinesRes,
    contractsRes,
    incidentsRes,
    csatRes,
    countersRes,
    techRes,
  ] = await Promise.all([
    supabase.from('clients').select('*', { count: 'exact', head: true }).eq('active', true),
    supabase.from('machines').select('*', { count: 'exact', head: true }).eq('active', true),
    supabase.from('contracts').select('*', { count: 'exact', head: true }).eq('statut', 'actif'),
    supabase
      .from('incidents')
      .select('id, status, assigned_to, created_at')
      .gte('created_at', sixMonthsAgo.toISOString())
      .limit(500),
    supabase
      .from('csat_responses')
      .select('rating, responded_at')
      .not('responded_at', 'is', null)
      .gte('responded_at', sixMonthsAgo.toISOString())
      .limit(300),
    supabase
      .from('machine_counters')
      .select('counter_bw, counter_color')
      .eq('year', currentYear)
      .eq('month', currentMonth)
      .eq('status', 'actif'),
    supabase.from('profiles').select('id, full_name').eq('role', 'technician').order('full_name'),
  ])

  const incidents = incidentsRes.data ?? []
  const csatData  = csatRes.data      ?? []
  const counters  = countersRes.data  ?? []
  const techs     = techRes.data      ?? []

  const openIncidents = incidents.filter(i => !['résolu', 'fermé'].includes(i.status)).length
  const totalCopies   = counters.reduce((s, c) => s + (c.counter_bw ?? 0) + (c.counter_color ?? 0), 0)
  const avgCsat       = csatData.length
    ? csatData.reduce((s, r) => s + r.rating, 0) / csatData.length
    : 0

  const csatByMonth: Record<string, { sum: number; count: number }> = {}
  csatData.forEach(r => {
    const d   = new Date(r.responded_at!)
    const key = `${d.getFullYear()}-${d.getMonth() + 1}`
    if (!csatByMonth[key]) csatByMonth[key] = { sum: 0, count: 0 }
    csatByMonth[key].sum   += r.rating
    csatByMonth[key].count += 1
  })
  const csatTrend: CsatPoint[] = last6Months.map(m => {
    const entry = csatByMonth[`${m.year}-${m.month}`]
    return { month: m.label, avg: entry ? parseFloat((entry.sum / entry.count).toFixed(2)) : null, count: entry?.count ?? 0 }
  })

  const incidentMonthMap: Record<string, number> = {}
  incidents.forEach(inc => {
    const d   = new Date(inc.created_at)
    const key = `${d.getFullYear()}-${d.getMonth() + 1}`
    incidentMonthMap[key] = (incidentMonthMap[key] ?? 0) + 1
  })
  const incidentsTrend: IncidentPoint[] = last6Months.map(m => ({
    month: m.label,
    total: incidentMonthMap[`${m.year}-${m.month}`] ?? 0,
  }))

  const statusDist = incidents.reduce((acc, inc) => {
    acc[inc.status] = (acc[inc.status] ?? 0) + 1
    return acc
  }, {} as Record<string, number>)
  const statusTotal = Object.values(statusDist).reduce((a, b) => a + b, 0)

  const techPerf: TechPerf[] = techs
    .map(tech => {
      const mine     = incidents.filter(i => i.assigned_to === tech.id)
      const total    = mine.length
      const resolved = mine.filter(i => ['résolu', 'fermé'].includes(i.status)).length
      const active   = mine.filter(i => ['assigné', 'en_cours'].includes(i.status)).length
      const rate     = total > 0 ? Math.round((resolved / total) * 100) : 0
      return { id: tech.id, fullName: tech.full_name ?? '—', total, resolved, active, rate }
    })
    .sort((a, b) => b.total - a.total)

  return {
    stats: { clients: clientsRes.count ?? 0, machines: machinesRes.count ?? 0, contracts: contractsRes.count ?? 0, openIncidents },
    totalCopies,
    avgCsat,
    csatCount:  csatData.length,
    csatTrend,
    incidentsTrend,
    statusDist,
    statusTotal,
    techPerf,
    today: now.toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' }),
  }
}

export default async function Dashboard() {
  const data = await getDashboardData()

  return (
    <div className="p-8 space-y-6">

      {/* Header */}
      <div className="flex items-end justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900" style={{ fontFamily: 'Poppins, sans-serif' }}>
            Tableau de bord
          </h1>
          <p className="text-sm text-gray-400 mt-0.5">Vue direction — {data.today}</p>
        </div>
        <Link
          href="/admin/incidents/new"
          className="flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium text-white transition-opacity hover:opacity-90"
          style={{ backgroundColor: '#BF0D0D' }}
        >
          <Plus size={16} />
          Nouveau Ticket
        </Link>
      </div>

      <DashboardKpiStrip
        clients={data.stats.clients}
        machines={data.stats.machines}
        contracts={data.stats.contracts}
        openIncidents={data.stats.openIncidents}
        avgCsat={data.avgCsat}
      />

      <DashboardCopiesBanner totalCopies={data.totalCopies} />

      <DashboardRecentIncidents />

      {/* Charts */}
      <div className="grid grid-cols-5 gap-5">
        <div className="col-span-3 bg-white rounded-xl border border-gray-200 p-6">
          <div className="flex items-center justify-between mb-5">
            <div>
              <h2 className="text-sm font-semibold text-gray-900">Évolution CSAT</h2>
              <p className="text-xs text-gray-400 mt-0.5">Note moyenne de satisfaction sur 6 mois</p>
            </div>
            {data.csatCount > 0 && (
              <span className="text-xs text-gray-400 bg-gray-50 border border-gray-100 rounded-full px-2.5 py-1">
                {data.csatCount} réponses
              </span>
            )}
          </div>
          <CsatTrendChart data={data.csatTrend} />
          {data.avgCsat > 0 && (
            <p className="text-xs text-gray-400 mt-3">Ligne verte = objectif 4/5</p>
          )}
        </div>
        <div className="col-span-2 bg-white rounded-xl border border-gray-200 p-6">
          <div className="mb-5">
            <h2 className="text-sm font-semibold text-gray-900">Nouvelles interventions</h2>
            <p className="text-xs text-gray-400 mt-0.5">Incidents créés par mois (6 mois)</p>
          </div>
          <IncidentsTrendChart data={data.incidentsTrend} />
        </div>
      </div>

      {/* Performance */}
      <div className="grid grid-cols-5 gap-5">
        <DashboardTechTable techPerf={data.techPerf} />
        <DashboardStatusDist statusDist={data.statusDist} statusTotal={data.statusTotal} />
      </div>

    </div>
  )
}
```

- [ ] **Step 6.2: Verificar TypeScript**

```bash
cd "/Users/juanmiguel/Claude/Web AMD Codex/web-amd" && npx tsc --noEmit
```

Resultado esperado: sin output.

- [ ] **Step 6.3: Verificar en el navegador**

Abrir `http://localhost:3000/admin` y comprobar:
- Header muestra título + fecha + botón rojo "Nouveau Ticket"
- 5 KPI cards visibles
- Banner de copias visible (si hay datos este mes)
- Tabla "Incidents récents" con columnas: Titre, Client, Statut, Technicien, Date
- Gráficos CSAT e intervenciones sin cambios
- Tabla de técnicos sin cambios
- Distribución de estados sin cambios

- [ ] **Step 6.4: Verificar que page.tsx no tiene componentes inline**

```bash
grep -n "^function " "/Users/juanmiguel/Claude/Web AMD Codex/web-amd/src/app/admin/page.tsx"
```

Resultado esperado: solo `getDashboardData` y `Dashboard` aparecen. Si aparece `KpiCard`, `CsatStars`, `RateChip` u otra función, hay un componente inline que no se eliminó.

---

## Checklist final

- [ ] 5 archivos nuevos creados en `src/components/admin/`
- [ ] `page.tsx` sin componentes inline (`KpiCard`, `CsatStars`, `RateChip`, `STATUS_CONFIG` eliminados)
- [ ] `page.tsx` sin `currentMonthLabel` (eliminado del return de `getDashboardData`)
- [ ] `npx tsc --noEmit` sin errores
- [ ] Dashboard visible y funcional en `http://localhost:3000/admin`
