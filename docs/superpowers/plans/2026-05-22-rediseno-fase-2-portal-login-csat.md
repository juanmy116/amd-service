# Rediseño Fase 2 — Portal + Login + CSAT — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Migrar las 10 páginas de `/portal`, `/login` y `/csat` a los tokens de diseño Tailwind v4 y componentes de la Fase 0 — cambio puramente de presentación, sin tocar lógica ni Server Actions.

**Architecture:** Misma estrategia que bloques 1a–1e: reemplazar colores hardcoded y `style={}` inline por tokens `@theme` de Tailwind v4; envolver contenedores en `<Card>`; sustituir spans de status/prioridad por `<Badge>`; convertir la topbar del portal a chrome oscuro. No se crea ningún archivo nuevo.

**Tech Stack:** Next.js 16 App Router · TypeScript · Tailwind CSS v4 · `src/components/ui/Card` · `src/components/ui/Badge` (variantes: info/violet/warning/success/danger/neutral)

**Spec:** `docs/superpowers/specs/2026-05-22-rediseno-fase-2-portal-login-csat.md`

---

## Contexto para el implementador

### Tokens disponibles (en `src/app/globals.css` bloque `@theme`)
- Chrome: `chrome` (bg), `chrome-line` (border), `chrome-fg` (texto inactivo), `chrome-fg-strong` (texto activo), `chrome-hover`
- Superficies: `page`, `card`, `line`, `line-subtle`
- Texto: `ink`, `ink-soft`, `ink-muted`
- Acento: `accent` (#BF0D0D), `accent-soft`
- Estados: `success`/`success-soft`, `warning`/`warning-soft`, `info`/`info-soft`, `neutral-soft`
- Tipografía: `font-display` (Poppins), `font-sans` (Inter)

### Componentes disponibles
- `import Card from '@/components/ui/Card'` — wrapper blanco con borde y sombra estándar
- `import Badge from '@/components/ui/Badge'` — píldora de estado
- `import type { BadgeVariant } from '@/components/ui/Badge'` — tipo para variantes

### Badge variants
`solid` | `danger` | `success` | `warning` | `info` | `violet` | `neutral`

### Mapeo status → Badge
- `nouveau` → `'info'` · `assigné` → `'violet'` · `en_cours` → `'warning'`
- `résolu` → `'success'` · `fermé` → `'neutral'`

### Mapeo priority → Badge
- `basse` → `'neutral'` · `normale` → `'info'` · `haute` → `'warning'` · `urgente` → `'danger'`

### Regla de oro
No cambies nada que no sea visual: no toques imports de datos, queries supabase, Server Actions, lógica condicional ni tipos TypeScript de datos. Solo JSX y clases CSS.

---

## Task 1: portal/layout.tsx — Chrome topbar oscura

**Files:**
- Modify: `src/app/portal/layout.tsx`

- [ ] **Step 1: Aplicar el archivo completo**

```tsx
import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { signOut } from '@/app/login/actions'
import { Printer, LogOut, AlertCircle, LayoutDashboard } from 'lucide-react'

export default async function PortalLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('profiles')
    .select('role, full_name')
    .eq('id', user.id)
    .single()

  if (profile?.role !== 'client') redirect('/dashboard')

  return (
    <div className="min-h-screen bg-page">
      {/* Top nav */}
      <header className="bg-chrome border-b border-chrome-line sticky top-0 z-10">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 h-14 flex items-center justify-between">

          {/* Logo */}
          <div className="flex items-center gap-2.5">
            <div className="w-7 h-7 rounded-lg flex items-center justify-center bg-accent">
              <span className="text-white font-bold text-xs font-display">A</span>
            </div>
            <span className="text-sm font-semibold text-chrome-fg-strong font-display">
              AMD Service
            </span>
          </div>

          {/* Nav links */}
          <nav className="flex items-center gap-1">
            <Link href="/portal" className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm text-chrome-fg hover:bg-chrome-hover transition-colors">
              <LayoutDashboard size={15} />
              Tableau de bord
            </Link>
            <Link href="/portal/incidents" className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm text-chrome-fg hover:bg-chrome-hover transition-colors">
              <AlertCircle size={15} />
              Mes incidents
            </Link>
          </nav>

          {/* Right: new + logout */}
          <div className="flex items-center gap-2">
            <Link
              href="/portal/incidents/new"
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium text-white bg-accent transition-opacity hover:opacity-90"
            >
              <Printer size={14} />
              Signaler un problème
            </Link>
            <form action={signOut}>
              <button type="submit" className="flex items-center justify-center w-8 h-8 rounded-lg text-chrome-fg hover:bg-chrome-hover transition-colors">
                <LogOut size={15} />
              </button>
            </form>
          </div>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-4 sm:px-6 py-8">
        {children}
      </main>
    </div>
  )
}
```

- [ ] **Step 2: Verificar TypeScript**

```bash
cd /path/to/web-amd && npx tsc --noEmit
```
Esperado: 0 errores.

- [ ] **Step 3: Commit**

```bash
git add src/app/portal/layout.tsx
git commit -m "refactor: portal layout — topbar chrome oscura (tokens Tailwind v4)"
```

---

## Task 2: portal/page.tsx — Dashboard del portal

**Files:**
- Modify: `src/app/portal/page.tsx`

- [ ] **Step 1: Aplicar el archivo completo**

```tsx
import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { Printer, AlertCircle, CheckCircle, Clock } from 'lucide-react'
import Card from '@/components/ui/Card'
import Badge from '@/components/ui/Badge'
import type { BadgeVariant } from '@/components/ui/Badge'

const STATUS_BADGE: Record<string, BadgeVariant> = {
  nouveau: 'info', assigné: 'violet', en_cours: 'warning', résolu: 'success', fermé: 'neutral',
}
const STATUS_LABEL: Record<string, string> = {
  nouveau: 'Nouveau', assigné: 'Assigné', en_cours: 'En cours', résolu: 'Résolu', fermé: 'Fermé',
}

export default async function PortalPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: clientProfile } = await supabase
    .from('client_profiles')
    .select('client_id, clients(nom_client)')
    .eq('profile_id', user.id)
    .single()

  if (!clientProfile) redirect('/portal/verify')

  const clientName = (clientProfile.clients as unknown as { nom_client: string } | null)?.nom_client ?? ''

  const [{ data: contracts }, { data: incidents }] = await Promise.all([
    supabase
      .from('contracts')
      .select('id, numero_contrat, machine_id, lieu_installation, machines(marque, modele, type, localisation)')
      .eq('client_id', clientProfile.client_id)
      .eq('statut', 'actif'),
    supabase
      .from('incidents')
      .select('id, title, status, priority, created_at')
      .in('contract_id', (await supabase
        .from('contracts')
        .select('id')
        .eq('client_id', clientProfile.client_id)
        .then(r => r.data?.map(c => c.id) ?? []))
      )
      .order('created_at', { ascending: false })
      .limit(5),
  ])

  const openCount     = incidents?.filter(i => !['résolu', 'fermé'].includes(i.status)).length ?? 0
  const resolvedCount = incidents?.filter(i =>  ['résolu', 'fermé'].includes(i.status)).length ?? 0

  return (
    <div className="space-y-8">

      {/* Welcome */}
      <div>
        <h1 className="text-2xl font-semibold text-ink font-display">
          Bonjour, {clientName}
        </h1>
        <p className="text-sm text-ink-muted mt-1">Voici l&apos;état de votre parc d&apos;impression.</p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-4">
        <Card className="p-5">
          <div className="flex items-center gap-3 mb-2">
            <div className="w-8 h-8 rounded-lg bg-info-soft flex items-center justify-center">
              <Printer size={16} className="text-info" />
            </div>
            <span className="text-sm text-ink-soft">Machines actives</span>
          </div>
          <p className="text-3xl font-semibold text-ink">{contracts?.length ?? 0}</p>
        </Card>
        <Card className="p-5">
          <div className="flex items-center gap-3 mb-2">
            <div className="w-8 h-8 rounded-lg bg-warning-soft flex items-center justify-center">
              <Clock size={16} className="text-warning" />
            </div>
            <span className="text-sm text-ink-soft">Incidents ouverts</span>
          </div>
          <p className="text-3xl font-semibold text-ink">{openCount}</p>
        </Card>
        <Card className="p-5">
          <div className="flex items-center gap-3 mb-2">
            <div className="w-8 h-8 rounded-lg bg-success-soft flex items-center justify-center">
              <CheckCircle size={16} className="text-success" />
            </div>
            <span className="text-sm text-ink-soft">Résolus</span>
          </div>
          <p className="text-3xl font-semibold text-ink">{resolvedCount}</p>
        </Card>
      </div>

      {/* Machines */}
      <div>
        <h2 className="text-base font-semibold text-ink mb-3">Mes machines</h2>
        <Card className="overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-neutral-soft border-b border-line-subtle">
                <th className="text-left px-5 py-3.5 text-[10px] font-semibold text-ink-muted uppercase tracking-[0.06em]">Machine</th>
                <th className="text-left px-5 py-3.5 text-[10px] font-semibold text-ink-muted uppercase tracking-[0.06em]">Type</th>
                <th className="text-left px-5 py-3.5 text-[10px] font-semibold text-ink-muted uppercase tracking-[0.06em]">Localisation</th>
                <th className="text-left px-5 py-3.5 text-[10px] font-semibold text-ink-muted uppercase tracking-[0.06em]">Contrat</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line-subtle">
              {(!contracts || contracts.length === 0) && (
                <tr><td colSpan={4} className="px-5 py-8 text-center text-ink-muted">Aucune machine active</td></tr>
              )}
              {contracts?.map((c) => {
                const m = c.machines as unknown as { marque: string; modele: string; type: string; localisation: string | null } | null
                return (
                  <tr key={c.id} className="hover:bg-neutral-soft transition-colors">
                    <td className="px-5 py-4 font-medium text-ink">{m ? `${m.marque} ${m.modele}` : c.machine_id}</td>
                    <td className="px-5 py-4">
                      <Badge variant={m?.type === 'color' ? 'violet' : 'neutral'}>
                        {m?.type === 'color' ? 'Couleur' : 'N&B'}
                      </Badge>
                    </td>
                    <td className="px-5 py-4 text-ink-soft">{m?.localisation ?? c.lieu_installation ?? '—'}</td>
                    <td className="px-5 py-4 font-mono text-xs text-ink-muted">{c.numero_contrat}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </Card>
      </div>

      {/* Recent incidents */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-base font-semibold text-ink">Incidents récents</h2>
          <Link href="/portal/incidents" className="text-sm text-ink-soft hover:text-ink underline underline-offset-2">
            Voir tout
          </Link>
        </div>
        <Card className="overflow-hidden">
          {(!incidents || incidents.length === 0) ? (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <AlertCircle size={32} className="text-ink-muted mb-3" />
              <p className="text-sm text-ink-muted">Aucun incident signalé</p>
              <Link href="/portal/incidents/new" className="mt-3 text-sm font-medium text-accent underline underline-offset-2">
                Signaler un problème
              </Link>
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-neutral-soft border-b border-line-subtle">
                  <th className="text-left px-5 py-3.5 text-[10px] font-semibold text-ink-muted uppercase tracking-[0.06em]">Titre</th>
                  <th className="text-left px-5 py-3.5 text-[10px] font-semibold text-ink-muted uppercase tracking-[0.06em]">Statut</th>
                  <th className="text-left px-5 py-3.5 text-[10px] font-semibold text-ink-muted uppercase tracking-[0.06em]">Date</th>
                  <th />
                </tr>
              </thead>
              <tbody className="divide-y divide-line-subtle">
                {incidents.map((inc) => (
                  <tr key={inc.id} className="hover:bg-neutral-soft transition-colors">
                    <td className="px-5 py-4 font-medium text-ink">{inc.title}</td>
                    <td className="px-5 py-4">
                      <Badge variant={STATUS_BADGE[inc.status] ?? 'neutral'}>
                        {STATUS_LABEL[inc.status] ?? inc.status}
                      </Badge>
                    </td>
                    <td className="px-5 py-4 text-ink-muted text-xs">
                      {new Date(inc.created_at).toLocaleDateString('fr-FR')}
                    </td>
                    <td className="px-5 py-4 text-right">
                      <Link href={`/portal/incidents/${inc.id}`} className="text-xs text-ink-muted hover:text-ink-soft underline underline-offset-2">Voir</Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Card>
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
git add src/app/portal/page.tsx
git commit -m "refactor: portal/page — tokens Tailwind v4 + Card + Badge"
```

---

## Task 3: portal/verify/page.tsx — Verificación de contrato

**Files:**
- Modify: `src/app/portal/verify/page.tsx`

- [ ] **Step 1: Aplicar el archivo completo**

```tsx
'use client'

import { useActionState } from 'react'
import { verifyContractAction } from './actions'
import { Loader2, FileText } from 'lucide-react'
import Card from '@/components/ui/Card'

const inputClass = 'w-full px-3.5 py-2.5 rounded-lg border border-line text-ink text-sm font-mono placeholder-ink-muted focus:outline-none focus:ring-2 focus:ring-accent/30 focus:border-accent'

export default function VerifyPage() {
  const [state, action, pending] = useActionState(verifyContractAction, null)

  return (
    <div className="min-h-screen bg-page flex items-center justify-center px-4">
      <div className="w-full max-w-md">

        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-12 h-12 rounded-xl mb-4 bg-accent-soft">
            <FileText size={22} className="text-accent" />
          </div>
          <h1 className="text-2xl font-semibold text-ink font-display">
            Vérification du contrat
          </h1>
          <p className="text-sm text-ink-muted mt-2">
            Saisissez votre numéro de contrat pour accéder à votre espace client.
            <br />Vous le trouverez sur vos documents AMD Service.
          </p>
        </div>

        <Card className="p-8">
          {state?.error && (
            <div className="mb-5 px-4 py-3 rounded-lg bg-accent-soft border border-accent/20 text-sm text-accent">
              {state.error}
            </div>
          )}

          <form action={action} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-ink-soft mb-1.5">
                Numéro de contrat <span className="text-accent">*</span>
              </label>
              <input
                name="numero_contrat"
                type="text"
                required
                placeholder="AMD-2026-001"
                className={inputClass}
              />
            </div>
            <button
              type="submit"
              disabled={pending}
              className="w-full flex items-center justify-center gap-2 py-2.5 px-4 rounded-lg text-sm font-medium text-white bg-accent transition-opacity disabled:opacity-60"
            >
              {pending && <Loader2 size={16} className="animate-spin" />}
              Vérifier mon contrat
            </button>
          </form>
        </Card>

        <p className="text-center text-xs text-ink-muted mt-6">
          Vous ne trouvez pas votre numéro ? Contactez AMD Service.
        </p>
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
git add src/app/portal/verify/page.tsx
git commit -m "refactor: portal/verify — tokens Tailwind v4 + Card"
```

---

## Task 4: portal/incidents/page.tsx — Lista de incidentes

**Files:**
- Modify: `src/app/portal/incidents/page.tsx`

- [ ] **Step 1: Aplicar el archivo completo**

```tsx
import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { Plus } from 'lucide-react'
import Card from '@/components/ui/Card'
import Badge from '@/components/ui/Badge'
import type { BadgeVariant } from '@/components/ui/Badge'

const STATUS_BADGE: Record<string, BadgeVariant> = {
  nouveau: 'info', assigné: 'violet', en_cours: 'warning', résolu: 'success', fermé: 'neutral',
}
const STATUS_LABEL: Record<string, string> = {
  nouveau: 'Nouveau', assigné: 'Assigné', en_cours: 'En cours', résolu: 'Résolu', fermé: 'Fermé',
}

const PRIORITY_BADGE: Record<string, BadgeVariant> = {
  basse: 'neutral', normale: 'info', haute: 'warning', urgente: 'danger',
}
const PRIORITY_LABEL: Record<string, string> = {
  basse: 'Basse', normale: 'Normale', haute: 'Haute', urgente: 'Urgente',
}

export default async function PortalIncidentsPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: clientProfile } = await supabase
    .from('client_profiles')
    .select('client_id')
    .eq('profile_id', user.id)
    .single()

  if (!clientProfile) redirect('/portal/verify')

  const { data: contractIds } = await supabase
    .from('contracts')
    .select('id')
    .eq('client_id', clientProfile.client_id)

  const ids = contractIds?.map(c => c.id) ?? []

  const { data: incidents } = await supabase
    .from('incidents')
    .select('id, numero_incident, title, status, priority, category, created_at, machine_id')
    .in('contract_id', ids)
    .or('source.is.null,source.neq.public')
    .order('created_at', { ascending: false })

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-semibold text-ink font-display">
          Mes incidents
        </h1>
        <Link
          href="/portal/incidents/new"
          className="flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium text-white bg-accent transition-opacity hover:opacity-90"
        >
          <Plus size={16} />
          Signaler un problème
        </Link>
      </div>

      <Card className="overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-neutral-soft border-b border-line-subtle">
              <th className="text-left px-5 py-3.5 text-[10px] font-semibold text-ink-muted uppercase tracking-[0.06em]">Nº</th>
              <th className="text-left px-5 py-3.5 text-[10px] font-semibold text-ink-muted uppercase tracking-[0.06em]">Titre</th>
              <th className="text-left px-5 py-3.5 text-[10px] font-semibold text-ink-muted uppercase tracking-[0.06em]">Machine</th>
              <th className="text-left px-5 py-3.5 text-[10px] font-semibold text-ink-muted uppercase tracking-[0.06em]">Priorité</th>
              <th className="text-left px-5 py-3.5 text-[10px] font-semibold text-ink-muted uppercase tracking-[0.06em]">Statut</th>
              <th className="text-left px-5 py-3.5 text-[10px] font-semibold text-ink-muted uppercase tracking-[0.06em]">Date</th>
              <th />
            </tr>
          </thead>
          <tbody className="divide-y divide-line-subtle">
            {(!incidents || incidents.length === 0) && (
              <tr>
                <td colSpan={7} className="px-5 py-10 text-center text-ink-muted">Aucun incident signalé</td>
              </tr>
            )}
            {incidents?.map((inc) => (
              <tr key={inc.id} className="hover:bg-neutral-soft transition-colors">
                <td className="px-5 py-4 font-mono text-xs font-semibold text-accent">
                  {inc.numero_incident}
                </td>
                <td className="px-5 py-4 font-medium text-ink">{inc.title}</td>
                <td className="px-5 py-4 font-mono text-xs text-ink-muted">{inc.machine_id}</td>
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
                <td className="px-5 py-4 text-xs text-ink-muted">
                  {new Date(inc.created_at).toLocaleDateString('fr-FR')}
                </td>
                <td className="px-5 py-4 text-right">
                  <Link href={`/portal/incidents/${inc.id}`} className="text-sm text-ink-muted hover:text-ink-soft underline underline-offset-2">Voir</Link>
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
npx tsc --noEmit
```
Esperado: 0 errores.

- [ ] **Step 3: Commit**

```bash
git add src/app/portal/incidents/page.tsx
git commit -m "refactor: portal/incidents — tokens Tailwind v4 + Card + Badge"
```

---

## Task 5: portal/incidents/[id]/page.tsx — Detalle de incidente

**Files:**
- Modify: `src/app/portal/incidents/[id]/page.tsx`

**Nota:** `STATUS_DOT` (colores del timeline: bg-blue-500, bg-purple-500, etc.) se mantienen intactos — son indicadores funcionales que no son Tailwind genérico sino semánticos de estado.

- [ ] **Step 1: Aplicar el archivo completo**

```tsx
import { createClient } from '@/lib/supabase/server'
import { notFound, redirect } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'
import Card from '@/components/ui/Card'
import Badge from '@/components/ui/Badge'
import type { BadgeVariant } from '@/components/ui/Badge'

const STATUS_BADGE: Record<string, BadgeVariant> = {
  nouveau: 'info', assigné: 'violet', en_cours: 'warning', résolu: 'success', fermé: 'neutral',
}
const STATUS_LABEL: Record<string, string> = {
  nouveau: 'Nouveau', assigné: 'Assigné', en_cours: 'En cours', résolu: 'Résolu', fermé: 'Fermé',
}
const STATUS_DOT: Record<string, string> = {
  nouveau: 'bg-blue-500', assigné: 'bg-purple-500', en_cours: 'bg-amber-500', résolu: 'bg-green-500', fermé: 'bg-gray-400',
}

function formatDateTime(d: string) {
  return new Date(d).toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'short' })
}

export default async function PortalIncidentDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: clientProfile } = await supabase
    .from('client_profiles')
    .select('client_id')
    .eq('profile_id', user.id)
    .single()
  if (!clientProfile) redirect('/portal/verify')

  const { data: clientContracts } = await supabase
    .from('contracts')
    .select('id')
    .eq('client_id', clientProfile.client_id)
  const contractIds = (clientContracts ?? []).map(c => c.id)

  const { data: incident } = await supabase
    .from('incidents')
    .select('*')
    .eq('id', id)
    .in('contract_id', contractIds.length > 0 ? contractIds : [''])
    .or('source.is.null,source.neq.public')
    .single()

  if (!incident) notFound()

  const { data: history } = await supabase
    .from('incident_history')
    .select('id, old_status, new_status, comment, created_at')
    .eq('incident_id', id)
    .order('created_at', { ascending: false })

  const { data: contract } = incident.contract_id
    ? await supabase
        .from('contracts')
        .select('numero_contrat, machines(marque, modele)')
        .eq('id', incident.contract_id)
        .maybeSingle()
    : { data: null }

  const machine = contract?.machines as unknown as { marque: string; modele: string } | null

  return (
    <div className="max-w-2xl space-y-6">

      {/* Header */}
      <div className="flex items-center gap-4">
        <Link href="/portal/incidents" className="flex items-center justify-center w-9 h-9 rounded-lg border border-line bg-card hover:bg-neutral-soft transition-colors">
          <ArrowLeft size={16} className="text-ink-soft" />
        </Link>
        <div className="flex-1 min-w-0">
          <p className="font-mono text-[11px] font-semibold tracking-wide text-accent">
            {incident.numero_incident}
          </p>
          <h1 className="text-xl font-semibold text-ink font-display truncate">
            {incident.title}
          </h1>
          <p className="text-sm text-ink-muted mt-0.5">
            {machine ? `${machine.marque} ${machine.modele}` : incident.machine_id}
            {contract?.numero_contrat && ` · ${contract.numero_contrat}`}
          </p>
        </div>
        <span className="shrink-0">
          <Badge variant={STATUS_BADGE[incident.status] ?? 'neutral'}>
            {STATUS_LABEL[incident.status] ?? incident.status}
          </Badge>
        </span>
      </div>

      {/* Details */}
      <Card className="p-6 space-y-4">
        {incident.description && (
          <div>
            <p className="text-xs font-medium text-ink-muted mb-1">Description</p>
            <p className="text-sm text-ink-soft whitespace-pre-wrap">{incident.description}</p>
          </div>
        )}
        <div className="grid grid-cols-3 gap-4 pt-2 border-t border-line-subtle">
          <div>
            <p className="text-xs font-medium text-ink-muted mb-1">Catégorie</p>
            <p className="text-sm text-ink-soft capitalize">{incident.category}</p>
          </div>
          <div>
            <p className="text-xs font-medium text-ink-muted mb-1">Priorité</p>
            <p className="text-sm text-ink-soft capitalize">{incident.priority}</p>
          </div>
          <div>
            <p className="text-xs font-medium text-ink-muted mb-1">Ouvert le</p>
            <p className="text-sm text-ink-soft">{new Date(incident.created_at).toLocaleDateString('fr-FR')}</p>
          </div>
        </div>
      </Card>

      {/* Rapport technicien */}
      {incident.rapport_intervention && (
        <Card className="p-6">
          <p className="text-xs font-medium text-ink-muted mb-2">Rapport d&apos;intervention</p>
          <p className="text-sm text-ink-soft whitespace-pre-wrap">{incident.rapport_intervention}</p>
        </Card>
      )}

      {/* Historique */}
      {history && history.length > 0 && (
        <Card className="p-6">
          <p className="text-sm font-semibold text-ink mb-5">Suivi de l&apos;incident</p>
          <div className="space-y-4">
            {history.map((h) => (
              <div key={h.id} className="flex gap-3">
                <div className="flex flex-col items-center pt-1">
                  <div className={`w-2 h-2 rounded-full shrink-0 ${STATUS_DOT[h.new_status] ?? 'bg-gray-400'}`} />
                </div>
                <div className="flex-1 pb-4 border-b border-line-subtle last:border-0 last:pb-0">
                  <div className="flex flex-wrap items-center gap-x-2">
                    {h.old_status ? (
                      <span className="text-xs text-ink-muted">
                        {STATUS_LABEL[h.old_status] ?? h.old_status}
                        {' → '}
                        <span className="font-medium text-ink">{STATUS_LABEL[h.new_status] ?? h.new_status}</span>
                      </span>
                    ) : (
                      <span className="text-xs font-medium text-ink">{STATUS_LABEL[h.new_status] ?? h.new_status}</span>
                    )}
                    <span className="text-xs text-ink-muted">·</span>
                    <span className="text-xs text-ink-muted">{formatDateTime(h.created_at)}</span>
                  </div>
                  {h.comment && <p className="mt-1 text-xs text-ink-muted italic">{h.comment}</p>}
                </div>
              </div>
            ))}
          </div>
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
git add "src/app/portal/incidents/[id]/page.tsx"
git commit -m "refactor: portal/incidents/[id] — tokens Tailwind v4 + Card + Badge"
```

---

## Task 6: portal/incidents/new/form.tsx — Formulario nuevo incidente

**Files:**
- Modify: `src/app/portal/incidents/new/form.tsx`

**Nota:** `className="accent-red-600"` en los `<input type="radio">` se mantiene — no existe token Tailwind v4 para la propiedad CSS `accent-color`.

- [ ] **Step 1: Aplicar el archivo completo**

```tsx
'use client'

import { useActionState } from 'react'
import Link from 'next/link'
import { Loader2, ArrowLeft, QrCode, AlertTriangle } from 'lucide-react'
import Card from '@/components/ui/Card'

type FormState = { error: string } | null
type ContractOption = { id: string; label: string }

type Props = {
  action: (prev: FormState, data: FormData) => Promise<FormState>
  contracts: ContractOption[]
  preselectedContractId?: string | null
  machineNotFound?: boolean
}

const CATEGORY_OPTIONS = [
  { value: 'panne',       label: 'Panne / dysfonctionnement' },
  { value: 'consommable', label: 'Consommable (toner, papier...)' },
  { value: 'maintenance', label: 'Maintenance' },
  { value: 'autre',       label: 'Autre' },
]

const PRIORITY_OPTIONS = [
  { value: 'normale', label: 'Normale — machine partiellement fonctionnelle' },
  { value: 'haute',   label: 'Haute — impact important sur le travail' },
  { value: 'urgente', label: 'Urgente — machine totalement hors service' },
]

const inputClass = 'w-full px-3.5 py-2.5 rounded-lg border border-line text-ink text-sm placeholder-ink-muted focus:outline-none focus:ring-2 focus:ring-accent/30 focus:border-accent'
const selectClass = 'w-full px-3.5 py-2.5 rounded-lg border border-line text-ink text-sm bg-card focus:outline-none focus:ring-2 focus:ring-accent/30 focus:border-accent'

export default function NewIncidentForm({ action, contracts, preselectedContractId, machineNotFound }: Props) {
  const [state, formAction, pending] = useActionState(action, null)

  return (
    <div className="max-w-2xl">
      <div className="flex items-center gap-4 mb-8">
        <Link href="/portal/incidents" className="flex items-center justify-center w-9 h-9 rounded-lg border border-line bg-card hover:bg-neutral-soft transition-colors">
          <ArrowLeft size={16} className="text-ink-soft" />
        </Link>
        <h1 className="text-2xl font-semibold text-ink font-display">
          Signaler un problème
        </h1>
      </div>

      {/* Banner QR — máquina escaneada no pertenece al cliente */}
      {machineNotFound && (
        <div className="flex items-start gap-3 px-4 py-3 rounded-lg bg-warning-soft border border-warning/30 text-sm text-ink mb-5">
          <AlertTriangle size={16} className="mt-0.5 shrink-0 text-warning" />
          <span>La machine scannée ne fait pas partie de votre contrat. Sélectionnez une machine ci-dessous.</span>
        </div>
      )}

      {/* Banner QR — máquina preseleccionada correctamente */}
      {preselectedContractId && (
        <div className="flex items-center gap-3 px-4 py-3 rounded-lg bg-success-soft border border-success/20 text-sm text-ink mb-5">
          <QrCode size={16} className="shrink-0 text-success" />
          <span>Machine identifiée par QR code et pré-sélectionnée.</span>
        </div>
      )}

      <form action={formAction}>
        <Card className="p-6 space-y-5">

          {state?.error && (
            <div className="px-4 py-3 rounded-lg bg-accent-soft border border-accent/20 text-sm text-accent">
              {state.error}
            </div>
          )}

          {/* Machine concernée */}
          <div>
            <label className="block text-sm font-medium text-ink-soft mb-1.5">
              Machine concernée <span className="text-accent">*</span>
            </label>
            {contracts.length === 0 ? (
              <p className="text-sm text-ink-muted">Aucune machine active sur votre contrat.</p>
            ) : (
              <select
                name="contract_id"
                required
                defaultValue={preselectedContractId ?? ''}
                className={selectClass}
              >
                <option value="" disabled>Sélectionner une machine...</option>
                {contracts.map((c) => (
                  <option key={c.id} value={c.id}>{c.label}</option>
                ))}
              </select>
            )}
          </div>

          {/* Titre */}
          <div>
            <label className="block text-sm font-medium text-ink-soft mb-1.5">
              Titre du problème <span className="text-accent">*</span>
            </label>
            <input
              name="title"
              type="text"
              required
              placeholder="Ex : Bourrage papier récurrent"
              className={inputClass}
            />
          </div>

          {/* Description */}
          <div>
            <label className="block text-sm font-medium text-ink-soft mb-1.5">Description</label>
            <textarea
              name="description"
              rows={4}
              placeholder="Décrivez le problème en détail : depuis quand, dans quelles conditions, messages d'erreur..."
              className={`${inputClass} resize-none`}
            />
          </div>

          {/* Catégorie */}
          <div>
            <label className="block text-sm font-medium text-ink-soft mb-1.5">Type de problème</label>
            <div className="space-y-2">
              {CATEGORY_OPTIONS.map((o) => (
                <label key={o.value} className="flex items-center gap-3 p-3 rounded-lg border border-line hover:border-ink-muted cursor-pointer transition-colors">
                  <input type="radio" name="category" value={o.value} defaultChecked={o.value === 'panne'} className="accent-red-600" />
                  <span className="text-sm text-ink-soft">{o.label}</span>
                </label>
              ))}
            </div>
          </div>

          {/* Priorité */}
          <div>
            <label className="block text-sm font-medium text-ink-soft mb-1.5">Urgence</label>
            <div className="space-y-2">
              {PRIORITY_OPTIONS.map((o) => (
                <label key={o.value} className="flex items-center gap-3 p-3 rounded-lg border border-line hover:border-ink-muted cursor-pointer transition-colors">
                  <input type="radio" name="priority" value={o.value} defaultChecked={o.value === 'normale'} className="accent-red-600" />
                  <span className="text-sm text-ink-soft">{o.label}</span>
                </label>
              ))}
            </div>
          </div>
        </Card>

        <div className="flex items-center justify-end gap-3 mt-6">
          <Link href="/portal/incidents" className="px-4 py-2.5 rounded-lg border border-line text-sm font-medium text-ink bg-card hover:bg-neutral-soft transition-colors">
            Annuler
          </Link>
          <button
            type="submit"
            disabled={pending || contracts.length === 0}
            className="flex items-center gap-2 px-5 py-2.5 rounded-lg text-sm font-medium text-white bg-accent disabled:opacity-60 transition-opacity hover:opacity-90"
          >
            {pending && <Loader2 size={15} className="animate-spin" />}
            Envoyer le signalement
          </button>
        </div>
      </form>
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
git add src/app/portal/incidents/new/form.tsx
git commit -m "refactor: portal/incidents/new/form — tokens Tailwind v4 + Card"
```

---

## Task 7: login/page.tsx + login/login-form.tsx

**Files:**
- Modify: `src/app/login/page.tsx`
- Modify: `src/app/login/login-form.tsx`

**Nota:** El SVG de Google OAuth (4 paths de color) se mantiene intacto.

- [ ] **Step 1: Aplicar login/page.tsx**

```tsx
import LoginForm from './login-form'

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ message?: string }>
}) {
  const { message } = await searchParams

  return (
    <div className="min-h-screen flex items-center justify-center px-4 py-12 bg-page">
      <div className="w-full max-w-sm space-y-4">
        {message === 'confirm-email' && (
          <div className="rounded-xl border border-info/20 bg-info-soft px-4 py-3 text-sm text-ink">
            Vérifiez votre boîte email et cliquez sur le lien de confirmation pour activer votre compte.
          </div>
        )}
        <LoginForm />
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Aplicar login/login-form.tsx**

```tsx
'use client'

import { useActionState, useState } from 'react'
import { signInWithEmail, signInWithGoogle, registerClientAction } from './actions'
import { Loader2 } from 'lucide-react'
import Card from '@/components/ui/Card'

const inputClass = "w-full px-3.5 py-2.5 rounded-lg border border-line text-sm text-ink placeholder-ink-muted focus:outline-none focus:ring-2 focus:ring-accent/30 focus:border-accent transition"

export default function LoginForm() {
  const [tab, setTab] = useState<'login' | 'register'>('login')
  const [loginState,    loginAction,    loginPending]    = useActionState(signInWithEmail,      null)
  const [registerState, registerAction, registerPending] = useActionState(registerClientAction, null)

  return (
    <div className="w-full max-w-md mx-auto">

      {/* Header */}
      <div className="text-center mb-8">
        <div className="inline-flex items-center justify-center w-12 h-12 rounded-xl mb-4 bg-accent">
          <span className="text-white font-bold text-lg font-display">A</span>
        </div>
        <h1 className="text-2xl font-semibold text-ink font-display">
          AMD Service
        </h1>
        <p className="text-sm text-ink-muted mt-1">Connectez-vous à votre espace</p>
      </div>

      {/* Card */}
      <Card className="p-8">

        {/* Tabs */}
        <div className="flex mb-6 p-1 bg-neutral-soft rounded-lg">
          <button
            type="button"
            onClick={() => setTab('login')}
            className={`flex-1 py-2 text-sm font-medium rounded-md transition-colors ${tab === 'login' ? 'bg-card text-ink shadow-sm' : 'text-ink-muted hover:text-ink-soft'}`}
          >
            Connexion
          </button>
          <button
            type="button"
            onClick={() => setTab('register')}
            className={`flex-1 py-2 text-sm font-medium rounded-md transition-colors ${tab === 'register' ? 'bg-card text-ink shadow-sm' : 'text-ink-muted hover:text-ink-soft'}`}
          >
            Créer un compte
          </button>
        </div>

        {/* Login */}
        {tab === 'login' && (
          <>
            {loginState?.error && (
              <div className="mb-5 px-4 py-3 rounded-lg bg-accent-soft border border-accent/20 text-sm text-accent">
                {loginState.error}
              </div>
            )}
            <form action={loginAction} className="space-y-4">
              <div>
                <label htmlFor="email" className="block text-sm font-medium text-ink-soft mb-1.5">Email</label>
                <input id="email" name="email" type="email" autoComplete="email" required className={inputClass} placeholder="vous@entreprise.com" />
              </div>
              <div>
                <label htmlFor="password" className="block text-sm font-medium text-ink-soft mb-1.5">Mot de passe</label>
                <input id="password" name="password" type="password" autoComplete="current-password" required className={inputClass} placeholder="••••••••" />
              </div>
              <button type="submit" disabled={loginPending} className="w-full flex items-center justify-center gap-2 py-2.5 px-4 rounded-lg text-sm font-medium text-white bg-accent transition-opacity disabled:opacity-60 mt-2">
                {loginPending && <Loader2 size={16} className="animate-spin" />}
                Connexion
              </button>
            </form>

            <div className="relative my-6">
              <div className="absolute inset-0 flex items-center"><div className="w-full border-t border-line" /></div>
              <div className="relative flex justify-center text-xs text-ink-muted bg-card px-3">ou</div>
            </div>

            <form action={signInWithGoogle}>
              <button type="submit" className="w-full flex items-center justify-center gap-3 py-2.5 px-4 rounded-lg border border-line text-sm font-medium text-ink bg-card hover:bg-neutral-soft transition">
                <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
                  <path d="M17.64 9.205c0-.639-.057-1.252-.164-1.841H9v3.481h4.844a4.14 4.14 0 0 1-1.796 2.716v2.259h2.908c1.702-1.567 2.684-3.875 2.684-6.615Z" fill="#4285F4"/>
                  <path d="M9 18c2.43 0 4.467-.806 5.956-2.18l-2.908-2.259c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332A8.997 8.997 0 0 0 9 18Z" fill="#34A853"/>
                  <path d="M3.964 10.71A5.41 5.41 0 0 1 3.682 9c0-.593.102-1.17.282-1.71V4.958H.957A8.996 8.996 0 0 0 0 9c0 1.452.348 2.827.957 4.042l3.007-2.332Z" fill="#FBBC05"/>
                  <path d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0A8.997 8.997 0 0 0 .957 4.958L3.964 7.29C4.672 5.163 6.656 3.58 9 3.58Z" fill="#EA4335"/>
                </svg>
                Continuer avec Google
              </button>
            </form>
          </>
        )}

        {/* Register */}
        {tab === 'register' && (
          <>
            {registerState?.error && (
              <div className="mb-5 px-4 py-3 rounded-lg bg-accent-soft border border-accent/20 text-sm text-accent">
                {registerState.error}
              </div>
            )}
            <form action={registerAction} className="space-y-4">
              <div>
                <label htmlFor="reg-email" className="block text-sm font-medium text-ink-soft mb-1.5">Email <span className="text-accent">*</span></label>
                <input id="reg-email" name="email" type="email" required className={inputClass} placeholder="vous@entreprise.com" />
              </div>
              <div>
                <label htmlFor="reg-password" className="block text-sm font-medium text-ink-soft mb-1.5">Mot de passe <span className="text-accent">*</span></label>
                <input id="reg-password" name="password" type="password" required className={inputClass} placeholder="Min. 6 caractères" />
              </div>
              <div>
                <label htmlFor="reg-confirm" className="block text-sm font-medium text-ink-soft mb-1.5">Confirmer le mot de passe <span className="text-accent">*</span></label>
                <input id="reg-confirm" name="confirm" type="password" required className={inputClass} placeholder="••••••••" />
              </div>
              <button type="submit" disabled={registerPending} className="w-full flex items-center justify-center gap-2 py-2.5 px-4 rounded-lg text-sm font-medium text-white bg-accent transition-opacity disabled:opacity-60 mt-2">
                {registerPending && <Loader2 size={16} className="animate-spin" />}
                Créer mon compte
              </button>
            </form>
            <p className="text-xs text-ink-muted text-center mt-4">
              Après inscription, vous devrez vérifier votre numéro de contrat pour accéder à vos données.
            </p>
          </>
        )}
      </Card>

      <p className="text-center text-xs text-ink-muted mt-6">
        Accès réservé aux clients et équipes AMD Service
      </p>
    </div>
  )
}
```

- [ ] **Step 3: Verificar TypeScript**

```bash
npx tsc --noEmit
```
Esperado: 0 errores.

- [ ] **Step 4: Commit**

```bash
git add src/app/login/page.tsx src/app/login/login-form.tsx
git commit -m "refactor: login — tokens Tailwind v4 + Card (bg-page, tabs neutral-soft, inputs)"
```

---

## Task 8: csat/[token]/page.tsx + csat-form.tsx

**Files:**
- Modify: `src/app/csat/[token]/page.tsx`
- Modify: `src/app/csat/[token]/csat-form.tsx`

- [ ] **Step 1: Aplicar csat/[token]/page.tsx**

```tsx
import { createAdminClient } from '@/lib/supabase/admin'
import CsatForm from './csat-form'
import Card from '@/components/ui/Card'

export default async function CsatPage({
  params,
}: {
  params: Promise<{ token: string }>
}) {
  const { token } = await params
  const admin = createAdminClient()

  const { data: csat } = await admin
    .from('csat_responses')
    .select('token, responded_at, expires_at, incident_id, incidents(title)')
    .eq('token', token)
    .maybeSingle()

  const incidentTitle = (csat?.incidents as unknown as { title: string } | null)?.title

  if (!csat) {
    return <CsatShell><InvalidState message="Ce lien est invalide ou n'existe pas." /></CsatShell>
  }

  if (csat.responded_at) {
    return <CsatShell><InvalidState message="Vous avez déjà répondu à cette enquête. Merci !" success /></CsatShell>
  }

  if (new Date(csat.expires_at) < new Date()) {
    return <CsatShell><InvalidState message="Ce lien a expiré (valable 7 jours)." /></CsatShell>
  }

  return (
    <CsatShell>
      <div className="mb-6 text-center">
        <h1 className="text-xl font-semibold text-ink mb-1">Comment s&apos;est passée notre intervention ?</h1>
        {incidentTitle && (
          <p className="text-sm text-ink-muted">Demande : <span className="font-medium text-ink-soft">{incidentTitle}</span></p>
        )}
      </div>
      <CsatForm token={token} />
    </CsatShell>
  )
}

function CsatShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-page flex flex-col items-center justify-center p-4">
      <Card className="w-full max-w-md p-8">
        <div className="flex items-center gap-2 mb-8">
          <div className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0 bg-accent">
            <span className="text-white font-bold text-sm font-display">A</span>
          </div>
          <span className="text-sm font-semibold text-ink font-display">AMD Service</span>
        </div>
        {children}
      </Card>
    </div>
  )
}

function InvalidState({ message, success = false }: { message: string; success?: boolean }) {
  return (
    <div className="text-center py-4">
      <div className={`w-12 h-12 rounded-full flex items-center justify-center mx-auto mb-4 ${success ? 'bg-success-soft' : 'bg-neutral-soft'}`}>
        {success ? (
          <svg className="w-6 h-6 text-success" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
          </svg>
        ) : (
          <svg className="w-6 h-6 text-ink-muted" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
        )}
      </div>
      <p className="text-sm text-ink-soft">{message}</p>
    </div>
  )
}
```

- [ ] **Step 2: Aplicar csat/[token]/csat-form.tsx**

```tsx
'use client'

import { useActionState } from 'react'
import { submitCsatAction } from './actions'

const STARS = [1, 2, 3, 4, 5]
const LABELS: Record<number, string> = {
  1: 'Très insatisfait',
  2: 'Insatisfait',
  3: 'Neutre',
  4: 'Satisfait',
  5: 'Très satisfait',
}

export default function CsatForm({ token }: { token: string }) {
  const boundAction = submitCsatAction.bind(null, token)
  const [state, action, pending] = useActionState(boundAction, null)

  if (state?.success) {
    return (
      <div className="text-center py-8">
        <div className="w-16 h-16 rounded-full bg-success-soft flex items-center justify-center mx-auto mb-4">
          <svg className="w-8 h-8 text-success" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
          </svg>
        </div>
        <h2 className="text-lg font-semibold text-ink mb-2">Merci pour votre avis !</h2>
        <p className="text-sm text-ink-muted">Votre retour nous aide à améliorer notre service.</p>
      </div>
    )
  }

  return (
    <form action={action} className="space-y-6">
      {/* Estrellas */}
      <div>
        <p className="text-sm font-medium text-ink-soft mb-3 text-center">Votre note globale</p>
        <div className="flex justify-center gap-2">
          {STARS.map((star) => (
            <label key={star} className="cursor-pointer group">
              <input type="radio" name="rating" value={star} className="sr-only peer" required />
              <svg
                className="w-10 h-10 text-ink-muted peer-checked:text-amber-400 group-hover:text-amber-300 transition-colors"
                fill="currentColor"
                viewBox="0 0 24 24"
              >
                <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />
              </svg>
              <span className="sr-only">{LABELS[star]}</span>
            </label>
          ))}
        </div>
      </div>

      {/* Comentario */}
      <div>
        <label className="block text-sm font-medium text-ink-soft mb-1.5">
          Commentaire <span className="text-ink-muted font-normal">(facultatif)</span>
        </label>
        <textarea
          name="comment"
          rows={3}
          placeholder="Dites-nous ce que nous pouvons améliorer..."
          className="w-full rounded-lg border border-line px-3 py-2 text-sm text-ink placeholder-ink-muted focus:outline-none focus:ring-2 focus:ring-accent/30 focus:border-accent resize-none"
        />
      </div>

      {state?.error && (
        <p className="text-sm text-accent text-center">{state.error}</p>
      )}

      <button
        type="submit"
        disabled={pending}
        className="w-full py-2.5 rounded-lg text-sm font-semibold text-white bg-accent transition-opacity hover:opacity-90 disabled:opacity-50"
      >
        {pending ? 'Envoi...' : 'Envoyer mon avis'}
      </button>
    </form>
  )
}
```

- [ ] **Step 3: Verificar TypeScript**

```bash
npx tsc --noEmit
```
Esperado: 0 errores.

- [ ] **Step 4: Commit**

```bash
git add "src/app/csat/[token]/page.tsx" "src/app/csat/[token]/csat-form.tsx"
git commit -m "refactor: csat — tokens Tailwind v4 + Card (shell, form, estados)"
```

---

## Verificación final

- [ ] **Build limpio**

```bash
npx tsc --noEmit && npm run build
```
Esperado: 0 errores TypeScript, build exitoso.

- [ ] **Revisión visual (en local con `npm run dev`)**
  - `/login` — fondo `bg-page`, card blanca, tabs en `bg-neutral-soft`, inputs con ring rojo en foco
  - `/portal/verify` — misma estética que login
  - `/portal` — topbar oscura `bg-chrome`, contenido claro, stats con iconos coloreados en `bg-info-soft`/`bg-warning-soft`/`bg-success-soft`
  - `/portal/incidents` — tabla con Badges de prioridad/estado en tokens
  - `/portal/incidents/[id]` — detalle con Cards, timeline con dots de colores funcionales
  - `/portal/incidents/new` — formulario con banners de warning/success en tokens
  - `/csat/[token]` — shell con `bg-page`, logo AMD en `bg-accent`, stars en `text-ink-muted` → `text-amber-400`
