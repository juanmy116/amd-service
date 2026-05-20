# Bloque 1b — Rediseño Dashboard `/admin` — Plan de Implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Migrar los 6 componentes Dashboard* al sistema de tokens y componentes de la Fase 0, añadiendo KPI cards con gradiente diagonal y colores por tipo de dato.

**Architecture:** Cambio puramente de presentación — sin tocar lógica, queries ni Server Actions. Cada componente reemplaza colores hardcodeados por tokens Tailwind v4, y los wrappers de panel pasan a usar `Card` + `PanelHeader` de Fase 0. `DashboardCharts.tsx` no se modifica.

**Tech Stack:** Next.js 16 · TypeScript · Tailwind CSS v4 · Lucide React · componentes Fase 0 (`Card`, `PanelHeader`, `Badge`, `buttonClasses`) en `src/components/ui/`

---

## Archivos modificados

| Archivo | Cambio |
|---|---|
| `src/components/admin/DashboardKpiStrip.tsx` | KpiCard local reescrito: gradiente diagonal + Lucide icons + colores por KPI |
| `src/components/admin/DashboardCopiesBanner.tsx` | `style` inline → `bg-accent` |
| `src/components/admin/DashboardRecentIncidents.tsx` | Card + PanelHeader + Badge + tokens |
| `src/components/admin/DashboardStatusDist.tsx` | Card + PanelHeader + tokens |
| `src/components/admin/DashboardTechTable.tsx` | Card + PanelHeader + tokens |
| `src/app/admin/page.tsx` | Header → tokens + `buttonClasses` · wrappers de charts → Card |
| `src/components/admin/DashboardCharts.tsx` | **Sin cambios** |

---

## Task 0: Crear rama de trabajo

- [ ] **Desde `main` limpio, crear la rama:**

```bash
git checkout main && git pull
git checkout -b feat/rediseno-bloque-1b-dashboard
```

---

## Task 1: DashboardCopiesBanner — migrar a `bg-accent`

**Files:**
- Modify: `src/components/admin/DashboardCopiesBanner.tsx`

- [ ] **Reescribir el archivo:**

```tsx
import Link from 'next/link'
import { BarChart2 } from 'lucide-react'

type Props = { totalCopies: number }

export default function DashboardCopiesBanner({ totalCopies }: Props) {
  if (totalCopies === 0) return null
  return (
    <div className="bg-accent rounded-card p-5 flex items-center justify-between text-white">
      <div className="flex items-center gap-3">
        <BarChart2 size={20} className="opacity-80" />
        <div>
          <p className="text-xs font-medium opacity-70 uppercase tracking-wider">
            Copies enregistrées ce mois
          </p>
          <p className="font-display text-2xl font-bold mt-0.5">
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

- [ ] **Verificar TypeScript:**

```bash
cd web-amd && npx tsc --noEmit
```

Esperado: 0 errores.

- [ ] **Commit:**

```bash
git add src/components/admin/DashboardCopiesBanner.tsx
git commit -m "refactor(dashboard): banner copias usa bg-accent token"
```

---

## Task 2: DashboardKpiStrip — KpiCard con gradiente + colores por KPI

**Files:**
- Modify: `src/components/admin/DashboardKpiStrip.tsx`

- [ ] **Reescribir el archivo completo:**

```tsx
import { Users, Printer, FileText, AlertCircle } from 'lucide-react'
import type { ElementType } from 'react'

type Props = {
  clients: number
  machines: number
  contracts: number
  openIncidents: number
  avgCsat: number
}

type KpiDef = {
  label: string
  value: string | number
  sub?: string
  icon: ElementType
  iconColor: string
  iconBg: string
  gradientFrom: string
}

function KpiCard({ label, value, sub, icon: Icon, iconColor, iconBg, gradientFrom }: KpiDef) {
  return (
    <div
      className="border border-line rounded-card shadow-card p-[18px]"
      style={{ background: `linear-gradient(135deg, ${gradientFrom} 0%, #FFFFFF 55%)` }}
    >
      <div className="flex items-start justify-between mb-3">
        <p className="text-[10px] font-semibold text-ink-muted uppercase tracking-[0.07em] leading-none">
          {label}
        </p>
        <div
          className="w-[34px] h-[34px] rounded-[9px] flex items-center justify-center shrink-0"
          style={{ background: iconBg }}
        >
          <Icon size={16} style={{ color: iconColor }} />
        </div>
      </div>
      <p className="font-display text-[26px] font-semibold text-ink leading-none">{value}</p>
      {sub && <p className="text-[11px] text-ink-muted mt-1.5">{sub}</p>}
    </div>
  )
}

function CsatCard({ avg }: { avg: number }) {
  const filled = Math.round(avg)
  return (
    <div
      className="border border-line rounded-card shadow-card p-[18px]"
      style={{ background: 'linear-gradient(135deg, #FFFBEB 0%, #FFFFFF 55%)' }}
    >
      <div className="flex items-start justify-between mb-3">
        <p className="text-[10px] font-semibold text-ink-muted uppercase tracking-[0.07em] leading-none">
          CSAT moyen
        </p>
        <div
          className="w-[34px] h-[34px] rounded-[9px] flex items-center justify-center shrink-0 text-base leading-none"
          style={{ background: '#FDE68A', color: '#B45309' }}
        >
          ★
        </div>
      </div>
      <p className="font-display text-[26px] font-semibold text-ink leading-none">
        {avg > 0 ? avg.toFixed(1) : '—'}
        {avg > 0 && <span className="text-sm font-normal text-ink-muted ml-1">/5</span>}
      </p>
      {avg > 0 ? (
        <div className="flex gap-0.5 mt-1.5">
          {[1, 2, 3, 4, 5].map(n => (
            <span
              key={n}
              className="text-[13px] leading-none"
              style={{ color: n <= filled ? '#F59E0B' : '#E5E7EB' }}
            >
              ★
            </span>
          ))}
        </div>
      ) : (
        <p className="text-[11px] text-ink-muted mt-1.5">Aucune réponse</p>
      )}
    </div>
  )
}

export default function DashboardKpiStrip({ clients, machines, contracts, openIncidents, avgCsat }: Props) {
  return (
    <div className="grid grid-cols-5 gap-4">
      <KpiCard
        label="Clients actifs"
        value={clients}
        sub="entreprises & institutions"
        icon={Users}
        iconColor="#3B82F6"
        iconBg="#DBEAFE"
        gradientFrom="#EFF6FF"
      />
      <KpiCard
        label="Machines actives"
        value={machines}
        sub="en location"
        icon={Printer}
        iconColor="#10B981"
        iconBg="#D1FAE5"
        gradientFrom="#ECFDF5"
      />
      <KpiCard
        label="Contrats actifs"
        value={contracts}
        icon={FileText}
        iconColor="#8B5CF6"
        iconBg="#EDE9FE"
        gradientFrom="#F5F3FF"
      />
      <CsatCard avg={avgCsat} />
      <KpiCard
        label="Incidents ouverts"
        value={openIncidents}
        sub={openIncidents > 0 ? 'en attente de résolution' : 'tout est résolu ✓'}
        icon={AlertCircle}
        iconColor="#BF0D0D"
        iconBg="#FECACA"
        gradientFrom="#FEF2F2"
      />
    </div>
  )
}
```

- [ ] **Verificar TypeScript:**

```bash
npx tsc --noEmit
```

Esperado: 0 errores.

- [ ] **Commit:**

```bash
git add src/components/admin/DashboardKpiStrip.tsx
git commit -m "refactor(dashboard): KPI cards con gradiente diagonal y colores por tipo"
```

---

## Task 3: DashboardRecentIncidents — Card + PanelHeader + Badge

**Files:**
- Modify: `src/components/admin/DashboardRecentIncidents.tsx`

- [ ] **Reescribir el archivo:**

```tsx
import { createClient } from '@/lib/supabase/server'
import Link from 'next/link'
import { Card } from '@/components/ui/Card'
import { PanelHeader } from '@/components/ui/PanelHeader'
import { Badge } from '@/components/ui/Badge'
import type { BadgeVariant } from '@/components/ui/Badge'

const STATUS_BADGE: Record<string, { label: string; variant: BadgeVariant; className?: string }> = {
  nouveau:  { label: 'Nouveau',  variant: 'neutral', className: 'bg-blue-50 text-blue-700' },
  assigné:  { label: 'Assigné',  variant: 'warning' },
  en_cours: { label: 'En cours', variant: 'neutral' },
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

  const incidents = (data ?? []) as unknown as RecentIncident[]

  return (
    <Card className="overflow-hidden">
      <PanelHeader
        title="Incidents récents"
        action={{ label: 'Voir tout →', href: '/admin/incidents' }}
      />
      <table className="w-full text-sm">
        <thead>
          <tr className="bg-neutral-soft border-b border-line-subtle">
            <th className="text-left text-[10px] font-semibold text-ink-muted uppercase tracking-[0.06em] px-4 py-2.5">
              Titre
            </th>
            <th className="text-left text-[10px] font-semibold text-ink-muted uppercase tracking-[0.06em] px-4 py-2.5">
              Client
            </th>
            <th className="text-left text-[10px] font-semibold text-ink-muted uppercase tracking-[0.06em] px-4 py-2.5">
              Statut
            </th>
            <th className="text-left text-[10px] font-semibold text-ink-muted uppercase tracking-[0.06em] px-4 py-2.5">
              Technicien
            </th>
            <th className="text-right text-[10px] font-semibold text-ink-muted uppercase tracking-[0.06em] px-4 py-2.5">
              Date
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-line-subtle">
          {incidents.length === 0 ? (
            <tr>
              <td colSpan={5} className="px-4 py-10 text-center text-sm text-ink-muted">
                Aucun incident ouvert
              </td>
            </tr>
          ) : (
            incidents.map(inc => {
              const badge = STATUS_BADGE[inc.status]
              return (
                <tr key={inc.id} className="hover:bg-neutral-soft transition-colors">
                  <td className="px-4 py-3">
                    <Link
                      href={`/admin/incidents/${inc.id}`}
                      className="font-medium text-ink hover:text-accent transition-colors truncate block max-w-[220px]"
                    >
                      {inc.title}
                    </Link>
                  </td>
                  <td className="px-4 py-3 text-ink-soft">{inc.clients?.nom_client ?? '—'}</td>
                  <td className="px-4 py-3">
                    {badge ? (
                      <Badge variant={badge.variant} className={badge.className ?? ''}>
                        {badge.label}
                      </Badge>
                    ) : (
                      <span className="text-xs text-ink-muted">{inc.status}</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-ink-soft">
                    {inc.profiles?.full_name ?? 'Non assigné'}
                  </td>
                  <td className="px-4 py-3 text-right text-xs text-ink-muted whitespace-nowrap">
                    {new Date(inc.created_at).toLocaleDateString('fr-FR', {
                      day: 'numeric',
                      month: 'short',
                    })}
                  </td>
                </tr>
              )
            })
          )}
        </tbody>
      </table>
    </Card>
  )
}
```

- [ ] **Verificar TypeScript:**

```bash
npx tsc --noEmit
```

Esperado: 0 errores.

- [ ] **Commit:**

```bash
git add src/components/admin/DashboardRecentIncidents.tsx
git commit -m "refactor(dashboard): tabla incidentes usa Card + PanelHeader + Badge"
```

---

## Task 4: DashboardStatusDist — Card + PanelHeader + tokens

**Files:**
- Modify: `src/components/admin/DashboardStatusDist.tsx`

- [ ] **Reescribir el archivo:**

```tsx
import { Card } from '@/components/ui/Card'
import { PanelHeader } from '@/components/ui/PanelHeader'

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
    <div className="col-span-2">
      <Card>
        <PanelHeader
          title="Statut des incidents"
          action={{ label: 'Voir le kanban →', href: '/admin/incidents' }}
        />
        <div className="p-5">
          {statusTotal === 0 ? (
            <div className="flex items-center justify-center h-32 text-sm text-ink-muted">
              Aucun incident enregistré
            </div>
          ) : (
            <div className="space-y-4">
              {Object.entries(STATUS_CONFIG).map(([key, { label, color }]) => {
                const count = statusDist[key] ?? 0
                const pct = Math.round((count / statusTotal) * 100)
                return (
                  <div key={key}>
                    <div className="flex items-center justify-between mb-1.5">
                      <div className="flex items-center gap-2">
                        <span
                          className="w-2 h-2 rounded-full shrink-0"
                          style={{ backgroundColor: color }}
                        />
                        <span className="text-xs font-medium text-ink-soft">{label}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-semibold text-ink">{count}</span>
                        <span className="text-xs text-ink-muted w-8 text-right">{pct}%</span>
                      </div>
                    </div>
                    <div className="h-1.5 bg-neutral-soft rounded-full overflow-hidden">
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
          <div className="mt-5 pt-4 border-t border-line-subtle flex items-center justify-between">
            <p className="text-xs text-ink-muted">Total enregistrés</p>
            <p className="text-sm font-semibold text-ink">{statusTotal}</p>
          </div>
        </div>
      </Card>
    </div>
  )
}
```

- [ ] **Verificar TypeScript:**

```bash
npx tsc --noEmit
```

Esperado: 0 errores.

- [ ] **Commit:**

```bash
git add src/components/admin/DashboardStatusDist.tsx
git commit -m "refactor(dashboard): status dist usa Card + PanelHeader + tokens"
```

---

## Task 5: DashboardTechTable — Card + PanelHeader + tokens

**Files:**
- Modify: `src/components/admin/DashboardTechTable.tsx`

- [ ] **Reescribir el archivo:**

```tsx
import { Card } from '@/components/ui/Card'
import { PanelHeader } from '@/components/ui/PanelHeader'

export type TechPerf = {
  id: string
  fullName: string
  total: number
  resolved: number
  active: number
  rate: number
}

type Props = { techPerf: TechPerf[] }

function RateChip({ rate, total }: { rate: number; total: number }) {
  if (total === 0) return <span className="text-xs text-ink-muted">—</span>
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
    <div className="col-span-3">
      <Card className="overflow-hidden">
        <PanelHeader
          title="Performance équipe technique"
          action={{ label: "Gérer l'équipe →", href: '/admin/team' }}
        />
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-neutral-soft border-b border-line-subtle">
              <th className="text-left text-[10px] font-semibold text-ink-muted uppercase tracking-[0.06em] px-4 py-2.5">
                Technicien
              </th>
              <th className="text-right text-[10px] font-semibold text-ink-muted uppercase tracking-[0.06em] px-4 py-2.5">
                Total
              </th>
              <th className="text-right text-[10px] font-semibold text-ink-muted uppercase tracking-[0.06em] px-4 py-2.5">
                Résolus
              </th>
              <th className="text-right text-[10px] font-semibold text-ink-muted uppercase tracking-[0.06em] px-4 py-2.5">
                En cours
              </th>
              <th className="text-right text-[10px] font-semibold text-ink-muted uppercase tracking-[0.06em] px-4 py-2.5">
                Taux
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line-subtle">
            {techPerf.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-4 py-10 text-center text-sm text-ink-muted">
                  Aucun technicien enregistré
                </td>
              </tr>
            ) : (
              techPerf.map(tech => (
                <tr key={tech.id} className="hover:bg-neutral-soft transition-colors">
                  <td className="px-4 py-3 font-medium text-ink">{tech.fullName}</td>
                  <td className="px-4 py-3 text-right text-ink-soft">{tech.total}</td>
                  <td className="px-4 py-3 text-right font-medium text-success">{tech.resolved}</td>
                  <td className="px-4 py-3 text-right text-warning">{tech.active}</td>
                  <td className="px-4 py-3 text-right">
                    <RateChip rate={tech.rate} total={tech.total} />
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </Card>
    </div>
  )
}
```

- [ ] **Verificar TypeScript:**

```bash
npx tsc --noEmit
```

Esperado: 0 errores.

- [ ] **Commit:**

```bash
git add src/components/admin/DashboardTechTable.tsx
git commit -m "refactor(dashboard): tech table usa Card + PanelHeader + tokens"
```

---

## Task 6: page.tsx — header + wrappers de charts

**Files:**
- Modify: `src/app/admin/page.tsx`

- [ ] **Reemplazar el bloque de imports al inicio del archivo** (mantener los existentes, añadir los nuevos):

Reemplazar:
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
```

Por:
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
import { Card } from '@/components/ui/Card'
import { buttonClasses } from '@/components/ui/Button'
```

- [ ] **Reemplazar el bloque `return` del componente `Dashboard`:**

Reemplazar todo el `return (...)` por:

```tsx
  return (
    <div className="p-8 space-y-6">

      {/* Header */}
      <div className="flex items-end justify-between">
        <div>
          <h1 className="font-display text-2xl font-semibold text-ink">
            Tableau de bord
          </h1>
          <p className="text-sm text-ink-muted mt-0.5">Vue direction — {data.today}</p>
        </div>
        <Link href="/admin/incidents/new" className={buttonClasses('primary')}>
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
        <div className="col-span-3">
          <Card>
            <div className="flex items-center justify-between px-4 py-3.5 border-b border-line-subtle">
              <div>
                <h3 className="font-display text-sm font-semibold text-ink">Évolution CSAT</h3>
                <p className="text-xs text-ink-muted mt-0.5">
                  Note moyenne de satisfaction sur 6 mois
                </p>
              </div>
              {data.csatCount > 0 && (
                <span className="text-xs text-ink-muted bg-neutral-soft border border-line rounded-full px-2.5 py-1">
                  {data.csatCount} réponses
                </span>
              )}
            </div>
            <div className="p-5">
              <CsatTrendChart data={data.csatTrend} />
              {data.avgCsat > 0 && (
                <p className="text-xs text-ink-muted mt-3">Ligne verte = objectif 4/5</p>
              )}
            </div>
          </Card>
        </div>

        <div className="col-span-2">
          <Card>
            <div className="flex items-center justify-between px-4 py-3.5 border-b border-line-subtle">
              <div>
                <h3 className="font-display text-sm font-semibold text-ink">
                  Nouvelles interventions
                </h3>
                <p className="text-xs text-ink-muted mt-0.5">
                  Incidents créés par mois (6 mois)
                </p>
              </div>
            </div>
            <div className="p-5">
              <IncidentsTrendChart data={data.incidentsTrend} />
            </div>
          </Card>
        </div>
      </div>

      {/* Performance */}
      <div className="grid grid-cols-5 gap-5">
        <DashboardTechTable techPerf={data.techPerf} />
        <DashboardStatusDist statusDist={data.statusDist} statusTotal={data.statusTotal} />
      </div>

    </div>
  )
```

- [ ] **Verificar TypeScript y build:**

```bash
npx tsc --noEmit && npm run build
```

Esperado: 0 errores TypeScript · build exitoso sin warnings nuevos.

- [ ] **Commit final:**

```bash
git add src/app/admin/page.tsx
git commit -m "refactor(dashboard): page.tsx usa tokens, buttonClasses y Card para charts"
```

---

## Task 7: Crear rama, PR y verificar

- [ ] **Verificar que estás en la rama correcta.** Si los commits anteriores se hicieron en `main` directamente, crear la rama ahora y hacer cherry-pick; si ya estás en una rama `feat/`, continuar.

  El flujo normal es: antes del Task 1, haber hecho `git checkout -b feat/rediseno-bloque-1b-dashboard`.

- [ ] **Abrir PR:**

```bash
gh pr create \
  --title "refactor(ui): bloque 1b — rediseño Dashboard /admin" \
  --body "$(cat <<'EOF'
## Summary
- KPI cards con gradiente diagonal y colores por tipo de dato (azul/verde/violeta/amber/rojo)
- Banner de copias migrado a token `bg-accent`
- Tablas de incidentes, técnicos y status usan `Card` + `PanelHeader` + `Badge` de Fase 0
- Wrappers de gráficas usan `Card` con cabecera manual (soporta subtitle y badge)
- Header de página usa `font-display`, `text-ink` y `buttonClasses`
- Sin cambios en lógica, queries ni rutas

## Test plan
- [ ] `npx tsc --noEmit` limpio
- [ ] `npm run build` sin errores nuevos
- [ ] `npm run dev` → abrir `/admin` y verificar visualmente todas las secciones
- [ ] Verificar que el botón "Nouveau Ticket" navega a `/admin/incidents/new`
- [ ] Verificar que los links de panel (Voir tout, Voir le kanban, Gérer l'équipe) funcionan

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

- [ ] **Lanzar code review:** `/code-review <N>` con el número del PR.

- [ ] **Aplicar fixes** si algún issue puntúa ≥ 80.

- [ ] **Mergear:**

```bash
gh pr merge <N> --merge --delete-branch
```

- [ ] **Verificar deploy Vercel** en `https://amd-service.vercel.app/admin`.
