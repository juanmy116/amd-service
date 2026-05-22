# Bloque 1e — Secundarias `/admin` — Plan de Implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Migrar 6 archivos de páginas secundarias de `/admin` a los tokens de diseño Tailwind v4 y componentes UI compartidos de la Fase 0, completando el rediseño "Híbrido" del back-office.

**Architecture:** Cambio puramente presentacional — se reemplazan clases legacy (`text-gray-*`, `bg-white`, `border-gray-*`) y estilos inline (`style={{ backgroundColor: '#BF0D0D' }}`, `style={{ fontFamily: 'Poppins' }}`) por tokens Tailwind v4 y componentes `Card`, `Badge`, `PanelHeader`. No se toca lógica, queries ni Server Actions.

**Tech Stack:** Next.js 16 App Router · TypeScript · Tailwind CSS v4 · `src/components/ui/Card`, `Badge`, `PanelHeader`

**Rama de trabajo:** crear `refactor/admin-1e-design-tokens` desde `main` limpio antes de empezar.

---

## Contexto del sistema de diseño

**Tokens disponibles** (bloque `@theme` en `src/app/globals.css`):
- Superficies: `bg-card`, `bg-page`, `bg-neutral-soft`, `bg-accent-soft`, `bg-warning-soft`
- Bordes: `border-line`, `border-line-subtle`, `border-accent/20`, `border-warning/30`
- Texto: `text-ink`, `text-ink-soft`, `text-ink-muted`
- Acento: `text-accent`, `bg-accent`, `text-success`, `text-warning`, `text-info`
- Tipografía: `font-display` (Poppins), `font-sans` (Inter)
- Radios/sombras: `rounded-card`, `shadow-card`

**Componentes UI compartidos** (`src/components/ui/` — sin barrel, imports directos):
- `Card`: `<Card className="...">` — aplica `bg-card border border-line rounded-card shadow-card`
- `Badge`: `<Badge variant="success|danger|warning|info|violet|neutral|solid">texto</Badge>`
- `PanelHeader`: `<PanelHeader title="Texto" />` — cabecera con `px-5 py-4 border-b border-line-subtle`

**Verificación** — este proyecto no tiene test suite. Verificar con:
```bash
npx tsc --noEmit   # debe salir sin errores
```
Al final de todas las tareas: `npm run build` (build completo).

---

## Archivos modificados

| Tarea | Archivo | Cambios clave |
|---|---|---|
| 1 | `src/app/admin/team/page.tsx` | Card, Badge para roles, tokens tabla |
| 2 | `src/components/admin/TeamMemberForm.tsx` | Patrón form completo (igual a bloque 1d) |
| 3 | `src/app/admin/calendrier/page.tsx` | h1, stats (3 cambios) |
| 4 | `src/app/admin/princity/page.tsx` | Card, Badge, warning section, tokens tabla |
| 5 | `src/app/admin/contadores/[serie]/page.tsx` | Card, PanelHeader, Badge, tokens tabla |
| 6 | `src/app/admin/machines/[serie]/qr/page.tsx` | Tokens etiqueta imprimible |

---

## Tarea 1: `src/app/admin/team/page.tsx`

**Files:**
- Modify: `src/app/admin/team/page.tsx`

- [ ] **Paso 1: Aplicar la migración completa**

Reemplazar el contenido completo del archivo con:

```tsx
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import Link from 'next/link'
import { Plus } from 'lucide-react'
import { Card } from '@/components/ui/Card'
import { Badge } from '@/components/ui/Badge'
import type { BadgeVariant } from '@/components/ui/Badge'

const ROLE_LABEL: Record<string, string> = {
  admin:      'Administrateur',
  technician: 'Technicien',
}

const ROLE_VARIANT: Record<string, BadgeVariant> = {
  admin:      'danger',
  technician: 'info',
}

export default async function TeamPage() {
  const supabase      = await createClient()
  const supabaseAdmin = createAdminClient()

  const [{ data: profiles }, { data: { users } }] = await Promise.all([
    supabase
      .from('profiles')
      .select('id, full_name, phone, role')
      .in('role', ['admin', 'technician'])
      .order('full_name'),
    supabaseAdmin.auth.admin.listUsers({ perPage: 1000 }),
  ])

  const emailMap = new Map(users.map((u) => [u.id, u.email ?? '']))

  return (
    <div className="p-8">
      <div className="flex items-center justify-between mb-8">
        <h1 className="text-2xl font-semibold font-display text-ink">
          Équipe
        </h1>
        <Link
          href="/admin/team/new"
          className="flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium text-white bg-accent transition-opacity hover:opacity-90"
        >
          <Plus size={16} />
          Inviter un membre
        </Link>
      </div>

      <Card className="overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-neutral-soft border-b border-line-subtle">
              <th className="text-left px-5 py-3.5 font-medium text-ink-muted">Nom</th>
              <th className="text-left px-5 py-3.5 font-medium text-ink-muted">Email</th>
              <th className="text-left px-5 py-3.5 font-medium text-ink-muted">Téléphone</th>
              <th className="text-left px-5 py-3.5 font-medium text-ink-muted">Rôle</th>
              <th />
            </tr>
          </thead>
          <tbody className="divide-y divide-line-subtle">
            {(!profiles || profiles.length === 0) && (
              <tr>
                <td colSpan={5} className="px-5 py-10 text-center text-ink-muted">
                  Aucun membre dans l&apos;équipe
                </td>
              </tr>
            )}
            {profiles?.map((p) => (
              <tr key={p.id} className="hover:bg-neutral-soft transition-colors">
                <td className="px-5 py-4 font-medium text-ink">{p.full_name ?? '—'}</td>
                <td className="px-5 py-4 text-ink-soft">{emailMap.get(p.id) ?? '—'}</td>
                <td className="px-5 py-4 text-ink-soft">{p.phone ?? '—'}</td>
                <td className="px-5 py-4">
                  <Badge variant={ROLE_VARIANT[p.role] ?? 'neutral'}>
                    {ROLE_LABEL[p.role] ?? p.role}
                  </Badge>
                </td>
                <td className="px-5 py-4 text-right">
                  <Link
                    href={`/admin/team/${p.id}`}
                    className="text-sm font-medium text-ink-soft hover:text-ink underline underline-offset-2"
                  >
                    Modifier
                  </Link>
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

- [ ] **Paso 2: Verificar tipos**

```bash
npx tsc --noEmit
```

Resultado esperado: sin errores.

- [ ] **Paso 3: Commit**

```bash
git add src/app/admin/team/page.tsx
git commit -m "refactor: team/page — tokens Tailwind v4 + Card + Badge roles"
```

---

## Tarea 2: `src/components/admin/TeamMemberForm.tsx`

**Files:**
- Modify: `src/components/admin/TeamMemberForm.tsx`

- [ ] **Paso 1: Aplicar la migración completa**

Reemplazar el contenido completo del archivo con:

```tsx
'use client'

import { useActionState, useState } from 'react'
import Link from 'next/link'
import { Loader2, ArrowLeft, Trash2, AlertTriangle } from 'lucide-react'
import { Card } from '@/components/ui/Card'

type FormState = { error: string } | null

type MemberData = {
  full_name?: string | null
  phone?: string | null
  role?: string
}

type Props = {
  action: (prev: FormState, data: FormData) => Promise<FormState>
  defaultValues?: MemberData
  title: string
  isEdit?: boolean
  email?: string
  memberId?: string
  deleteAction?: (formData: FormData) => Promise<void>
}

const inputClass = 'w-full px-3.5 py-2.5 rounded-lg border border-line text-ink text-sm placeholder-ink-muted bg-card focus:outline-none focus:ring-2 focus:ring-accent/30 focus:border-accent'
const selectClass = 'w-full px-3.5 py-2.5 rounded-lg border border-line text-ink text-sm bg-card focus:outline-none focus:ring-2 focus:ring-accent/30 focus:border-accent'

export default function TeamMemberForm({
  action, defaultValues, title, isEdit, email, memberId, deleteAction,
}: Props) {
  const [state, formAction, pending] = useActionState(action, null)
  const [confirming, setConfirming] = useState(false)

  return (
    <div className="p-8 max-w-2xl">

      {/* Header */}
      <div className="flex items-center gap-4 mb-8">
        <Link
          href="/admin/team"
          className="flex items-center justify-center w-9 h-9 rounded-lg border border-line bg-card hover:bg-neutral-soft transition-colors"
        >
          <ArrowLeft size={16} className="text-ink-soft" />
        </Link>
        <h1 className="flex-1 text-2xl font-semibold font-display text-ink">
          {title}
        </h1>

        {deleteAction && memberId && (
          confirming ? (
            <div className="flex items-center gap-2 shrink-0">
              <span className="text-sm text-ink-soft flex items-center gap-1.5">
                <AlertTriangle size={14} className="text-accent" />
                Confirmer ?
              </span>
              <form action={deleteAction} className="contents">
                <input type="hidden" name="id" value={memberId} />
                <button type="submit" className="px-3 py-2 rounded-lg text-sm font-medium text-white bg-accent">
                  Oui, supprimer
                </button>
              </form>
              <button
                type="button"
                onClick={() => setConfirming(false)}
                className="px-3 py-2 rounded-lg text-sm font-medium text-ink-soft border border-line hover:bg-neutral-soft"
              >
                Annuler
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setConfirming(true)}
              className="flex items-center gap-2 px-3.5 py-2.5 rounded-lg border border-accent/20 text-sm font-medium text-accent bg-card hover:bg-accent-soft transition-colors shrink-0"
            >
              <Trash2 size={15} />
              Supprimer
            </button>
          )
        )}
      </div>

      <form action={formAction}>
        <Card className="p-6 space-y-5">

          {state?.error && (
            <div className="px-4 py-3 rounded-lg bg-accent-soft border border-accent/20 text-sm text-accent">
              {state.error}
            </div>
          )}

          {/* Email — editable on create, read-only on edit */}
          <div>
            <label className="block text-sm font-medium text-ink-soft mb-1.5">
              Email {!isEdit && <span className="text-accent">*</span>}
            </label>
            {isEdit ? (
              <div className="px-3.5 py-2.5 rounded-lg border border-line bg-neutral-soft text-sm text-ink-soft">
                {email}
              </div>
            ) : (
              <input
                name="email"
                type="email"
                required
                placeholder="technicien@amd-service.com"
                className={inputClass}
              />
            )}
          </div>

          {/* Nom complet + Téléphone */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-ink-soft mb-1.5">
                Nom complet {!isEdit && <span className="text-accent">*</span>}
              </label>
              <input
                name="full_name"
                type="text"
                required={!isEdit}
                defaultValue={defaultValues?.full_name ?? ''}
                placeholder="Mamadou Diallo"
                className={inputClass}
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-ink-soft mb-1.5">Téléphone</label>
              <input
                name="phone"
                type="tel"
                defaultValue={defaultValues?.phone ?? ''}
                placeholder="+221 77 000 00 00"
                className={inputClass}
              />
            </div>
          </div>

          {/* Rôle */}
          <div>
            <label className="block text-sm font-medium text-ink-soft mb-1.5">Rôle</label>
            <select
              name="role"
              defaultValue={defaultValues?.role ?? 'technician'}
              className={selectClass}
            >
              <option value="technician">Technicien</option>
              <option value="admin">Administrateur</option>
            </select>
          </div>

          {/* Mot de passe temporaire (create only) */}
          {!isEdit && (
            <div>
              <label className="block text-sm font-medium text-ink-soft mb-1.5">
                Mot de passe temporaire <span className="text-accent">*</span>
              </label>
              <input
                name="password"
                type="password"
                required
                minLength={8}
                placeholder="8 caractères minimum"
                className={inputClass}
              />
              <p className="text-xs text-ink-muted mt-1.5">
                Communiquez ce mot de passe au technicien directement. Il pourra le modifier depuis son profil.
              </p>
            </div>
          )}
        </Card>

        <div className="flex items-center justify-end gap-3 mt-6">
          <Link
            href="/admin/team"
            className="px-4 py-2.5 rounded-lg border border-line text-sm font-medium text-ink bg-card hover:bg-neutral-soft transition-colors"
          >
            Annuler
          </Link>
          <button
            type="submit"
            disabled={pending}
            className="flex items-center gap-2 px-5 py-2.5 rounded-lg text-sm font-medium text-white bg-accent disabled:opacity-60 transition-opacity hover:opacity-90"
          >
            {pending && <Loader2 size={15} className="animate-spin" />}
            {isEdit ? 'Enregistrer' : 'Créer le compte'}
          </button>
        </div>
      </form>
    </div>
  )
}
```

- [ ] **Paso 2: Verificar tipos**

```bash
npx tsc --noEmit
```

Resultado esperado: sin errores.

- [ ] **Paso 3: Commit**

```bash
git add src/components/admin/TeamMemberForm.tsx
git commit -m "refactor: TeamMemberForm — tokens Tailwind v4 + Card"
```

---

## Tarea 3: `src/app/admin/calendrier/page.tsx`

**Files:**
- Modify: `src/app/admin/calendrier/page.tsx`

Solo 4 cambios en el JSX. Los constantes `VISIT_COLOR` / `INCIDENT_COLOR` con hex values se **mantienen intactos** — son consumidos por la librería FullCalendar y no son clases Tailwind.

- [ ] **Paso 1: Migrar h1**

Reemplazar:
```tsx
<h1 className="text-2xl font-semibold text-gray-900" style={{ fontFamily: 'Poppins, sans-serif' }}>
  Calendrier
</h1>
```
Por:
```tsx
<h1 className="text-2xl font-semibold font-display text-ink">
  Calendrier
</h1>
```

- [ ] **Paso 2: Migrar subtítulo de stats**

Reemplazar el bloque completo:
```tsx
<p className="text-sm text-gray-400 mt-0.5">
  {totalVisits} visite{totalVisits !== 1 ? 's' : ''} de maintenance
  {overdueVisits > 0 && (
    <span className="ml-2 text-red-500 font-medium">· {overdueVisits} en retard</span>
  )}
  {openIncidents > 0 && (
    <span className="ml-2 text-orange-500 font-medium">· {openIncidents} incident{openIncidents !== 1 ? 's' : ''} ouvert{openIncidents !== 1 ? 's' : ''}</span>
  )}
</p>
```
Por:
```tsx
<p className="text-sm text-ink-muted mt-0.5">
  {totalVisits} visite{totalVisits !== 1 ? 's' : ''} de maintenance
  {overdueVisits > 0 && (
    <span className="ml-2 text-accent font-medium">· {overdueVisits} en retard</span>
  )}
  {openIncidents > 0 && (
    <span className="ml-2 text-warning font-medium">· {openIncidents} incident{openIncidents !== 1 ? 's' : ''} ouvert{openIncidents !== 1 ? 's' : ''}</span>
  )}
</p>
```

- [ ] **Paso 3: Verificar tipos**

```bash
npx tsc --noEmit
```

Resultado esperado: sin errores.

- [ ] **Paso 4: Commit**

```bash
git add src/app/admin/calendrier/page.tsx
git commit -m "refactor: calendrier/page — tokens Tailwind v4 (h1, stats)"
```

---

## Tarea 4: `src/app/admin/princity/page.tsx`

**Files:**
- Modify: `src/app/admin/princity/page.tsx`

- [ ] **Paso 1: Actualizar imports**

Al principio del archivo, añadir después de los imports existentes:
```tsx
import { Card } from '@/components/ui/Card'
import { Badge } from '@/components/ui/Badge'
```

El import existente es:
```tsx
import { createClient }    from '@/lib/supabase/server'
import { redirect }        from 'next/navigation'
import { CheckCircle2, XCircle, Activity } from 'lucide-react'
import InitialImportButton from './InitialImportButton'
```

Quedará:
```tsx
import { createClient }    from '@/lib/supabase/server'
import { redirect }        from 'next/navigation'
import { CheckCircle2, XCircle, Activity } from 'lucide-react'
import InitialImportButton from './InitialImportButton'
import { Card } from '@/components/ui/Card'
import { Badge } from '@/components/ui/Badge'
```

- [ ] **Paso 2: Migrar header**

Reemplazar:
```tsx
<div className="mb-8">
  <h1 className="text-2xl font-semibold text-gray-900" style={{ fontFamily: 'Poppins, sans-serif' }}>
    Intégration Princity
  </h1>
  <p className="text-sm text-gray-500 mt-1">Surveillance et importation des données Princity</p>
</div>
```
Por:
```tsx
<div className="mb-8">
  <h1 className="text-2xl font-semibold font-display text-ink">
    Intégration Princity
  </h1>
  <p className="text-sm text-ink-soft mt-1">Surveillance et importation des données Princity</p>
</div>
```

- [ ] **Paso 3: Migrar section header "État des fonctions"**

Reemplazar:
```tsx
<h2 className="text-sm font-semibold text-gray-700 uppercase tracking-wider mb-3">État des fonctions</h2>
```
Por:
```tsx
<h2 className="text-sm font-semibold text-ink uppercase tracking-wider mb-3">État des fonctions</h2>
```

- [ ] **Paso 4: Migrar health cards**

Reemplazar el bloque `.map(row => { ... return (<div key={...} className="bg-white rounded-xl border border-gray-200 p-5">...</div>) })` por:

```tsx
{(health ?? []).map(row => {
  const ok = row.last_success_at && !row.alert_sent
  return (
    <Card key={row.function_name} className="p-5">
      <div className="flex items-center justify-between mb-3">
        <span className="text-xs font-medium text-ink-muted">
          {THRESHOLD_LABELS[row.function_name] ?? row.function_name}
        </span>
        {ok
          ? <CheckCircle2 size={16} className="text-success" />
          : <XCircle     size={16} className="text-accent" />}
      </div>
      <p className="text-xs text-ink-soft">
        <span className="font-medium">Dernière sync:</span> {formatDate(row.last_success_at)}
      </p>
      {row.last_error_message && (
        <p className="text-xs text-accent mt-1 truncate" title={row.last_error_message}>
          ⚠ {row.last_error_message}
        </p>
      )}
    </Card>
  )
})}
```

- [ ] **Paso 5: Migrar sección de warning (Importation initiale)**

Reemplazar:
```tsx
<section className="mb-8 bg-amber-50 border border-amber-200 rounded-xl p-6">
  <h2 className="text-sm font-semibold text-amber-800 mb-2 flex items-center gap-2">
    <Activity size={15} />
    Importation initiale
  </h2>
  <p className="text-xs text-amber-700 mb-4">
    Efface toutes les données de test et importe clients + équipements depuis Princity.{' '}
    <strong>Action irréversible.</strong> Les contrats devront être créés manuellement ensuite.
  </p>
  <InitialImportButton />
</section>
```
Por:
```tsx
<section className="mb-8 bg-warning-soft border border-warning/30 rounded-card p-6">
  <h2 className="text-sm font-semibold text-ink mb-2 flex items-center gap-2">
    <Activity size={15} />
    Importation initiale
  </h2>
  <p className="text-xs text-ink-soft mb-4">
    Efface toutes les données de test et importe clients + équipements depuis Princity.{' '}
    <strong>Action irréversible.</strong> Les contrats devront être créés manuellement ensuite.
  </p>
  <InitialImportButton />
</section>
```

- [ ] **Paso 6: Migrar section header "Journal"**

Reemplazar:
```tsx
<h2 className="text-sm font-semibold text-gray-700 uppercase tracking-wider mb-3">
  Journal (20 dernières exécutions)
</h2>
```
Por:
```tsx
<h2 className="text-sm font-semibold text-ink uppercase tracking-wider mb-3">
  Journal (20 dernières exécutions)
</h2>
```

- [ ] **Paso 7: Migrar tabla de logs**

Reemplazar el wrapper + tabla completa:
```tsx
<div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
  <table className="w-full text-xs">
    <thead className="bg-gray-50 border-b border-gray-200">
      <tr>
        {['Fonction', 'Endpoint', 'Date', 'Statut', 'Traités', 'Créés'].map(h => (
          <th key={h} className="px-4 py-3 text-left font-medium text-gray-500">{h}</th>
        ))}
      </tr>
    </thead>
    <tbody className="divide-y divide-gray-100">
      {(logs ?? []).map((log, i) => (
        <tr key={i} className="hover:bg-gray-50">
          <td className="px-4 py-2.5 font-mono text-gray-700">{log.function_name}</td>
          <td className="px-4 py-2.5 text-gray-500 truncate max-w-32">{log.endpoint_called}</td>
          <td className="px-4 py-2.5 text-gray-500">{formatDate(log.executed_at)}</td>
          <td className="px-4 py-2.5">
            <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${
              log.status === 'success' ? 'bg-green-50 text-green-700' :
              log.status === 'partial'  ? 'bg-amber-50 text-amber-700' :
                                           'bg-red-50 text-red-700'
            }`}>{log.status}</span>
          </td>
          <td className="px-4 py-2.5 text-gray-600">{log.records_processed}</td>
          <td className="px-4 py-2.5 text-gray-600">{log.records_created}</td>
        </tr>
      ))}
      {!logs?.length && (
        <tr>
          <td colSpan={6} className="px-4 py-8 text-center text-gray-400">Aucun log disponible</td>
        </tr>
      )}
    </tbody>
  </table>
</div>
```
Por:
```tsx
<Card className="overflow-hidden">
  <table className="w-full text-xs">
    <thead className="bg-neutral-soft border-b border-line-subtle">
      <tr>
        {['Fonction', 'Endpoint', 'Date', 'Statut', 'Traités', 'Créés'].map(h => (
          <th key={h} className="px-4 py-3 text-left font-medium text-ink-muted">{h}</th>
        ))}
      </tr>
    </thead>
    <tbody className="divide-y divide-line-subtle">
      {(logs ?? []).map((log, i) => (
        <tr key={i} className="hover:bg-neutral-soft transition-colors">
          <td className="px-4 py-2.5 font-mono text-ink-soft">{log.function_name}</td>
          <td className="px-4 py-2.5 text-ink-muted truncate max-w-32">{log.endpoint_called}</td>
          <td className="px-4 py-2.5 text-ink-muted">{formatDate(log.executed_at)}</td>
          <td className="px-4 py-2.5">
            <Badge variant={
              log.status === 'success' ? 'success' :
              log.status === 'partial'  ? 'warning' :
                                           'danger'
            }>
              {log.status}
            </Badge>
          </td>
          <td className="px-4 py-2.5 text-ink-soft">{log.records_processed}</td>
          <td className="px-4 py-2.5 text-ink-soft">{log.records_created}</td>
        </tr>
      ))}
      {!logs?.length && (
        <tr>
          <td colSpan={6} className="px-4 py-8 text-center text-ink-muted">Aucun log disponible</td>
        </tr>
      )}
    </tbody>
  </table>
</Card>
```

- [ ] **Paso 8: Verificar tipos**

```bash
npx tsc --noEmit
```

Resultado esperado: sin errores.

- [ ] **Paso 9: Commit**

```bash
git add src/app/admin/princity/page.tsx
git commit -m "refactor: princity/page — tokens Tailwind v4 + Card + Badge"
```

---

## Tarea 5: `src/app/admin/contadores/[serie]/page.tsx`

**Files:**
- Modify: `src/app/admin/contadores/[serie]/page.tsx`

- [ ] **Paso 1: Actualizar imports**

Añadir al bloque de imports existente (después de `import CancelModal from './cancel-modal'`):
```tsx
import { Card } from '@/components/ui/Card'
import { PanelHeader } from '@/components/ui/PanelHeader'
import { Badge } from '@/components/ui/Badge'
```

- [ ] **Paso 2: Migrar breadcrumb + header**

Reemplazar:
```tsx
{/* Breadcrumb */}
<div className="flex items-center gap-3">
  <Link
    href="/admin/contadores"
    className="flex items-center justify-center w-9 h-9 rounded-xl border border-gray-200 bg-white"
  >
    <ArrowLeft size={16} className="text-gray-600" />
  </Link>
  <div>
    <h1 className="text-xl font-semibold text-gray-900" style={{ fontFamily: 'Poppins, sans-serif' }}>
      {machine.marque} {machine.modele}
    </h1>
    <p className="font-mono text-xs text-gray-400">{machine.numero_serie}</p>
  </div>
</div>
```
Por:
```tsx
{/* Breadcrumb */}
<div className="flex items-center gap-3">
  <Link
    href="/admin/contadores"
    className="flex items-center justify-center w-9 h-9 rounded-xl border border-line bg-card"
  >
    <ArrowLeft size={16} className="text-ink-soft" />
  </Link>
  <div>
    <h1 className="text-xl font-semibold font-display text-ink">
      {machine.marque} {machine.modele}
    </h1>
    <p className="font-mono text-xs text-ink-muted">{machine.numero_serie}</p>
  </div>
</div>
```

- [ ] **Paso 3: Migrar info cards (Client + Contrat)**

Reemplazar:
```tsx
{/* Info cards */}
<div className="grid grid-cols-1 md:grid-cols-2 gap-4">
  {client && (
    <div className="bg-white rounded-xl border border-gray-200 p-4 flex items-center gap-3">
      <Building2 size={16} className="text-gray-400 shrink-0" />
      <div>
        <p className="text-xs text-gray-400">Client</p>
        <p className="text-sm font-semibold text-gray-900">{client.nom_client}</p>
        <p className="text-xs text-gray-400">N° {client.id}</p>
      </div>
    </div>
  )}
  {contract && (
    <div className="bg-white rounded-xl border border-gray-200 p-4 flex items-center gap-3">
      <FileText size={16} className="text-gray-400 shrink-0" />
      <div>
        <p className="text-xs text-gray-400">Contrat actif</p>
        <p className="text-sm font-semibold text-gray-900">{contract.numero_contrat}</p>
      </div>
    </div>
  )}
</div>
```
Por:
```tsx
{/* Info cards */}
<div className="grid grid-cols-1 md:grid-cols-2 gap-4">
  {client && (
    <Card className="p-4 flex items-center gap-3">
      <Building2 size={16} className="text-ink-muted shrink-0" />
      <div>
        <p className="text-xs text-ink-muted">Client</p>
        <p className="text-sm font-semibold text-ink">{client.nom_client}</p>
        <p className="text-xs text-ink-muted">N° {client.id}</p>
      </div>
    </Card>
  )}
  {contract && (
    <Card className="p-4 flex items-center gap-3">
      <FileText size={16} className="text-ink-muted shrink-0" />
      <div>
        <p className="text-xs text-ink-muted">Contrat actif</p>
        <p className="text-sm font-semibold text-ink">{contract.numero_contrat}</p>
      </div>
    </Card>
  )}
</div>
```

- [ ] **Paso 4: Migrar card del gráfico**

Reemplazar:
```tsx
{/* Graphique */}
<div className="bg-white rounded-xl border border-gray-200 p-5">
  <p className="text-sm font-semibold text-gray-900 mb-4">
    Évolution mensuelle (pages imprimées)
  </p>
  <CounterChart data={chartData} />
</div>
```
Por:
```tsx
{/* Graphique */}
<Card className="p-5">
  <p className="text-sm font-semibold text-ink mb-4">
    Évolution mensuelle (pages imprimées)
  </p>
  <CounterChart data={chartData} />
</Card>
```

- [ ] **Paso 5: Migrar tabla de historique**

Reemplazar el bloque completo del historique:
```tsx
{/* Historique */}
<div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
  <div className="px-5 py-4 border-b border-gray-100">
    <p className="text-sm font-semibold text-gray-900">Historique des relevés</p>
  </div>
  <table className="w-full text-sm">
    <thead>
      <tr className="border-b border-gray-100 bg-gray-50">
        <th className="text-left px-5 py-3 text-xs font-medium text-gray-500">Période</th>
        <th className="text-right px-4 py-3 text-xs font-medium text-gray-500">N&amp;B total</th>
        <th className="text-right px-4 py-3 text-xs font-medium text-gray-500">Δ N&amp;B</th>
        <th className="text-right px-4 py-3 text-xs font-medium text-gray-500">Couleur total</th>
        <th className="text-right px-4 py-3 text-xs font-medium text-gray-500">Δ Couleur</th>
        <th className="text-left px-4 py-3 text-xs font-medium text-gray-500">Statut</th>
        <th />
      </tr>
    </thead>
    <tbody className="divide-y divide-gray-50">
      {tableRows.length === 0 && (
        <tr>
          <td colSpan={7} className="px-5 py-10 text-center text-gray-400 text-sm">
            Aucun relevé enregistré
          </td>
        </tr>
      )}
      {tableRows.map(c => {
        const d         = deltaMap.get(c.id)
        const isAnnule  = c.status === 'annule'
        const deltaBw:  number | null = d?.delta_bw  ?? null
        const deltaCol: number | null = d?.delta_color ?? null

        return (
          <tr key={c.id} className={isAnnule ? 'bg-gray-50 opacity-60' : 'hover:bg-gray-50'}>
            <td className="px-5 py-3.5">
              <div className="flex items-center gap-1.5">
                {c.is_replacement_start && (
                  <span title="Remplacement de machine">
                    <RefreshCw size={12} className="text-blue-400 shrink-0" />
                  </span>
                )}
                <span className={isAnnule ? 'line-through text-gray-400' : 'font-medium text-gray-900'}>
                  {c.day ? `${c.day} ` : ''}{MONTHS_FR[c.month]} {c.year}
                </span>
              </div>
              {c.notes && <p className="text-xs text-gray-400 mt-0.5">{c.notes}</p>}
              {isAnnule && c.annulation_reason && (
                <p className="text-xs text-amber-600 mt-0.5">↳ {c.annulation_reason}</p>
              )}
            </td>
            <td className="px-4 py-3.5 text-right font-mono text-xs text-gray-700">
              {c.counter_bw.toLocaleString('fr-FR')}
            </td>
            <td className="px-4 py-3.5 text-right font-mono text-xs">
              {deltaBw === null ? (
                <span className="text-gray-300">—</span>
              ) : (
                <span className={deltaBw < 0 ? 'text-red-600 font-semibold' : 'text-gray-700'}>
                  {deltaBw < 0 ? '⚠ ' : ''}{deltaBw.toLocaleString('fr-FR')}
                </span>
              )}
            </td>
            <td className="px-4 py-3.5 text-right font-mono text-xs text-gray-700">
              {c.counter_color.toLocaleString('fr-FR')}
            </td>
            <td className="px-4 py-3.5 text-right font-mono text-xs">
              {deltaCol === null ? (
                <span className="text-gray-300">—</span>
              ) : (
                <span className={deltaCol < 0 ? 'text-red-600 font-semibold' : 'text-gray-700'}>
                  {deltaCol < 0 ? '⚠ ' : ''}{deltaCol.toLocaleString('fr-FR')}
                </span>
              )}
            </td>
            <td className="px-4 py-3.5">
              <span className={`inline-flex px-2 py-0.5 rounded text-xs font-medium ${
                isAnnule
                  ? 'bg-gray-100 text-gray-400'
                  : 'bg-green-50 text-green-700'
              }`}>
                {isAnnule ? 'Annulé' : 'Actif'}
              </span>
            </td>
            <td className="px-4 py-3.5 text-right">
              {!isAnnule && (
                <CancelModal
                  counterId={c.id}
                  machineId={numero_serie}
                  year={c.year}
                  month={c.month}
                  counterBw={c.counter_bw}
                  counterColor={c.counter_color}
                />
              )}
            </td>
          </tr>
        )
      })}
    </tbody>
  </table>
</div>
```
Por:
```tsx
{/* Historique */}
<Card className="overflow-hidden">
  <PanelHeader title="Historique des relevés" />
  <table className="w-full text-sm">
    <thead>
      <tr className="bg-neutral-soft border-b border-line-subtle">
        <th className="text-left px-5 py-3 text-[10px] font-semibold text-ink-muted uppercase tracking-[0.06em]">Période</th>
        <th className="text-right px-4 py-3 text-[10px] font-semibold text-ink-muted uppercase tracking-[0.06em]">N&amp;B total</th>
        <th className="text-right px-4 py-3 text-[10px] font-semibold text-ink-muted uppercase tracking-[0.06em]">Δ N&amp;B</th>
        <th className="text-right px-4 py-3 text-[10px] font-semibold text-ink-muted uppercase tracking-[0.06em]">Couleur total</th>
        <th className="text-right px-4 py-3 text-[10px] font-semibold text-ink-muted uppercase tracking-[0.06em]">Δ Couleur</th>
        <th className="text-left px-4 py-3 text-[10px] font-semibold text-ink-muted uppercase tracking-[0.06em]">Statut</th>
        <th />
      </tr>
    </thead>
    <tbody className="divide-y divide-line-subtle">
      {tableRows.length === 0 && (
        <tr>
          <td colSpan={7} className="px-5 py-10 text-center text-ink-muted text-sm">
            Aucun relevé enregistré
          </td>
        </tr>
      )}
      {tableRows.map(c => {
        const d         = deltaMap.get(c.id)
        const isAnnule  = c.status === 'annule'
        const deltaBw:  number | null = d?.delta_bw  ?? null
        const deltaCol: number | null = d?.delta_color ?? null

        return (
          <tr key={c.id} className={isAnnule ? 'bg-neutral-soft opacity-60' : 'hover:bg-neutral-soft transition-colors'}>
            <td className="px-5 py-3.5">
              <div className="flex items-center gap-1.5">
                {c.is_replacement_start && (
                  <span title="Remplacement de machine">
                    <RefreshCw size={12} className="text-info shrink-0" />
                  </span>
                )}
                <span className={isAnnule ? 'line-through text-ink-muted' : 'font-medium text-ink'}>
                  {c.day ? `${c.day} ` : ''}{MONTHS_FR[c.month]} {c.year}
                </span>
              </div>
              {c.notes && <p className="text-xs text-ink-muted mt-0.5">{c.notes}</p>}
              {isAnnule && c.annulation_reason && (
                <p className="text-xs text-warning mt-0.5">↳ {c.annulation_reason}</p>
              )}
            </td>
            <td className="px-4 py-3.5 text-right font-mono text-xs text-ink-soft">
              {c.counter_bw.toLocaleString('fr-FR')}
            </td>
            <td className="px-4 py-3.5 text-right font-mono text-xs">
              {deltaBw === null ? (
                <span className="text-ink-muted">—</span>
              ) : (
                <span className={deltaBw < 0 ? 'text-accent font-semibold' : 'text-ink-soft'}>
                  {deltaBw < 0 ? '⚠ ' : ''}{deltaBw.toLocaleString('fr-FR')}
                </span>
              )}
            </td>
            <td className="px-4 py-3.5 text-right font-mono text-xs text-ink-soft">
              {c.counter_color.toLocaleString('fr-FR')}
            </td>
            <td className="px-4 py-3.5 text-right font-mono text-xs">
              {deltaCol === null ? (
                <span className="text-ink-muted">—</span>
              ) : (
                <span className={deltaCol < 0 ? 'text-accent font-semibold' : 'text-ink-soft'}>
                  {deltaCol < 0 ? '⚠ ' : ''}{deltaCol.toLocaleString('fr-FR')}
                </span>
              )}
            </td>
            <td className="px-4 py-3.5">
              <Badge variant={isAnnule ? 'neutral' : 'success'}>
                {isAnnule ? 'Annulé' : 'Actif'}
              </Badge>
            </td>
            <td className="px-4 py-3.5 text-right">
              {!isAnnule && (
                <CancelModal
                  counterId={c.id}
                  machineId={numero_serie}
                  year={c.year}
                  month={c.month}
                  counterBw={c.counter_bw}
                  counterColor={c.counter_color}
                />
              )}
            </td>
          </tr>
        )
      })}
    </tbody>
  </table>
</Card>
```

- [ ] **Paso 6: Migrar card del formulario "Nouveau relevé"**

Reemplazar:
```tsx
{/* Formulario nuevo relevé */}
<div>
  <div className="bg-white rounded-xl border border-gray-200 p-5 sticky top-6">
    <p className="text-sm font-semibold text-gray-900 mb-4">Nouveau relevé</p>
    <CounterForm machineId={numero_serie} />
  </div>
</div>
```
Por:
```tsx
{/* Formulario nuevo relevé */}
<div>
  <Card className="p-5 sticky top-6">
    <p className="text-sm font-semibold text-ink mb-4">Nouveau relevé</p>
    <CounterForm machineId={numero_serie} />
  </Card>
</div>
```

- [ ] **Paso 7: Verificar tipos**

```bash
npx tsc --noEmit
```

Resultado esperado: sin errores.

- [ ] **Paso 8: Commit**

```bash
git add src/app/admin/contadores/\[serie\]/page.tsx
git commit -m "refactor: contadores/[serie]/page — tokens Tailwind v4 + Card + PanelHeader + Badge"
```

---

## Tarea 6: `src/app/admin/machines/[serie]/qr/page.tsx`

**Files:**
- Modify: `src/app/admin/machines/[serie]/qr/page.tsx`

Esta es una etiqueta imprimible. Se mantiene `style={{ width: 320, fontFamily: 'Helvetica, Arial, sans-serif' }}` (tipografía del documento impreso — Helvetica, no Poppins). Los estilos funcionales de imagen (`objectFit`, `filter`) también se mantienen intactos.

- [ ] **Paso 1: Migrar wrapper de la etiqueta**

Reemplazar:
```tsx
className="label bg-white rounded-2xl shadow-lg overflow-hidden"
```
Por:
```tsx
className="label bg-card rounded-card shadow-card overflow-hidden"
```

- [ ] **Paso 2: Migrar cabecera roja**

Reemplazar:
```tsx
<div
  className="flex items-center justify-between px-5 py-4"
  style={{ backgroundColor: '#BF0D0D' }}
>
```
Por:
```tsx
<div className="flex items-center justify-between px-5 py-4 bg-accent">
```

- [ ] **Paso 3: Migrar etiquetas de campo ("Machine", "N° Série", etc.)**

Hay múltiples ocurrencias (hasta 8, algunas en bloques condicionales) de `text-xs text-gray-400 uppercase tracking-wide mb-0.5`. Reemplazar todas por `text-xs text-ink-muted uppercase tracking-wide mb-0.5`.

```tsx
// Buscar: className="text-xs text-gray-400 uppercase tracking-wide mb-0.5"
// Reemplazar: className="text-xs text-ink-muted uppercase tracking-wide mb-0.5"
// (6 ocurrencias en la etiqueta)
```

- [ ] **Paso 4: Migrar textos de datos**

Reemplazar:
- `text-base font-bold text-gray-900` → `text-base font-bold text-ink` (nombre máquina)
- `text-xs font-mono font-semibold text-gray-800` → `text-xs font-mono font-semibold text-ink` (serie + tipo)
- `text-xs text-gray-800` → `text-xs text-ink` (localisation)
- `text-sm font-semibold text-gray-900` → `text-sm font-semibold text-ink` (client name)
- `text-xs font-mono font-semibold text-gray-800` → ya migrado en paso anterior (N° Client, N° Contrat)
- `text-xs text-gray-800` → `text-xs text-ink` (site)

- [ ] **Paso 5: Migrar separador y sección QR**

Reemplazar:
```tsx
<div className="mx-5 border-t border-gray-100 my-2" />
```
Por:
```tsx
<div className="mx-5 border-t border-line-subtle my-2" />
```

Reemplazar:
```tsx
<div className="flex flex-col items-center py-4 bg-gray-50 mt-2">
```
Por:
```tsx
<div className="flex flex-col items-center py-4 bg-neutral-soft mt-2">
```

Reemplazar:
```tsx
<p className="text-xs text-gray-400 mt-2 text-center px-4">
```
Por:
```tsx
<p className="text-xs text-ink-muted mt-2 text-center px-4">
```

- [ ] **Paso 6: Migrar texto "sin cliente"**

Reemplazar:
```tsx
<p className="text-xs text-gray-400 italic">Aucun client associé</p>
```
Por:
```tsx
<p className="text-xs text-ink-muted italic">Aucun client associé</p>
```

- [ ] **Paso 7: Verificar tipos**

```bash
npx tsc --noEmit
```

Resultado esperado: sin errores.

- [ ] **Paso 8: Build final completo**

```bash
npm run build
```

Resultado esperado: `✓ Compiled successfully` sin errores de compilación.

- [ ] **Paso 9: Commit**

```bash
git add src/app/admin/machines/\[serie\]/qr/page.tsx
git commit -m "refactor: machines/[serie]/qr/page — tokens Tailwind v4 (etiqueta imprimible)"
```

---

## Verificación final y PR

- [ ] **Build limpio final**

```bash
npm run build
```

Resultado esperado: build exitoso sin errores.

- [ ] **Crear PR**

```bash
git push origin refactor/admin-1e-design-tokens
gh pr create \
  --title "refactor: admin bloque 1e — tokens diseño secundarias (team, calendrier, princity, contadores, QR)" \
  --body "$(cat <<'EOF'
## Summary

- Migración de 6 archivos de páginas secundarias de \`/admin\` a tokens Tailwind v4 y componentes UI de Fase 0
- Reemplaza \`bg-white/border-gray-*/text-gray-*\` por \`bg-card/border-line*/text-ink*\`
- Reemplaza estilos inline (\`#BF0D0D\`, Poppins) por \`bg-accent\` y \`font-display\`
- Usa \`<Card>\`, \`<Badge>\`, \`<PanelHeader>\` donde corresponde
- Sin cambios de lógica, queries ni Server Actions

## Archivos modificados
- \`src/app/admin/team/page.tsx\` — Card + Badge roles (danger/info)
- \`src/components/admin/TeamMemberForm.tsx\` — patrón form completo (igual a bloque 1d)
- \`src/app/admin/calendrier/page.tsx\` — h1 + stats (3 cambios)
- \`src/app/admin/princity/page.tsx\` — Card + Badge status + warning section
- \`src/app/admin/contadores/[serie]/page.tsx\` — Card + PanelHeader + Badge + tokens tabla
- \`src/app/admin/machines/[serie]/qr/page.tsx\` — tokens etiqueta imprimible

## Test plan
- [ ] \`npx tsc --noEmit\` sin errores
- [ ] \`npm run build\` sin errores
- [ ] \`/admin/team\` — tabla con badges Administrateur (rojo) / Technicien (azul)
- [ ] \`/admin/team/new\` — formulario con tokens, sin estilos inline
- [ ] \`/admin/calendrier\` — h1 Poppins, stats en retard rojo, incidents naranja
- [ ] \`/admin/princity\` — cards de health, tabla logs con Badge success/warning/danger
- [ ] \`/admin/contadores/[cualquier-serie]\` — cards, tabla con PanelHeader
- [ ] \`/admin/machines/[serie]/qr\` — etiqueta imprimible con cabecera roja vía bg-accent
EOF
)"
```
