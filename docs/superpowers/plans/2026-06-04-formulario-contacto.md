# Formulario de Contacto Funcional — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Hacer que un lead del formulario público se persista siempre en una tabla `leads` y notifique al equipo comercial por email, con una pantalla admin para gestionarlos.

**Architecture:** El API route `/api/contact` (que ya valida CSRF + rate limit + campos) persiste el lead con `createAdminClient()` (crítico) y notifica vía `sendEmail` template `raw` (best-effort). Pantalla `/admin/leads` para listar/filtrar/cambiar estado. No se toca la Edge Function `send-email`.

**Tech Stack:** Next.js 16 App Router, API route, Server Actions, Supabase JS, PostgreSQL, Supabase MCP.

---

## Mapa de archivos

| Archivo | Acción |
|---|---|
| `supabase/migrations/20260604150000_leads.sql` | Crear (tabla + RLS) |
| `src/lib/lead-email.ts` | Crear (NEEDS_LABELS + buildLeadEmailHtml + escapeHtml) |
| `src/app/api/contact/route.ts` | Persistir + notificar |
| `src/app/admin/leads/actions.ts` | Crear (updateLeadStatusAction) |
| `src/app/admin/leads/status-control.tsx` | Crear (client component) |
| `src/app/admin/leads/page.tsx` | Crear (lista + filtro) |
| `src/components/admin/Sidebar.tsx` | Añadir entrada "Leads" |

---

### Task 1: Rama Git

**Files:** N/A

- [ ] **Step 1**

```bash
cd "/Users/juanmiguel/Claude/Web AMD Codex/web-amd"
git checkout main && git pull
git checkout -b feat/formulario-contacto
```
Expected: `git branch --show-current` → `feat/formulario-contacto`

---

### Task 2: Migración SQL — tabla leads

**Files:**
- Create: `supabase/migrations/20260604150000_leads.sql`

- [ ] **Step 1: Crear el archivo**

```sql
-- Tabla de leads del formulario público de contacto.
CREATE TABLE leads (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name       text NOT NULL,
  email      text NOT NULL,
  company    text NOT NULL,
  phone      text NOT NULL,
  needs      text NOT NULL CHECK (needs IN ('rental','sales','management','maintenance','other')),
  message    text,
  status     text NOT NULL DEFAULT 'nouveau' CHECK (status IN ('nouveau','traité','archivé')),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX leads_status_created_idx ON leads (status, created_at DESC);

ALTER TABLE leads ENABLE ROW LEVEL SECURITY;

-- Solo admin gestiona. El insert público lo hace el route con service_role (bypassa RLS).
CREATE POLICY "admin_all_leads" ON leads FOR ALL TO authenticated USING (
  EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
);
```

- [ ] **Step 2: Aplicar vía MCP**

`mcp__supabase__apply_migration` con project_id `myyejbviunyvywfukysj`, name `leads`, query = el SQL.

- [ ] **Step 3: Verificar**

```sql
SELECT column_name, data_type FROM information_schema.columns
WHERE table_name = 'leads' ORDER BY ordinal_position;
```
Expected: 9 columnas (id, name, email, company, phone, needs, message, status, created_at).

```sql
SELECT count(*) FROM pg_policies WHERE tablename = 'leads';
```
Expected: 1 (admin_all_leads).

- [ ] **Step 4: Commit**

```bash
cd "/Users/juanmiguel/Claude/Web AMD Codex/web-amd"
git add supabase/migrations/20260604150000_leads.sql
git commit -m "feat(db): tabla leads con RLS admin"
```

---

### Task 3: Helper lead-email.ts

**Files:**
- Create: `src/lib/lead-email.ts`

- [ ] **Step 1: Crear el archivo**

```ts
// Construcción del email de notificación de un nuevo lead al equipo comercial.
// El lead es input público no confiable → todo valor se escapa para evitar inyección HTML.

export const NEEDS_LABELS: Record<string, string> = {
  rental:      'Location',
  sales:       'Vente',
  management:  'Gestion de parc',
  maintenance: 'Maintenance',
  other:       'Autre',
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

export function buildLeadEmailHtml(lead: {
  name: string; email: string; company: string; phone: string; needsLabel: string; message: string
}): string {
  const { name, email, company, phone, needsLabel, message } = lead
  const row = (label: string, value: string) =>
    `<tr><td style="padding:6px 0;color:#6b7280;width:130px;vertical-align:top">${label}</td><td style="padding:6px 0;font-weight:500">${value}</td></tr>`
  return `
    <div style="font-family:Inter,sans-serif;max-width:560px;margin:0 auto;color:#111">
      <div style="background:#BF0D0D;padding:24px 32px;border-radius:12px 12px 0 0">
        <p style="color:white;font-weight:700;font-size:18px;margin:0">AMD Service</p>
      </div>
      <div style="padding:32px;border:1px solid #e5e7eb;border-top:none;border-radius:0 0 12px 12px">
        <h2 style="margin-top:0">Nouveau lead reçu</h2>
        <table style="width:100%;border-collapse:collapse;font-size:14px">
          ${row('Entreprise', `<strong>${escapeHtml(company)}</strong>`)}
          ${row('Contact', escapeHtml(name))}
          ${row('Email', `<a href="mailto:${escapeHtml(email)}" style="color:#BF0D0D">${escapeHtml(email)}</a>`)}
          ${row('Téléphone', `<a href="tel:${escapeHtml(phone)}" style="color:#BF0D0D">${escapeHtml(phone)}</a>`)}
          ${row('Besoin', escapeHtml(needsLabel))}
        </table>
        ${message
          ? `<div style="margin-top:16px"><p style="color:#6b7280;font-size:13px;margin:0 0 4px">Message</p><p style="margin:0;white-space:pre-wrap">${escapeHtml(message)}</p></div>`
          : ''}
      </div>
    </div>
  `
}
```

- [ ] **Step 2: Verificar TypeScript**

```bash
cd "/Users/juanmiguel/Claude/Web AMD Codex/web-amd" && npx tsc --noEmit 2>&1 | grep "lead-email" | head -5
```
Expected: sin errores.

- [ ] **Step 3: Commit**

```bash
git add src/lib/lead-email.ts
git commit -m "feat(leads): helper de email con escape HTML"
```

---

### Task 4: API route — persistir + notificar

**Files:**
- Modify: `src/app/api/contact/route.ts`

- [ ] **Step 1: Actualizar imports (líneas 1-2)**

Reemplazar:
```ts
import { NextRequest, NextResponse } from 'next/server'
import { checkRateLimit, getClientIpFromHeaders } from '@/lib/rate-limit'
```
por:
```ts
import { NextRequest, NextResponse } from 'next/server'
import { checkRateLimit, getClientIpFromHeaders } from '@/lib/rate-limit'
import { createAdminClient } from '@/lib/supabase/admin'
import { sendEmail } from '@/lib/email'
import { NEEDS_LABELS, buildLeadEmailHtml } from '@/lib/lead-email'
```

- [ ] **Step 2: Reemplazar los dos TODOs y el return final (líneas 43-46)**

Localizar:
```ts
  // TODO: Supabase — store lead
  // TODO: Mailjet — send confirmation email

  return NextResponse.json({ success: true, message: 'Message reçu' }, { status: 200 })
```

Reemplazar por:
```ts
  // 1. Persistir el lead — CRÍTICO. Si falla, el usuario debe reintentar.
  const admin = createAdminClient()
  const { error: insertErr } = await admin.from('leads').insert({
    name, email, company, phone, needs, message: message || null,
  })
  if (insertErr) {
    console.error('[contact.insert]', insertErr)
    return NextResponse.json({ success: false, message: 'Une erreur est survenue. Veuillez réessayer.' }, { status: 500 })
  }

  // 2. Notificar al equipo comercial — best-effort. El lead ya está guardado.
  const to = process.env.COMMERCIAL_EMAIL
  if (to) {
    const needsLabel = NEEDS_LABELS[needs] ?? needs
    await sendEmail({
      template: 'raw',
      to,
      data: {
        subject: `Nouveau lead : ${company} (${needsLabel})`,
        html: buildLeadEmailHtml({ name, email, company, phone, needsLabel, message }),
      },
    }).catch((e) => console.error('[contact.notify]', e))
  } else {
    console.warn('[contact.notify] COMMERCIAL_EMAIL non configurée — lead enregistré sans notification')
  }

  return NextResponse.json({ success: true, message: 'Message reçu' }, { status: 200 })
```

- [ ] **Step 3: Verificar TypeScript**

```bash
cd "/Users/juanmiguel/Claude/Web AMD Codex/web-amd" && npx tsc --noEmit 2>&1 | grep "api/contact" | head -10
```
Expected: sin errores.

- [ ] **Step 4: Commit**

```bash
git add src/app/api/contact/route.ts
git commit -m "feat(contact): persistir lead y notificar equipo comercial"
```

---

### Task 5: Acción + control de estado

**Files:**
- Create: `src/app/admin/leads/actions.ts`
- Create: `src/app/admin/leads/status-control.tsx`

- [ ] **Step 1: Crear `actions.ts`**

```ts
'use server'

import { requireAdmin } from '@/lib/auth'
import { revalidatePath } from 'next/cache'

const VALID_STATUSES = ['nouveau', 'traité', 'archivé']

export async function updateLeadStatusAction(
  id: string,
  status: string
): Promise<{ error?: string }> {
  const { supabase } = await requireAdmin()
  if (!VALID_STATUSES.includes(status)) return { error: 'Statut invalide.' }

  const { error } = await supabase.from('leads').update({ status }).eq('id', id)
  if (error) {
    console.error('[updateLeadStatus]', error)
    return { error: 'Erreur lors de la mise à jour.' }
  }

  revalidatePath('/admin/leads')
  return {}
}
```

- [ ] **Step 2: Crear `status-control.tsx`**

```tsx
'use client'

import { useState, useTransition } from 'react'
import { updateLeadStatusAction } from './actions'

const STATUSES = [
  { value: 'nouveau', label: 'Nouveau' },
  { value: 'traité',  label: 'Traité'  },
  { value: 'archivé', label: 'Archivé' },
]

export default function StatusControl({ id, current }: { id: string; current: string }) {
  const [status, setStatus] = useState(current)
  const [pending, startTransition] = useTransition()

  function onChange(e: React.ChangeEvent<HTMLSelectElement>) {
    const next = e.target.value
    const prev = status
    setStatus(next)
    startTransition(async () => {
      const res = await updateLeadStatusAction(id, next)
      if (res.error) setStatus(prev) // revertir en error
    })
  }

  return (
    <select
      value={status}
      onChange={onChange}
      disabled={pending}
      className="px-3 py-1.5 rounded-lg border border-line text-ink text-xs bg-card focus:outline-none focus:ring-2 focus:ring-accent/30 disabled:opacity-60"
    >
      {STATUSES.map((s) => (
        <option key={s.value} value={s.value}>{s.label}</option>
      ))}
    </select>
  )
}
```

- [ ] **Step 3: Verificar TypeScript**

```bash
cd "/Users/juanmiguel/Claude/Web AMD Codex/web-amd" && npx tsc --noEmit 2>&1 | grep "admin/leads" | head -10
```
Expected: sin errores.

- [ ] **Step 4: Commit**

```bash
git add src/app/admin/leads/actions.ts src/app/admin/leads/status-control.tsx
git commit -m "feat(leads): acción y control de cambio de estado"
```

---

### Task 6: Pantalla admin /admin/leads

**Files:**
- Create: `src/app/admin/leads/page.tsx`

- [ ] **Step 1: Crear `page.tsx`**

```tsx
import { createClient } from '@/lib/supabase/server'
import SearchFilters from '@/components/admin/SearchFilters'
import { Card } from '@/components/ui/Card'
import { Badge } from '@/components/ui/Badge'
import type { BadgeVariant } from '@/components/ui/Badge'
import { firstParam } from '@/lib/search'
import { NEEDS_LABELS } from '@/lib/lead-email'
import StatusControl from './status-control'

const RESULT_LIMIT = 300
const VALID_STATUSES = ['nouveau', 'traité', 'archivé']

const STATUS_VARIANT: Record<string, BadgeVariant> = {
  nouveau: 'info',
  traité:  'success',
  archivé: 'neutral',
}

type SearchParams = Promise<{ [key: string]: string | string[] | undefined }>

export default async function LeadsPage({ searchParams }: { searchParams: SearchParams }) {
  const sp = await searchParams
  const statusParam = firstParam(sp.status)
  const statusFilter = statusParam && VALID_STATUSES.includes(statusParam) ? statusParam : null

  const supabase = await createClient()
  let query = supabase
    .from('leads')
    .select('id, name, email, company, phone, needs, message, status, created_at')
    .order('created_at', { ascending: false })
    .limit(RESULT_LIMIT)
  if (statusFilter) query = query.eq('status', statusFilter)

  const { data: leads } = await query
  const rows = leads ?? []
  const newCount = rows.filter((l) => l.status === 'nouveau').length

  return (
    <div className="p-8 space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="font-display text-2xl font-semibold text-ink">Leads</h1>
          <p className="text-sm text-ink-muted mt-0.5">
            {rows.length} demande{rows.length !== 1 ? 's' : ''}
            {newCount > 0 && <span className="ml-2 text-accent font-medium">· {newCount} nouveau{newCount !== 1 ? 'x' : ''}</span>}
          </p>
        </div>
      </div>

      <SearchFilters
        placeholder=""
        filters={[
          {
            param: 'status',
            label: 'Tous les statuts',
            options: [
              { value: 'nouveau', label: 'Nouveau' },
              { value: 'traité',  label: 'Traité'  },
              { value: 'archivé', label: 'Archivé' },
            ],
          },
        ]}
      />

      {rows.length === 0 ? (
        <Card className="flex items-center justify-center py-20">
          <p className="text-sm text-ink-muted">Aucun lead pour le moment</p>
        </Card>
      ) : (
        <div className="space-y-3">
          {rows.map((lead) => (
            <Card key={lead.id} className="p-5">
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0">
                  <div className="flex items-center gap-2.5">
                    <p className="text-sm font-semibold text-ink">{lead.company}</p>
                    <Badge variant="violet">{NEEDS_LABELS[lead.needs] ?? lead.needs}</Badge>
                    <Badge variant={STATUS_VARIANT[lead.status] ?? 'neutral'}>{lead.status}</Badge>
                  </div>
                  <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mt-1.5 text-xs text-ink-muted">
                    <span>{lead.name}</span>
                    <a href={`mailto:${lead.email}`} className="text-ink-soft hover:text-accent transition-colors">{lead.email}</a>
                    <a href={`tel:${lead.phone}`} className="text-ink-soft hover:text-accent transition-colors">{lead.phone}</a>
                    <span>{new Date(lead.created_at).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' })}</span>
                  </div>
                  {lead.message && (
                    <p className="mt-2.5 text-sm text-ink-soft whitespace-pre-wrap">{lead.message}</p>
                  )}
                </div>
                <div className="shrink-0">
                  <StatusControl id={lead.id} current={lead.status} />
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 2: Verificar TypeScript**

```bash
cd "/Users/juanmiguel/Claude/Web AMD Codex/web-amd" && npx tsc --noEmit 2>&1 | grep "admin/leads/page" | head -10
```
Expected: sin errores. Si `SearchFilters` requiere un `placeholder` no vacío o algún prop, ajustar según su firma (revisar `src/components/admin/SearchFilters.tsx`).

- [ ] **Step 3: Commit**

```bash
git add src/app/admin/leads/page.tsx
git commit -m "feat(leads): pantalla admin de gestión de leads"
```

---

### Task 7: Entrada en el Sidebar

**Files:**
- Modify: `src/components/admin/Sidebar.tsx`

- [ ] **Step 1: Añadir `Inbox` al import de lucide-react (líneas 6-10)**

Reemplazar el bloque de import de iconos:
```ts
import {
  LayoutDashboard, Users, Printer, FileText,
  AlertCircle, UserCog, LogOut, BarChart2, Wrench, CalendarDays,
  ChevronLeft, ChevronRight, Plug,
} from 'lucide-react'
```
por:
```ts
import {
  LayoutDashboard, Users, Printer, FileText,
  AlertCircle, UserCog, LogOut, BarChart2, Wrench, CalendarDays,
  ChevronLeft, ChevronRight, Plug, Inbox,
} from 'lucide-react'
```

- [ ] **Step 2: Añadir el item "Leads" en el grupo Pilotage**

Localizar el array `items` del grupo `'Pilotage'` y añadir la entrada de Leads tras Clients:
```ts
      { href: '/admin',            label: 'Tableau de bord', icon: LayoutDashboard, exact: true },
      { href: '/admin/clients',    label: 'Clients',         icon: Users },
      { href: '/admin/leads',      label: 'Leads',           icon: Inbox },
      { href: '/admin/machines',   label: 'Machines',        icon: Printer },
      { href: '/admin/contadores', label: 'Compteurs',       icon: BarChart2 },
      { href: '/admin/contracts',  label: 'Contrats',        icon: FileText },
```

- [ ] **Step 3: Verificar TypeScript**

```bash
cd "/Users/juanmiguel/Claude/Web AMD Codex/web-amd" && npx tsc --noEmit 2>&1 | grep "Sidebar" | head -5
```
Expected: sin errores.

- [ ] **Step 4: Commit**

```bash
git add src/components/admin/Sidebar.tsx
git commit -m "feat(leads): entrada Leads en el sidebar admin"
```

---

### Task 8: Build completo, PR

**Files:** N/A

- [ ] **Step 1: Build**

```bash
cd "/Users/juanmiguel/Claude/Web AMD Codex/web-amd" && npx tsc --noEmit 2>&1 | head -20 && echo "EXIT: $?"
```
Expected: 0 errores, EXIT 0.

- [ ] **Step 2: Push + PR**

```bash
cd "/Users/juanmiguel/Claude/Web AMD Codex/web-amd"
git push origin feat/formulario-contacto
gh pr create \
  --title "feat: formulario de contacto funcional (persistir lead + notificar + admin)" \
  --body "$(cat <<'EOF'
## Qué hace
Repara el hallazgo crítico #5 de la auditoría: el formulario público validaba y devolvía éxito pero NO guardaba el lead ni notificaba. Ahora:

### BD
- Tabla `leads` (name, email, company, phone, needs, message, status, created_at) + RLS admin.

### API route /api/contact
- Persiste el lead con `createAdminClient()` — **crítico**: si falla, devuelve 500 (sin falso éxito).
- Notifica al equipo comercial vía `sendEmail` template `raw` — **best-effort**: si falla, el lead ya está guardado y la request devuelve éxito (warning en logs). Sin tocar la Edge Function send-email.
- Email del lead con escape HTML (input público no confiable).
- CSRF, rate limit y validación intactos.

### Admin
- Pantalla `/admin/leads`: lista, filtro por estado, cambio de estado (nouveau/traité/archivé).
- Entrada "Leads" en el sidebar (grupo Pilotage).

## Configuración requerida post-merge
- Variable de entorno **`COMMERCIAL_EMAIL`** en Vercel (Production) con el email comercial real. Sin ella, los leads se guardan pero no se notifica por email.

## Decisiones
- Solo notificación interna (sin confirmación al cliente, sin Matrix).
- El lead se persiste SIEMPRE; el email es secundario.
EOF
)"
```

- [ ] **Step 3: Merge**

```bash
cd "/Users/juanmiguel/Claude/Web AMD Codex/web-amd" && gh pr merge --merge --delete-branch
git checkout main && git pull
git log -1 --oneline
```

---

## Checklist de aceptación

- [ ] Enviar el formulario con datos válidos → lead en la tabla con status `nouveau`
- [ ] Inserción falla → request 500, sin falso éxito
- [ ] Con COMMERCIAL_EMAIL → email al equipo con los datos del lead (HTML escapado)
- [ ] Sin COMMERCIAL_EMAIL → lead guardado igual, warning en logs, request OK
- [ ] CSRF / rate limit / validación siguen funcionando
- [ ] /admin/leads lista, filtra por estado y cambia estado
- [ ] "Leads" en el sidebar admin
- [ ] Build TypeScript limpio
