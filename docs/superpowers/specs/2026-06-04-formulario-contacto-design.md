# Formulario de Contacto Funcional — Diseño

**Fecha:** 2026-06-04
**Proyecto:** AMD Service SAV
**Rama:** `feat/formulario-contacto`
**Independiente del refactor de contratos** (hallazgo crítico #5 de la auditoría).

---

## Contexto

`src/app/api/contact/route.ts` valida los datos del formulario público (CSRF, rate limit, validación de campos) y devuelve `{ success: true }`, pero los dos pasos finales son TODOs sin implementar:

```ts
// TODO: Supabase — store lead
// TODO: Mailjet — send confirmation email
```

Resultado: **todos los leads entrantes se pierden.** El cliente ve "Message reçu" pero nada se guarda ni se notifica. Es una pérdida directa de oportunidades comerciales.

Campos del formulario: `name`, `email`, `company`, `phone`, `needs` (rental/sales/management/maintenance/other), `message` (opcional).

**Estado:** no existe tabla de leads en producción (verificado).

---

## Decisiones de diseño (confirmadas)

1. **El lead se persiste SIEMPRE** — es lo crítico. Si la persistencia falla, la request devuelve error (el usuario reintenta).
2. **Notificación solo al equipo comercial** por email (sin confirmación al cliente, sin Matrix). Best-effort: si el email falla, el lead ya está guardado y la request devuelve éxito igual.
3. **Pantalla admin `/admin/leads`** para gestionar los leads (estados nouveau/traité/archivé).
4. **Email vía template `raw`** existente — NO se modifica la Edge Function `send-email`.

---

## Arquitectura

```
ContactForm (cliente) → POST /api/contact
   │  (ya tiene CSRF + rate limit + validación)
   ▼
route.ts:
   1. createAdminClient().from('leads').insert(...)   ← CRÍTICO; si falla → 500
   2. sendEmail({ template: 'raw', to: COMMERCIAL_EMAIL, ... })  ← best-effort; si falla → log, success igual
   ▼
{ success: true }

Admin: /admin/leads (lista + filtro estado + cambiar estado)
```

---

## Alcance

### Bloque A — Migración SQL: tabla `leads`

**Archivo:** `supabase/migrations/20260604150000_leads.sql`

```sql
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

No hay política de INSERT pública porque el insert se hace con `createAdminClient()` (service_role), que no está sujeto a RLS.

---

### Bloque B — API route: persistir + notificar

**Archivo:** `src/app/api/contact/route.ts`

Reemplazar los dos TODOs (líneas 43-44) por:

1. **Persistir** (crítico):
```ts
const admin = createAdminClient()
const { error: insertErr } = await admin.from('leads').insert({
  name, email, company, phone, needs, message: message || null,
})
if (insertErr) {
  console.error('[contact.insert]', insertErr)
  return NextResponse.json({ success: false, message: 'Une erreur est survenue. Veuillez réessayer.' }, { status: 500 })
}
```

2. **Notificar** (best-effort):
```ts
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
  console.warn('[contact.notify] COMMERCIAL_EMAIL no configurada — lead guardado sin notificación')
}
```

El `buildLeadEmailHtml(...)` y `NEEDS_LABELS` van en un helper `src/lib/lead-email.ts` (función pura que devuelve el HTML con el estilo corporativo rojo, coherente con los templates existentes).

`sendEmail` ya existe (`src/lib/email.ts`) y soporta el template `raw` (verificado en `send-email/index.ts`: `raw` requiere `data.subject` y `data.html`).

---

### Bloque C — Helper de email del lead

**Archivo:** `src/lib/lead-email.ts` (nuevo)

```ts
export const NEEDS_LABELS: Record<string, string> = {
  rental:      'Location',
  sales:       'Vente',
  management:  'Gestion de parc',
  maintenance: 'Maintenance',
  other:       'Autre',
}

export function buildLeadEmailHtml(lead: {
  name: string; email: string; company: string; phone: string; needsLabel: string; message: string
}): string {
  // HTML con header rojo AMD + tabla de datos del lead (mismo estilo que los templates de send-email)
}
```

---

### Bloque D — Pantalla admin `/admin/leads`

**Archivos:**
- `src/app/admin/leads/page.tsx` (nuevo) — lista con filtro por estado
- `src/app/admin/leads/actions.ts` (nuevo) — `updateLeadStatusAction(id, status)`
- `src/app/admin/leads/status-control.tsx` (nuevo) — client component para cambiar estado
- `src/components/admin/Sidebar.tsx` — añadir entrada "Leads"

**Lista (`page.tsx`):**
- SELECT de `leads` ordenado por `created_at DESC`, límite holgado.
- Filtro por estado vía `SearchFilters` (nouveau/traité/archivé), patrón idéntico a `/admin/maintenance`.
- Por cada lead: empresa, nombre, email (mailto), teléfono (tel), tipo de necesidad (badge), mensaje, fecha, y el control de estado.
- KPI opcional: conteo de leads `nouveau`.

**Acción (`actions.ts`):**
```ts
'use server'
export async function updateLeadStatusAction(id: string, status: string): Promise<{ error?: string }> {
  const { supabase } = await requireAdmin()
  if (!['nouveau','traité','archivé'].includes(status)) return { error: 'Statut invalide.' }
  const { error } = await supabase.from('leads').update({ status }).eq('id', id)
  if (error) return { error: 'Erreur lors de la mise à jour.' }
  revalidatePath('/admin/leads')
  return {}
}
```

**Control de estado (`status-control.tsx`):** client component con un `<select>` o botones que invoca `updateLeadStatusAction`. Sigue el patrón de los otros controles admin.

**Sidebar:** añadir en el grupo "Pilotage" (junto a Clients, ya que un lead es un cliente potencial):
```ts
{ href: '/admin/leads', label: 'Leads', icon: Inbox },
```
(importar `Inbox` de lucide-react).

---

## Lo que NO entra

- Email de confirmación al cliente (decidido: solo notificación interna).
- Alerta Matrix (decidido: solo email).
- Asignación de leads a comerciales concretos (YAGNI; la tabla queda lista para añadirlo).
- Conversión lead → cliente/contrato (futuro).

---

## Configuración requerida (manual, post-merge)

- **Variable de entorno `COMMERCIAL_EMAIL`** en Vercel (Production) con el email comercial real de AMD. Sin ella, los leads se guardan pero no se notifica por email (se loguea un warning). El CLAUDE.md marca el email comercial como "para completar" — el usuario debe definirlo.

---

## Criterios de aceptación

- [ ] Enviar el formulario con datos válidos → el lead aparece en la tabla `leads` con status `nouveau`
- [ ] Si la inserción falla → la request devuelve 500 y el formulario muestra error (no falso éxito)
- [ ] Con `COMMERCIAL_EMAIL` configurada → llega un email al equipo con los datos del lead
- [ ] Sin `COMMERCIAL_EMAIL` → el lead se guarda igual, sin romper la request (warning en logs)
- [ ] CSRF, rate limit y validación siguen funcionando (no se tocan)
- [ ] `/admin/leads` lista los leads, filtra por estado y permite cambiar estado
- [ ] "Leads" aparece en el Sidebar admin
- [ ] Build TypeScript limpio

---

## Archivos afectados

**Migración:**
- `supabase/migrations/20260604150000_leads.sql` (nuevo)

**App:**
- `src/app/api/contact/route.ts`
- `src/lib/lead-email.ts` (nuevo)
- `src/app/admin/leads/page.tsx` (nuevo)
- `src/app/admin/leads/actions.ts` (nuevo)
- `src/app/admin/leads/status-control.tsx` (nuevo)
- `src/components/admin/Sidebar.tsx`
