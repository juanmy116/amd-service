# Encuesta CSAT para las averías del QR + pantalla de opiniones — Plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Que quien abre una avería escaneando el QR reciba la encuesta de satisfacción cuando el técnico termina, y que AMD pueda leer las opiniones en pantalla.

**Architecture:** El destinatario de la encuesta se resuelve con una cascada pura y testeable (`contact_email` del formulario público → cuenta del portal → nadie), que sustituye al corte actual por `contract_machine_id` (hoy descarta justo las incidencias del QR). El envío queda trazado en `csat_responses` (`sent_to`, `sent_at`) y la lectura se apoya en una vista `v_csat_feedback` con `security_invoker`, siguiendo el patrón de vistas del repo.

**Tech Stack:** Next.js 16 (App Router, Server Actions), Supabase (Postgres + RLS + Edge Functions Deno), vitest, Tailwind, lucide-react.

**Spec:** `docs/superpowers/specs/2026-09-17-csat-qr-et-avis-clients-design.md`
**Rama:** `feat/csat-qr-avis` (ya creada, con el spec commiteado)

---

## Estructura de archivos

| Archivo | Responsabilidad |
|---|---|
| `supabase/migrations/20260917100000_csat_feedback.sql` | **Crear.** Columnas `sent_to`/`sent_at` + vista `v_csat_feedback` |
| `src/lib/csat.ts` | **Modificar.** Añade `resolveCsatRecipient` (pura) y reescribe `sendCsatForIncident` |
| `src/lib/csat.test.ts` | **Crear.** Tests de la cascada de destinatario |
| `src/lib/publicIncident.ts` | **Crear.** `validateContactEmail` — validación pura reutilizable |
| `src/lib/publicIncident.test.ts` | **Crear.** Tests de la validación |
| `src/app/signaler/[serie]/form.tsx` | **Modificar.** Email obligatorio en el formulario |
| `src/app/signaler/[serie]/actions.ts` | **Modificar.** Validación de servidor con la función pura |
| `supabase/functions/send-email/index.ts` | **Modificar.** Plantilla `csat` con nombre, referencia y equipo |
| `src/app/admin/avis/page.tsx` | **Crear.** Listado de opiniones |
| `src/components/admin/Sidebar.tsx` | **Modificar.** Entrada «Avis clients» en el grupo Service |
| `src/app/admin/incidents/[id]/page.tsx` | **Modificar.** Bloque «Avis du client» |
| `src/app/admin/page.tsx` | **Modificar.** Franja de avisos negativos |
| `src/lib/supabase/types.ts` | **Regenerar** tras la migración |

---

### Task 1: Migración — trazabilidad del envío y vista de lectura

**Files:**
- Create: `supabase/migrations/20260917100000_csat_feedback.sql`
- Modify: `src/lib/supabase/types.ts` (regenerado, no editado a mano)

- [ ] **Step 1: Escribir la migración**

```sql
-- Encuesta CSAT: trazabilidad del envío + vista de lectura para /admin/avis.
--
-- Contexto: hasta hoy no se sabía si una encuesta se había enviado ni a quién. Cuando el envío
-- no era posible (sin email de contacto y sin cuenta de portal), la función se callaba.

alter table public.csat_responses
  add column if not exists sent_to text,
  add column if not exists sent_at timestamptz;

comment on column public.csat_responses.sent_to is
  'Dirección a la que se envió la encuesta: contact_email del formulario QR, o email de la cuenta del portal.';
comment on column public.csat_responses.sent_at is
  'Momento del envío. NULL = nunca se llegó a enviar.';

-- Vista de lectura de /admin/avis: una fila por opinión RESPONDIDA, con todo lo que la
-- pantalla necesita ya resuelto (quién, qué avería, qué equipo).
-- security_invoker = true → hereda la RLS de las tablas base; csat_responses es admin-only
-- (policy admin_read_csat), así que la vista solo devuelve filas al admin.
create or replace view public.v_csat_feedback
with (security_invoker = true) as
select
  c.id,
  c.incident_id,
  c.rating,
  c.comment,
  c.responded_at,
  c.sent_to,
  c.sent_at,
  i.numero_incident,
  i.title,
  i.contact_name,
  i.contact_email,
  coalesce(i.machine_id, cm.machine_id) as machine_id,
  cl.nom_client
from public.csat_responses c
join public.incidents i          on i.id  = c.incident_id
left join public.contract_machines cm on cm.id = i.contract_machine_id
left join public.contracts ct    on ct.id = cm.contract_id
left join public.clients cl      on cl.id = ct.client_id
where c.responded_at is not null;

comment on view public.v_csat_feedback is
  'Opiniones respondidas por los clientes, con la avería y el cliente resueltos. Alimenta /admin/avis.';
```

- [ ] **Step 2: Aplicar la migración en local y comprobar que la vista responde**

```bash
cd web-amd
supabase db push
```

Esperado: la migración `20260917100000_csat_feedback` aparece como aplicada, sin errores.

Comprobación:

```bash
supabase db diff --schema public
```

Esperado: sin diferencias (`No schema changes found`).

- [ ] **Step 3: Regenerar los tipos de Supabase**

```bash
npx supabase gen types typescript --project-id myyejbviunyvywfukysj > src/lib/supabase/types.ts
```

Esperado: `src/lib/supabase/types.ts` incluye `sent_to`/`sent_at` en `csat_responses` y la vista `v_csat_feedback`. Verificar:

```bash
grep -c "v_csat_feedback" src/lib/supabase/types.ts
```

Esperado: un número mayor que 0.

- [ ] **Step 4: Typecheck**

Run: `npm run typecheck`
Expected: sin errores.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/20260917100000_csat_feedback.sql src/lib/supabase/types.ts
git commit -m "feat(csat): trazabilidad del envío y vista v_csat_feedback"
```

---

### Task 2: La cascada de destinatario (lógica pura)

**Files:**
- Modify: `src/lib/csat.ts`
- Test: `src/lib/csat.test.ts` (crear)

- [ ] **Step 1: Escribir el test que falla**

Crear `src/lib/csat.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { resolveCsatRecipient } from './csat'

describe('resolveCsatRecipient', () => {
  it('usa el email del formulario público cuando lo hay', () => {
    expect(resolveCsatRecipient('client@2as.sn', null)).toEqual({
      email: 'client@2as.sn',
      source: 'contact',
    })
  })

  it('cae a la cuenta del portal cuando no hay email de contacto', () => {
    expect(resolveCsatRecipient(null, 'portal@2as.sn')).toEqual({
      email: 'portal@2as.sn',
      source: 'portal',
    })
  })

  it('el email del formulario gana al del portal: es quien vivió la intervención', () => {
    expect(resolveCsatRecipient('client@2as.sn', 'portal@2as.sn')).toEqual({
      email: 'client@2as.sn',
      source: 'contact',
    })
  })

  it('devuelve null cuando no hay ninguno', () => {
    expect(resolveCsatRecipient(null, null)).toBeNull()
    expect(resolveCsatRecipient(undefined, undefined)).toBeNull()
  })

  it('ignora cadenas vacías o de solo espacios', () => {
    expect(resolveCsatRecipient('   ', 'portal@2as.sn')).toEqual({
      email: 'portal@2as.sn',
      source: 'portal',
    })
    expect(resolveCsatRecipient('', '')).toBeNull()
  })

  it('recorta los espacios del email elegido', () => {
    expect(resolveCsatRecipient('  client@2as.sn  ', null)).toEqual({
      email: 'client@2as.sn',
      source: 'contact',
    })
  })
})
```

- [ ] **Step 2: Ejecutar el test y verificar que falla**

Run: `npx vitest run src/lib/csat.test.ts`
Expected: FAIL — `resolveCsatRecipient is not a function` / no exportada.

- [ ] **Step 3: Implementar la función**

Añadir al principio de `src/lib/csat.ts`, después de los imports:

```ts
export type CsatRecipient = { email: string; source: 'contact' | 'portal' } | null

/**
 * Elige a quién se le envía la encuesta.
 *
 * El email del formulario público va PRIMERO a propósito: es quien reportó la avería y quien
 * vivió la intervención. La cuenta del portal queda como respaldo para las incidencias internas.
 */
export function resolveCsatRecipient(
  contactEmail: string | null | undefined,
  portalEmail: string | null | undefined,
): CsatRecipient {
  const contact = contactEmail?.trim()
  if (contact) return { email: contact, source: 'contact' }

  const portal = portalEmail?.trim()
  if (portal) return { email: portal, source: 'portal' }

  return null
}
```

- [ ] **Step 4: Ejecutar el test y verificar que pasa**

Run: `npx vitest run src/lib/csat.test.ts`
Expected: PASS — 6 tests.

- [ ] **Step 5: Commit**

```bash
git add src/lib/csat.ts src/lib/csat.test.ts
git commit -m "feat(csat): cascada de destinatario contact_email → portal"
```

---

### Task 3: Envío real — usar la cascada, trazar y no callarse

**Files:**
- Modify: `src/lib/csat.ts` (función `sendCsatForIncident`, reescritura completa)

- [ ] **Step 1: Reescribir `sendCsatForIncident`**

Sustituir la función entera (desde `export async function sendCsatForIncident` hasta el final del archivo) por:

```ts
/** Email de la cuenta de portal del cliente dueño de la línea de contrato, si existe. */
async function portalEmailForLine(
  admin: ReturnType<typeof createAdminClient>,
  contractMachineId: string | null,
): Promise<string | null> {
  if (!contractMachineId) return null

  const { data: line } = await admin
    .from('contract_machines')
    .select('contracts(client_id)')
    .eq('id', contractMachineId)
    .single()

  const clientId = line?.contracts?.client_id ?? null
  if (!clientId) return null

  const { data: cp } = await admin
    .from('client_profiles')
    .select('profile_id')
    .eq('client_id', clientId)
    .maybeSingle()

  if (!cp?.profile_id) return null

  const { data: { user } } = await admin.auth.admin.getUserById(cp.profile_id)
  return user?.email ?? null
}

/** Etiqueta legible del equipo: «Ricoh MP-C3004 · V9314505033». Null si no se puede resolver. */
async function machineLabel(
  admin: ReturnType<typeof createAdminClient>,
  incidentMachineId: string | null,
  contractMachineId: string | null,
): Promise<string | null> {
  let serie = incidentMachineId

  if (!serie && contractMachineId) {
    const { data: line } = await admin
      .from('contract_machines')
      .select('machine_id')
      .eq('id', contractMachineId)
      .single()
    serie = line?.machine_id ?? null
  }

  if (!serie) return null

  const { data: machine } = await admin
    .from('machines')
    .select('marque, modele')
    .eq('numero_serie', serie)
    .maybeSingle()

  if (!machine) return serie
  return `${machine.marque} ${machine.modele} · ${serie}`
}

export async function sendCsatForIncident(incidentId: string): Promise<void> {
  const admin = createAdminClient()

  const { data: existing } = await admin
    .from('csat_responses')
    .select('token, responded_at')
    .eq('incident_id', incidentId)
    .maybeSingle()

  if (existing?.responded_at) return

  const { data: incident } = await admin
    .from('incidents')
    .select('id, title, numero_incident, contact_name, contact_email, machine_id, contract_machine_id')
    .eq('id', incidentId)
    .single()

  if (!incident) return

  // Antes había aquí un corte por `contract_machine_id` que descartaba TODAS las incidencias
  // del QR público (van por machine_id). Era la razón de que nunca saliera una sola encuesta.
  const portalEmail = await portalEmailForLine(admin, incident.contract_machine_id)
  const recipient = resolveCsatRecipient(incident.contact_email, portalEmail)

  if (!recipient) {
    // Sin destinatario no hay encuesta, pero que quede rastro visible en la ficha:
    // un fallo silencioso es lo que mantuvo esto roto durante meses.
    await admin.from('incident_history').insert({
      incident_id: incidentId,
      changed_by:  null,
      old_status:  null,
      new_status:  null,
      comment:     'Enquête de satisfaction non envoyée — aucune adresse email',
    })
    return
  }

  let token: string
  if (existing) {
    token = existing.token
  } else {
    const { data: csat } = await admin
      .from('csat_responses')
      .insert({ incident_id: incidentId })
      .select('token')
      .single()
    if (!csat?.token) return
    token = csat.token
  }

  const appUrl  = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000'
  const csatUrl = `${appUrl}/csat/${token}`
  const equipement = await machineLabel(admin, incident.machine_id, incident.contract_machine_id)

  await sendEmail({
    template: 'csat',
    to: recipient.email,
    data: {
      title:       incident.title,
      csat_url:    csatUrl,
      reference:   incident.numero_incident ?? '',
      client_name: incident.contact_name ?? '',
      equipement:  equipement ?? '',
    },
  })

  await admin
    .from('csat_responses')
    .update({ sent_to: recipient.email, sent_at: new Date().toISOString() })
    .eq('incident_id', incidentId)

  const { data: closed } = await admin
    .from('incidents')
    .update({ status: 'fermé', closed_at: new Date().toISOString() })
    .eq('id', incidentId)
    .eq('status', 'résolu')
    .select('id')

  if (closed && closed.length > 0) {
    await admin.from('incident_history').insert({
      incident_id: incidentId,
      changed_by: null,
      old_status: 'résolu',
      new_status: 'fermé',
      comment: 'Fermé automatiquement — email CSAT envoyé',
    })
  }
}
```

- [ ] **Step 2: Typecheck y tests**

Run: `npm run typecheck && npm test`
Expected: sin errores de tipos; toda la suite en verde (incluidos los 6 tests de Task 2).

- [ ] **Step 3: Commit**

```bash
git add src/lib/csat.ts
git commit -m "feat(csat): enviar la encuesta al contacto del QR y trazar el envío"
```

---

### Task 4: Email obligatorio en el formulario del QR

**Files:**
- Create: `src/lib/publicIncident.ts`
- Test: `src/lib/publicIncident.test.ts` (crear)
- Modify: `src/app/signaler/[serie]/actions.ts:80-83`
- Modify: `src/app/signaler/[serie]/form.tsx:88-105`

- [ ] **Step 1: Escribir el test que falla**

Crear `src/lib/publicIncident.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { validateContactEmail } from './publicIncident'

describe('validateContactEmail', () => {
  it('acepta un email normal', () => {
    expect(validateContactEmail('fatou@2as.sn')).toBeNull()
  })

  it('exige el email: sin él no se puede enviar la encuesta', () => {
    expect(validateContactEmail('')).toBe("L'adresse email est obligatoire.")
    expect(validateContactEmail('   ')).toBe("L'adresse email est obligatoire.")
  })

  it('rechaza un email mal formado', () => {
    expect(validateContactEmail('fatou')).toBe("L'adresse email n'est pas valide.")
    expect(validateContactEmail('fatou@')).toBe("L'adresse email n'est pas valide.")
    expect(validateContactEmail('fatou@2as')).toBe("L'adresse email n'est pas valide.")
    expect(validateContactEmail('a b@2as.sn')).toBe("L'adresse email n'est pas valide.")
  })
})
```

- [ ] **Step 2: Ejecutar el test y verificar que falla**

Run: `npx vitest run src/lib/publicIncident.test.ts`
Expected: FAIL — no existe `./publicIncident`.

- [ ] **Step 3: Implementar la validación**

Crear `src/lib/publicIncident.ts`:

```ts
/**
 * Validación del email del formulario público del QR.
 *
 * El email es OBLIGATORIO desde 2026-09-17: es el único destinatario posible de la encuesta de
 * satisfacción para una avería abierta por QR (esas incidencias no tienen cuenta de portal
 * detrás). Decisión y riesgo asumido en
 * `docs/superpowers/specs/2026-09-17-csat-qr-et-avis-clients-design.md`.
 *
 * Devuelve el mensaje de error en francés, o null si el email es válido.
 */
export function validateContactEmail(email: string): string | null {
  const value = email.trim()
  if (!value) return "L'adresse email est obligatoire."
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) return "L'adresse email n'est pas valide."
  return null
}
```

- [ ] **Step 4: Ejecutar el test y verificar que pasa**

Run: `npx vitest run src/lib/publicIncident.test.ts`
Expected: PASS — 3 tests.

- [ ] **Step 5: Usar la validación en la Server Action**

En `src/app/signaler/[serie]/actions.ts`, añadir el import junto a los existentes:

```ts
import { validateContactEmail } from '@/lib/publicIncident'
```

Sustituir este bloque:

```ts
  if (contactEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(contactEmail)) {
    return { error: "L'adresse email n'est pas valide." }
  }
```

por:

```ts
  const emailError = validateContactEmail(contactEmail)
  if (emailError) return { error: emailError }
```

Y en el `insert`, cambiar `contact_email: contactEmail || null,` por:

```ts
      contact_email: contactEmail,
```

- [ ] **Step 6: Marcar el campo como obligatorio en el formulario**

En `src/app/signaler/[serie]/form.tsx`, sustituir la etiqueta y el input del email por:

```tsx
          <label htmlFor="contact_email" className="block text-sm font-medium text-gray-700 mb-1">
            Email <span style={{ color: '#BF0D0D' }}>*</span>
          </label>
          <input
            id="contact_email"
            type="email"
            name="contact_email"
            required
            maxLength={100}
            autoComplete="email"
            placeholder="votre@email.com"
            className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg outline-none"
            onFocus={(e) => (e.currentTarget.style.boxShadow = '0 0 0 2px #BF0D0D40')}
            onBlur={(e) => (e.currentTarget.style.boxShadow = '')}
          />
```

- [ ] **Step 7: Typecheck y tests**

Run: `npm run typecheck && npm test`
Expected: todo en verde.

- [ ] **Step 8: Commit**

```bash
git add src/lib/publicIncident.ts src/lib/publicIncident.test.ts "src/app/signaler/[serie]/actions.ts" "src/app/signaler/[serie]/form.tsx"
git commit -m "feat(signaler): el email pasa a ser obligatorio en el formulario del QR"
```

---

### Task 5: La plantilla del email

**Files:**
- Modify: `supabase/functions/send-email/index.ts` (case `'csat'`)

- [ ] **Step 1: Reescribir la plantilla**

Sustituir el `case 'csat':` completo por:

```ts
    case 'csat': {
      const reference  = data.reference ?? ''
      const greeting   = data.client_name ? `<p>Bonjour ${data.client_name},</p>` : ''
      const rows = [
        reference ? ['Référence', reference] : null,
        data.equipement ? ['Équipement', data.equipement] : null,
      ].filter((r): r is string[] => r !== null)

      const details = rows.length
        ? `<table style="margin:20px 0;font-size:14px">${rows
            .map(([k, v]) =>
              `<tr><td style="color:#6b7280;padding:2px 16px 2px 0">${k}</td>` +
              `<td style="color:#111;font-weight:600">${v}</td></tr>`)
            .join('')}</table>`
        : ''

      return {
        subject: reference
          ? `Votre avis sur notre intervention — ${reference}`
          : `Votre avis sur notre intervention`,
        html: `
          <div style="font-family:Inter,sans-serif;max-width:560px;margin:0 auto;color:#111">
            <div style="background:#BF0D0D;padding:24px 32px;border-radius:12px 12px 0 0">
              <p style="color:white;font-weight:700;font-size:18px;margin:0">AMD Service</p>
            </div>
            <div style="padding:32px;border:1px solid #e5e7eb;border-top:none;border-radius:0 0 12px 12px">
              ${greeting}
              <p>Votre demande a été résolue.</p>
              ${details}
              <h2 style="margin-top:0">Comment s'est passée notre intervention ?</h2>
              <p>Prenez 30 secondes pour évaluer notre service :</p>
              <div style="text-align:center;margin:32px 0">
                <a href="${data.csat_url}" style="background:#BF0D0D;color:white;padding:14px 28px;border-radius:8px;text-decoration:none;font-weight:700;font-size:15px">
                  Donner mon avis
                </a>
              </div>
              <p style="font-size:12px;color:#9ca3af">Ce lien est valable 7 jours.</p>
            </div>
          </div>
        `
      }
    }
```

> El título interno de la incidencia (`Incident QR — Ricoh MP-C3004 (V9314505033)`) deja de salir
> en el correo: es jerga nuestra. `data.title` sigue llegando pero ya no se imprime.

- [ ] **Step 2: Desplegar la Edge Function**

```bash
cd web-amd
supabase functions deploy send-email
```

Expected: `Deployed Function send-email`. **Este paso no lo hace el despliegue de Vercel**: la función vive en Supabase.

- [ ] **Step 3: Commit**

```bash
git add supabase/functions/send-email/index.ts
git commit -m "feat(email): plantilla CSAT con nombre, referencia y equipo"
```

---

### Task 6: Página `/admin/avis`

**Files:**
- Create: `src/app/admin/avis/page.tsx`
- Modify: `src/components/admin/Sidebar.tsx`

- [ ] **Step 1: Crear la página**

Crear `src/app/admin/avis/page.tsx`:

```tsx
import { createClient } from '@/lib/supabase/server'
import Link from 'next/link'
import { Star, MessageSquare } from 'lucide-react'
import { Card } from '@/components/ui/Card'
import { PanelHeader } from '@/components/ui/PanelHeader'

type Feedback = {
  id: string
  incident_id: string
  rating: number | null
  comment: string | null
  responded_at: string | null
  numero_incident: string | null
  contact_name: string | null
  contact_email: string | null
  machine_id: string | null
  nom_client: string | null
}

function Stars({ rating }: { rating: number }) {
  return (
    <span className="inline-flex gap-0.5" aria-label={`${rating} sur 5`}>
      {[1, 2, 3, 4, 5].map((n) => (
        <Star
          key={n}
          size={14}
          className={n <= rating ? 'text-amber-400' : 'text-line'}
          fill={n <= rating ? 'currentColor' : 'none'}
        />
      ))}
    </span>
  )
}

function timeAgo(iso: string): string {
  const days = Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000)
  if (days === 0) return "aujourd'hui"
  if (days === 1) return 'hier'
  if (days < 31) return `il y a ${days} jours`
  const months = Math.floor(days / 30)
  return `il y a ${months} mois`
}

export default async function AvisPage({
  searchParams,
}: {
  searchParams: Promise<{ negatifs?: string }>
}) {
  const { negatifs } = await searchParams
  const onlyNegative = negatifs === '1'

  const supabase = await createClient()
  let query = supabase
    .from('v_csat_feedback')
    .select('id, incident_id, rating, comment, responded_at, numero_incident, contact_name, contact_email, machine_id, nom_client')
    .order('responded_at', { ascending: false })

  if (onlyNegative) query = query.lte('rating', 2)

  const { data } = await query
  const avis = (data ?? []) as Feedback[]
  const average = avis.length
    ? (avis.reduce((s, a) => s + (a.rating ?? 0), 0) / avis.length).toFixed(1)
    : null

  return (
    <div className="p-8 space-y-6">

      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-accent/10 flex items-center justify-center">
            <MessageSquare size={18} className="text-accent" />
          </div>
          <div>
            <h1 className="text-xl font-semibold font-display text-ink">Avis clients</h1>
            <p className="text-sm text-ink-muted">
              Réponses aux enquêtes de satisfaction envoyées après chaque intervention
            </p>
          </div>
        </div>
        <div className="flex gap-2">
          <Link
            href="/admin/avis"
            className={`px-3 py-1.5 rounded-lg text-sm border transition-colors ${
              onlyNegative ? 'border-line text-ink-soft hover:bg-neutral-soft' : 'border-accent text-accent bg-accent/5'
            }`}
          >
            Tous
          </Link>
          <Link
            href="/admin/avis?negatifs=1"
            className={`px-3 py-1.5 rounded-lg text-sm border transition-colors ${
              onlyNegative ? 'border-accent text-accent bg-accent/5' : 'border-line text-ink-soft hover:bg-neutral-soft'
            }`}
          >
            ★ ≤ 2
          </Link>
        </div>
      </div>

      {average && (
        <Card className="px-4 py-3 inline-flex items-center gap-2.5">
          <span className="text-sm font-semibold text-ink">{average} / 5</span>
          <span className="text-xs text-ink-muted">
            {avis.length} avis{onlyNegative ? ' négatifs' : ''}
          </span>
        </Card>
      )}

      <Card className="overflow-hidden">
        <PanelHeader title={onlyNegative ? 'Avis négatifs' : 'Tous les avis'} />
        <ul className="divide-y divide-line-subtle">
          {avis.length === 0 && (
            <li className="px-5 py-12 text-center text-ink-muted text-sm">
              Aucun avis pour le moment. Les enquêtes partent quand une intervention passe en « résolu ».
            </li>
          )}
          {avis.map((a) => (
            <li key={a.id} className="px-5 py-4 hover:bg-neutral-soft transition-colors">
              <div className="flex items-center gap-3 flex-wrap">
                {a.rating != null && <Stars rating={a.rating} />}
                <Link
                  href={`/admin/incidents/${a.incident_id}`}
                  className="font-mono text-xs text-accent hover:underline"
                >
                  {a.numero_incident ?? '—'}
                </Link>
                <span className="text-sm text-ink-soft">
                  {a.nom_client ?? a.contact_name ?? '—'}
                </span>
                {a.machine_id && (
                  <span className="font-mono text-xs text-ink-muted">{a.machine_id}</span>
                )}
                <span className="text-xs text-ink-muted ml-auto">
                  {a.responded_at ? timeAgo(a.responded_at) : ''}
                </span>
              </div>
              {a.comment && (
                <p className="text-sm text-ink mt-2 whitespace-pre-wrap">« {a.comment} »</p>
              )}
              {(a.contact_name || a.contact_email) && (
                <p className="text-xs text-ink-muted mt-1.5">
                  {a.contact_name}
                  {a.contact_email && ` · ${a.contact_email}`}
                </p>
              )}
            </li>
          ))}
        </ul>
      </Card>
    </div>
  )
}
```

- [ ] **Step 2: Añadir la entrada en la sidebar**

En `src/components/admin/Sidebar.tsx`, en el grupo `Service`, después de la línea de `Anomalies`:

```ts
      { href: '/admin/avis',        label: 'Avis clients',  icon: MessageSquare },
```

Y añadir `MessageSquare` al import de `lucide-react` de ese archivo.

- [ ] **Step 3: Typecheck y build**

Run: `npm run typecheck && npm run build`
Expected: sin errores.

- [ ] **Step 4: Commit**

```bash
git add src/app/admin/avis/page.tsx src/components/admin/Sidebar.tsx
git commit -m "feat(admin): pantalla de opiniones de clientes"
```

---

### Task 7: La nota en la ficha de la avería

**Files:**
- Modify: `src/app/admin/incidents/[id]/page.tsx`

- [ ] **Step 1: Consultar la opinión**

Junto a la consulta del historial (`const { data: history } = await supabase...`), añadir:

```ts
  const { data: avis } = await supabase
    .from('csat_responses')
    .select('rating, comment, responded_at')
    .eq('incident_id', incident.id)
    .maybeSingle()
```

- [ ] **Step 2: Pintar el bloque**

Justo después del bloque `{/* Contact public ... */}` (cierre de su `)}`), añadir:

```tsx
      {/* Avis du client (enquête de satisfaction) */}
      {avis?.responded_at && avis.rating != null && (
        <div className="px-8 pb-4 max-w-3xl">
          <Card className="p-6">
            <h2 className="text-sm font-semibold text-ink mb-4">Avis du client</h2>
            <div className="flex items-center gap-2">
              <span className="inline-flex gap-0.5">
                {[1, 2, 3, 4, 5].map((n) => (
                  <Star
                    key={n}
                    size={16}
                    className={n <= avis.rating! ? 'text-amber-400' : 'text-line'}
                    fill={n <= avis.rating! ? 'currentColor' : 'none'}
                  />
                ))}
              </span>
              <span className="text-sm text-ink-muted">{avis.rating} / 5</span>
            </div>
            {avis.comment && (
              <p className="text-sm text-ink-soft mt-3 whitespace-pre-wrap">« {avis.comment} »</p>
            )}
          </Card>
        </div>
      )}
```

Añadir `Star` al import de `lucide-react` de ese archivo.

- [ ] **Step 3: Typecheck**

Run: `npm run typecheck`
Expected: sin errores.

- [ ] **Step 4: Commit**

```bash
git add "src/app/admin/incidents/[id]/page.tsx"
git commit -m "feat(admin): la nota del cliente en la ficha de la avería"
```

---

### Task 8: Franja de avisos negativos en el dashboard

**Files:**
- Modify: `src/app/admin/page.tsx`

- [ ] **Step 1: Consultar las opiniones negativas recientes**

En el bloque de consultas en paralelo (donde está `supabase.from('machine_anomalies')...`), añadir una entrada más:

```ts
    supabase
      .from('csat_responses')
      .select('id')
      .lte('rating', 2)
      .gte('responded_at', new Date(Date.now() - 7 * 86_400_000).toISOString()),
```

y recoger su resultado con el mismo patrón que `anomaliesRes` (añadir `negativeCsatRes` a la desestructuración, en la misma posición que la consulta).

Después, junto a `const openAnomalies = ...`:

```ts
  const negativeCsat = (negativeCsatRes.data ?? []).length
```

y añadir `negativeCsat` al objeto que devuelve la función de datos, junto a `csatCount`.

- [ ] **Step 2: Pintar la franja**

Justo encima del bloque `{data.openAnomalies > 0 && (` en el JSX:

```tsx
      {data.negativeCsat > 0 && (
        <Link
          href="/admin/avis?negatifs=1"
          className="flex items-center gap-3 px-4 py-3 rounded-xl border border-danger/30 bg-danger-soft text-sm hover:bg-danger-soft/70 transition-colors"
        >
          <MessageSquare size={16} className="text-danger shrink-0" />
          <span className="text-ink font-medium">
            {data.negativeCsat} avis négatif{data.negativeCsat > 1 ? 's' : ''} cette semaine
          </span>
          <ChevronRight size={15} className="text-ink-muted ml-auto" />
        </Link>
      )}
```

Añadir `MessageSquare` al import de `lucide-react` de ese archivo.

> No se crea ningún estado «visto»: la franja desaparece sola cuando esas opiniones cumplen 7 días.
> Misma decisión que en el kiosko del taller (PR #137) — un botón de «ya lo he visto» se acaba
> pulsando sin mirar.

- [ ] **Step 3: Comprobar que las clases `danger-soft` existen**

Run: `grep -rn "danger-soft" src/app/globals.css src/components | head -3`
Expected: al menos una coincidencia. Si no existe, usar `border-accent/30 bg-accent/5` y `text-accent` en su lugar.

- [ ] **Step 4: Typecheck y build**

Run: `npm run typecheck && npm run build`
Expected: sin errores.

- [ ] **Step 5: Commit**

```bash
git add src/app/admin/page.tsx
git commit -m "feat(admin): franja de avisos negativos en el tablero"
```

---

### Task 9: Verificación completa

**Files:** ninguno (solo comprobaciones)

- [ ] **Step 1: Suite completa**

Run: `npm run typecheck && npm test && npm run build`
Expected: todo en verde.

- [ ] **Step 2: Tests de aislamiento RLS**

Run: `npm run test:rls`
Expected: en verde. `tests/rls/admin-only-isolation.test.ts` ya cubre `csat_responses`; las columnas nuevas no cambian sus policies. Si el entorno local de Supabase no está levantado: `supabase start` antes.

- [ ] **Step 3: Prueba manual de la cadena completa (la única que la valida de verdad)**

En el preview de Vercel de la rama:

1. Abrir `/signaler/<una serie real>` y comprobar que **el email es obligatorio** (no deja enviar sin él).
2. Enviar una avería de prueba con un email real al que tengas acceso.
3. En `/admin/incidents`, pasar esa incidencia a **`résolu`**.
4. Comprobar que **llega el correo**, con el saludo por nombre, la referencia `SAV-…` y el equipo — y **sin** la jerga «Incident QR».
5. Pulsar «Donner mon avis», puntuar con **2 estrellas** y escribir un comentario.
6. Comprobar los tres sitios: la opinión en `/admin/avis`, la nota en la ficha de la avería, y la franja roja en `/admin`.
7. En la base: `select sent_to, sent_at from csat_responses order by created_at desc limit 1` → debe traer el email del formulario.

- [ ] **Step 4: Limpiar el dato de prueba**

```sql
-- Sustituir <id> por el de la incidencia de prueba.
delete from csat_responses where incident_id = '<id>';
delete from incident_history where incident_id = '<id>';
delete from incidents where id = '<id>';
```

- [ ] **Step 5: Actualizar la documentación**

- `docs/architecture.md`: §Tabla `csat_responses` (columnas nuevas), §7 Sistema CSAT (la cascada de destinatario y la nueva pantalla), y la vista `v_csat_feedback`.
- `docs/pendientes.md`: si queda algo abierto (p. ej. cuentas de portal), anotarlo.

- [ ] **Step 6: Abrir el PR**

```bash
git push -u origin feat/csat-qr-avis
gh pr create --title "feat(csat): encuesta para las averías del QR + pantalla de opiniones" --body "$(cat <<'BODY'
Hasta hoy **no salía una sola encuesta de satisfacción**: `sendCsatForIncident` descartaba toda
incidencia sin línea de contrato —justo las del QR público— y caía después en la cuenta del
portal, de las que no hay ninguna creada (0 de 68 clientes). Además, el comentario del cliente se
guardaba y no se mostraba en ninguna pantalla.

- **Email obligatorio** en el formulario del QR (navegador **y** servidor). Riesgo asumido y
  documentado en el spec: quien no tenga email a mano no puede avisar de la avería.
- **Destinatario en cascada** (`resolveCsatRecipient`): email del formulario → cuenta del portal →
  nadie. El del formulario va primero: es quien vivió la intervención.
- **Envío trazado**: `csat_responses.sent_to` / `sent_at`. Si no hay destinatario, queda anotado en
  el historial de la incidencia en vez de fallar en silencio.
- **Email mejorado**: saludo por su nombre, referencia `SAV-AAAA-NNNN` y equipo, sin la jerga
  interna «Incident QR».
- **Se lee el feedback**: página `/admin/avis`, nota en la ficha de la avería y franja de avisos
  negativos (★≤2, 7 días) en el tablero.

⚠️ Requiere `supabase db push` y **redesplegar la Edge Function** `send-email`.

Spec: `docs/superpowers/specs/2026-09-17-csat-qr-et-avis-clients-design.md`
Plan: `docs/superpowers/plans/2026-09-17-csat-qr-et-avis-clients.md`

🤖 Generated with [Claude Code](https://claude.com/claude-code)
BODY
)"
```

Expected: checks `typecheck · test · build` en verde antes de mergear.

---

## Fuera de alcance (no implementar en este plan)

- Recordatorio a quien no responde a la encuesta.
- Aviso por email a AMD cuando entra una opinión negativa.
- Encuesta por WhatsApp o SMS.
- Crear cuentas de portal para los 68 clientes.
- Tocar las 4 incidencias públicas que ya existen (la que no tiene email entrará por la rama «sin destinatario» y quedará anotada en su historial).
