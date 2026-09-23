# PWA técnicos — Fase 2: notificaciones push · Plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** que el técnico reciba en su iPhone un aviso al instante cuando se le **asigna** una avería o un mantenimiento, o cuando se le **retira**, y que al tocarlo se abra la tarea.

**Architecture (cola de salida):** un trigger en `incidents` y `maintenance_visits` detecta el cambio de `assigned_to` y **encola** filas en `push_notifications` (la cola ES el registro: cada aviso deja rastro con su resultado). El mismo trigger da un «toque» a la Edge Function `send-push` vía `pg_net`, con URL y secreto leídos de **Vault** (si no están —CI, local— no llama y la fila queda pendiente). La función reclama filas con `FOR UPDATE SKIP LOCKED`, arma el texto con una función pura testeada y envía Web Push (VAPID) a todas las suscripciones activas del técnico. Un cron de 1 minuto es la red de seguridad (reintenta pendientes, caduca las de > 1 h). El iPhone se suscribe desde `/tech` con un botón; el service worker (`/sw.js`, scope `/tech`) muestra el aviso y abre la URL al tocarlo.

**Por qué cola y no llamada directa (refinamiento del spec):** (1) nada se pierde si la función falla o tarda: queda `pending` y el cron reintenta; (2) todo aviso queda registrado con su estado —lección de Princity/Matrix, que fallaban en silencio—; (3) la función exige un secreto, así que no es un endpoint público que alguien pueda usar para bombardear a los técnicos; (4) en CI la BD local no llama a producción.

**Tech Stack:** Postgres (triggers, `pg_net`, `pg_cron`, Vault), Supabase Edge Functions (Deno, `npm:web-push@3.6.7`), Next.js 16 (Server Actions), Push API + Service Worker, vitest, tests RLS.

**Spec:** `docs/superpowers/specs/2026-09-22-pwa-tecnicos-design.md` §Fase 2. Decisiones del usuario: avisos solo a técnicos · eventos = asignada / mantenimiento asignado / retirada · **siempre al instante** · texto con cliente + barrio + problema · todos los técnicos con iOS ≥ 16.4.

---

## Datos verificados en el código

- `incidents.id` y `maintenance_visits.id` son `uuid`. `maintenance_visits`: `assigned_to, contract_machine_id, scheduled_date, status, plan_id`. Las visitas se generan **sin** `assigned_to` (se asignan después en el kiosko) ⇒ crear un plan no dispara 40 avisos.
- Se asigna desde 4 sitios (kiosko `src/app/atelier/actions.ts` con service_role, ficha, kanban, alta). El trigger los cubre todos; con service_role `auth.uid()` es `NULL`.
- Barrio de un aviso: `machines.quartier_code` si lo tiene, si no `clients.quartier_code` → `quartiers.label` (misma regla que el kiosko, `src/lib/quartiers.ts`).
- Cliente de una incidencia: por `contract_machine_id` → `contract_machines` → `contracts` → `clients`; incidencia pública (`machine_id` directo) → línea abierta de esa máquina → contrato → cliente (ver `getOpenLineForMachine` en `src/lib/contract-machines.ts`).
- Patrón de Edge Functions: `supabase/functions/_shared/secret-key.ts` (`getSecretKey`, `timingSafeEqual`), despliegue `--no-verify-jwt`, crons con `net.http_post` (`supabase/migrations/20260625110000_*`).
- Gotcha de tests RLS: una tabla admin-only nueva debe añadirse a `tests/rls/admin-only-isolation.test.ts` (rompió en la foto de incidencias).
- vitest solo incluye `src/**/*.test.ts` ⇒ hay que añadir `supabase/functions/_shared/**/*.test.ts` para testear el armado del texto.

## Mapa de archivos

| Archivo | Acción | Responsabilidad |
|---|---|---|
| `supabase/migrations/20260924100000_push_notifications.sql` | Crear | Tablas, RLS, trigger, RPC de reclamo, «toque», cron |
| `tests/rls/push-notifications.test.ts` | Crear | RLS de las dos tablas + comportamiento del trigger |
| `tests/rls/admin-only-isolation.test.ts` | Modificar | Añadir `push_notifications` |
| `supabase/functions/_shared/push-message.ts` + `.test.ts` | Crear | Texto, URL y etiqueta del aviso (puro) |
| `vitest.config.ts` | Modificar | Incluir `supabase/functions/_shared/**/*.test.ts` |
| `supabase/functions/send-push/index.ts` | Crear | Reclamar cola, armar contexto, enviar, registrar |
| `public/sw.js` | Modificar | `push` + `notificationclick` |
| `src/lib/pwa/push.ts` + `.test.ts` | Crear | `urlBase64ToUint8Array` y validación de la suscripción (puros) |
| `src/app/tech/push-actions.ts` | Crear | `savePushSubscription` (Server Action) |
| `src/components/tech/PushToggle.tsx` | Crear | Botón «Activer les notifications» y estados |
| `src/app/tech/page.tsx` | Modificar | Colocar `PushToggle` bajo `InstallCard` |
| `src/app/admin/team/page.tsx` | Modificar | Columna «Notifications» por técnico |
| `docs/architecture.md`, spec, `.env.example` si existe | Modificar | Documentar + variable `NEXT_PUBLIC_VAPID_PUBLIC_KEY` |

Rama: `feat/pwa-tecnicos-fase2-push` (creada desde `main`).

---

### Task 1: Migración — cola, suscripciones y trigger

**Files:** Create `supabase/migrations/20260924100000_push_notifications.sql`, `tests/rls/push-notifications.test.ts`; Modify `tests/rls/admin-only-isolation.test.ts`

- [ ] **Step 1: Escribir los tests RLS primero** (patrón de `tests/rls/maintenance-visit-visibility.test.ts`, helpers de `tests/rls/helpers.ts` / `scenario.ts`, `expectEmpty` de `assert.ts`):
  1. `push_subscriptions`: con admin client insertar una suscripción para techA y otra para techB ⇒ techA ve solo la suya (1 fila); techB solo la suya; admin ve las dos; `anon` nada. techA **no** puede insertar (no hay policy de INSERT para `authenticated`: el alta va por Server Action con service_role) ⇒ error.
  2. `push_notifications`: admin la lee; técnico y cliente reciben vacío (`expectEmpty`).
  3. Trigger (con admin client = service_role, `auth.uid()` NULL): asignar una incidencia de nadie a techA ⇒ 1 fila `(recipient techA, kind 'assigned', entity_type 'incident', entity_id, status 'pending')`; reasignar a techB ⇒ +2 filas (`assigned` para B, `unassigned` para A); poner `assigned_to = NULL` ⇒ +1 `unassigned` para B; actualizar otra columna (p. ej. `priority`) ⇒ 0 filas nuevas. Lo mismo, en corto, para una `maintenance_visits` (`entity_type 'visit'`). Insertar una incidencia **ya asignada** ⇒ 1 fila `assigned`.
  4. Auto-asignación: un **admin autenticado** (cliente de usuario admin) que se asigna a sí mismo una incidencia ⇒ 0 filas (no se avisa a quien hace el cambio).
  5. Sin Vault configurado (CI) el trigger no falla y la fila queda `pending`.
  Añadir `'push_notifications'` a la lista de `admin-only-isolation.test.ts`. Limpiar al final (las filas cuelgan de `profiles`/incidencias de prueba: borrar por `entity_id`/`recipient_id` de los ids sembrados).

- [ ] **Step 2: Migración.**

```sql
-- Notificaciones push a técnicos (Fase 2 de la PWA, 2026-09-24).
-- Cola de salida: el trigger ENCOLA en push_notifications (que es a la vez el registro de lo
-- enviado) y da un «toque» a la Edge Function send-push. Si la función falla o no hay Vault
-- configurado (CI, local), la fila queda 'pending' y el cron la reintenta. Nada se pierde en
-- silencio (lección de Princity/Matrix).

BEGIN;

CREATE EXTENSION IF NOT EXISTS pg_net;

-- 1. Suscripciones: un técnico puede tener varios aparatos. El endpoint identifica el aparato:
--    si un móvil compartido cambia de técnico, la Server Action reasigna la fila (upsert por endpoint).
CREATE TABLE public.push_subscriptions (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  endpoint        text NOT NULL UNIQUE,
  p256dh          text NOT NULL,
  auth            text NOT NULL,
  user_agent      text,
  created_at      timestamptz NOT NULL DEFAULT now(),
  last_seen_at    timestamptz NOT NULL DEFAULT now(),
  last_success_at timestamptz,
  last_error      text,
  disabled_at     timestamptz          -- Apple/Google respondió 404/410: el aparato la dio de baja
);
CREATE INDEX push_subscriptions_user_id_idx ON public.push_subscriptions (user_id) WHERE disabled_at IS NULL;

ALTER TABLE public.push_subscriptions ENABLE ROW LEVEL SECURITY;
CREATE POLICY push_subscriptions_own_select ON public.push_subscriptions
  FOR SELECT TO authenticated USING (user_id = (SELECT auth.uid()));
CREATE POLICY push_subscriptions_admin_select ON public.push_subscriptions
  FOR SELECT TO authenticated USING (public.is_admin());
-- Sin INSERT/UPDATE/DELETE para authenticated: el alta va por Server Action (service_role).

-- 2. Cola + registro.
CREATE TABLE public.push_notifications (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  recipient_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  kind         text NOT NULL CHECK (kind IN ('assigned', 'unassigned')),
  entity_type  text NOT NULL CHECK (entity_type IN ('incident', 'visit')),
  entity_id    uuid NOT NULL,
  status       text NOT NULL DEFAULT 'pending'
               CHECK (status IN ('pending', 'sending', 'sent', 'no_subscription', 'failed', 'expired')),
  attempts     int  NOT NULL DEFAULT 0,
  error        text,
  created_at   timestamptz NOT NULL DEFAULT now(),
  claimed_at   timestamptz,
  sent_at      timestamptz
);
CREATE INDEX push_notifications_queue_idx ON public.push_notifications (status, created_at);
CREATE INDEX push_notifications_recipient_idx ON public.push_notifications (recipient_id, created_at DESC);

ALTER TABLE public.push_notifications ENABLE ROW LEVEL SECURITY;
CREATE POLICY push_notifications_admin_select ON public.push_notifications
  FOR SELECT TO authenticated USING (public.is_admin());

-- 3. «Toque» a la Edge Function. URL y secreto viven en Vault (se crean a mano en prod, ver
--    runbook). Sin ellos no se llama: la fila queda pendiente y ningún entorno de pruebas
--    dispara la función de producción.
CREATE OR REPLACE FUNCTION public.kick_push_sender() RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
DECLARE
  v_url    text;
  v_secret text;
BEGIN
  SELECT decrypted_secret INTO v_url    FROM vault.decrypted_secrets WHERE name = 'push_sender_url';
  SELECT decrypted_secret INTO v_secret FROM vault.decrypted_secrets WHERE name = 'push_sender_secret';
  IF v_url IS NULL OR v_secret IS NULL THEN
    RETURN;
  END IF;
  -- pg_net encola la petición y la envía tras el COMMIT: si la transacción se deshace, no sale.
  PERFORM net.http_post(
    url     := v_url,
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-push-secret', v_secret),
    body    := '{}'::jsonb
  );
END;
$$;
REVOKE EXECUTE ON FUNCTION public.kick_push_sender() FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.kick_push_sender() TO service_role;

-- 4. Trigger: encola al cambiar assigned_to. No avisa a quien hace el cambio (auth.uid());
--    desde service_role (kiosko, crons) auth.uid() es NULL y avisa siempre.
CREATE OR REPLACE FUNCTION public.enqueue_assignment_push() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
DECLARE
  v_entity text := CASE TG_TABLE_NAME WHEN 'incidents' THEN 'incident' ELSE 'visit' END;
  v_old    uuid := CASE WHEN TG_OP = 'UPDATE' THEN OLD.assigned_to END;
  v_actor  uuid := auth.uid();
  v_queued boolean := false;
BEGIN
  IF NEW.assigned_to IS NOT DISTINCT FROM v_old THEN
    RETURN NEW;
  END IF;

  IF NEW.assigned_to IS NOT NULL AND NEW.assigned_to IS DISTINCT FROM v_actor THEN
    INSERT INTO public.push_notifications (recipient_id, kind, entity_type, entity_id)
    VALUES (NEW.assigned_to, 'assigned', v_entity, NEW.id);
    v_queued := true;
  END IF;

  IF v_old IS NOT NULL AND v_old IS DISTINCT FROM v_actor THEN
    INSERT INTO public.push_notifications (recipient_id, kind, entity_type, entity_id)
    VALUES (v_old, 'unassigned', v_entity, NEW.id);
    v_queued := true;
  END IF;

  IF v_queued THEN
    PERFORM public.kick_push_sender();
  END IF;
  RETURN NEW;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.enqueue_assignment_push() FROM PUBLIC, anon, authenticated;

CREATE TRIGGER trg_push_incident_assignment
  AFTER INSERT OR UPDATE OF assigned_to ON public.incidents
  FOR EACH ROW EXECUTE FUNCTION public.enqueue_assignment_push();

CREATE TRIGGER trg_push_visit_assignment
  AFTER INSERT OR UPDATE OF assigned_to ON public.maintenance_visits
  FOR EACH ROW EXECUTE FUNCTION public.enqueue_assignment_push();

-- 5. Reclamo atómico de la cola (varias invocaciones simultáneas no envían dos veces).
--    Recupera también filas 'sending' abandonadas (> 5 min: la función murió a medias).
CREATE OR REPLACE FUNCTION public.claim_push_notifications(p_limit int DEFAULT 50)
RETURNS SETOF public.push_notifications
LANGUAGE sql SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
  UPDATE public.push_notifications
     SET status = 'sending', attempts = attempts + 1, claimed_at = now()
   WHERE id IN (
     SELECT id FROM public.push_notifications
      WHERE attempts < 3
        AND (status = 'pending' OR (status = 'sending' AND claimed_at < now() - interval '5 minutes'))
      ORDER BY created_at
      LIMIT p_limit
      FOR UPDATE SKIP LOCKED
   )
  RETURNING *;
$$;
REVOKE EXECUTE ON FUNCTION public.claim_push_notifications(int) FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.claim_push_notifications(int) TO service_role;

-- 6. Red de seguridad cada minuto: caduca lo que ya no tiene sentido avisar (> 1 h) y, si queda
--    algo pendiente, vuelve a tocar la función. Idempotente.
SELECT cron.unschedule('push-notifications-retry') WHERE EXISTS (
  SELECT 1 FROM cron.job WHERE jobname = 'push-notifications-retry'
);
SELECT cron.schedule(
  'push-notifications-retry',
  '* * * * *',
  $$
  UPDATE public.push_notifications SET status = 'expired'
   WHERE status IN ('pending', 'sending') AND created_at < now() - interval '1 hour';
  SELECT public.kick_push_sender()
   WHERE EXISTS (SELECT 1 FROM public.push_notifications
                  WHERE status = 'pending'
                     OR (status = 'sending' AND claimed_at < now() - interval '5 minutes'));
  $$
);

COMMIT;
```

- [ ] **Step 3:** Revisar que `public.is_admin()` existe con esa firma (`20260508204858_rls_admin_access.sql`) y que los tests del Step 1 compilan (`npm run typecheck`) y los recoge `vitest.rls.config.ts`. Los tests RLS necesitan Docker; si no hay, los corre el job `rls.yml` en el PR.

- [ ] **Step 4: Commit** — `feat(push): cola push_notifications, suscripciones y trigger de asignación`.

---

### Task 2: Texto del aviso (función pura)

**Files:** Create `supabase/functions/_shared/push-message.ts`, `supabase/functions/_shared/push-message.test.ts`; Modify `vitest.config.ts`

- [ ] **Step 1: Incluir la carpeta en vitest** — `include: ['src/**/*.test.ts', 'supabase/functions/_shared/**/*.test.ts']`.

- [ ] **Step 2: Tests primero.**

```ts
import { describe, expect, it } from 'vitest'
import { buildPushMessage, type PushContext } from './push-message'

const base: PushContext = {
  kind: 'assigned', entityType: 'incident', entityId: 'inc-1',
  clientName: 'Axa', quartier: 'Plateau',
  incidentTitle: 'Bourrage papier', incidentNumero: 'SAV-2026-0042', priority: 'normale',
  scheduledDate: null, machineSerie: 'V9314505033',
}

describe('buildPushMessage', () => {
  it('avería asignada: cliente + barrio + problema, abre la avería', () => {
    expect(buildPushMessage(base)).toEqual({
      title: 'Nouvelle panne — Axa, Plateau',
      body: 'Bourrage papier · SAV-2026-0042',
      url: '/tech/incidents/inc-1',
      tag: 'incident-inc-1',
    })
  })

  it('avería urgente: lo dice en el título', () => {
    expect(buildPushMessage({ ...base, priority: 'urgente' }).title).toBe('Urgent · Nouvelle panne — Axa, Plateau')
  })

  it('sin barrio ni cliente: no deja comas colgando', () => {
    expect(buildPushMessage({ ...base, quartier: null }).title).toBe('Nouvelle panne — Axa')
    expect(buildPushMessage({ ...base, clientName: null, quartier: null }).title).toBe('Nouvelle panne — Client inconnu')
  })

  it('mantenimiento asignado: fecha en formato francés, abre la visita en su máquina', () => {
    expect(buildPushMessage({
      ...base, entityType: 'visit', entityId: 'vis-1', scheduledDate: '2026-09-30',
      incidentTitle: null, incidentNumero: null, priority: null,
    })).toEqual({
      title: 'Maintenance assignée — Axa, Plateau',
      body: 'Prévue le 30/09/2026',
      url: '/tech/scan/V9314505033/maintenance/vis-1',
      tag: 'visit-vis-1',
    })
  })

  it('mantenimiento sin serie conocida: abre el planning', () => {
    expect(buildPushMessage({ ...base, entityType: 'visit', entityId: 'vis-1', machineSerie: null, scheduledDate: '2026-09-30' }).url)
      .toBe('/tech/planning')
  })

  it('tarea retirada (avería y mantenimiento): abre el inicio', () => {
    expect(buildPushMessage({ ...base, kind: 'unassigned' })).toEqual({
      title: 'Tâche retirée — Axa',
      body: 'La panne SAV-2026-0042 a été réassignée.',
      url: '/tech',
      tag: 'incident-inc-1',
    })
    expect(buildPushMessage({ ...base, kind: 'unassigned', entityType: 'visit', entityId: 'vis-1', scheduledDate: '2026-09-30' }).body)
      .toBe('La maintenance du 30/09/2026 a été réassignée.')
  })

  it('el serie se codifica en la URL', () => {
    expect(buildPushMessage({ ...base, entityType: 'visit', entityId: 'v', machineSerie: 'A B/1', scheduledDate: '2026-01-02' }).url)
      .toBe('/tech/scan/A%20B%2F1/maintenance/v')
  })
})
```

- [ ] **Step 3: Implementar** `push-message.ts` (sin imports de Deno ni de Node: lo usan vitest y la Edge Function):

```ts
// Texto, destino y etiqueta de un aviso push al técnico. Puro: lo testea vitest y lo importa la
// Edge Function send-push. La etiqueta (`tag`) hace que un aviso nuevo de la misma tarea
// sustituya al anterior en el iPhone en vez de apilarse.
export type PushContext = {
  kind: 'assigned' | 'unassigned'
  entityType: 'incident' | 'visit'
  entityId: string
  clientName: string | null
  quartier: string | null
  incidentTitle: string | null
  incidentNumero: string | null
  priority: string | null
  /** YYYY-MM-DD */
  scheduledDate: string | null
  machineSerie: string | null
}

export type PushMessage = { title: string; body: string; url: string; tag: string }

function frDate(iso: string | null): string {
  if (!iso) return ''
  const [y, m, d] = iso.slice(0, 10).split('-')
  return `${d}/${m}/${y}`
}

export function buildPushMessage(c: PushContext): PushMessage {
  const client = c.clientName?.trim() || 'Client inconnu'
  const where = c.quartier ? `${client}, ${c.quartier}` : client
  const tag = `${c.entityType}-${c.entityId}`

  if (c.kind === 'unassigned') {
    const body = c.entityType === 'incident'
      ? `La panne ${c.incidentNumero ?? ''} a été réassignée.`.replace('  ', ' ')
      : `La maintenance du ${frDate(c.scheduledDate)} a été réassignée.`
    return { title: `Tâche retirée — ${client}`, body, url: '/tech', tag }
  }

  if (c.entityType === 'incident') {
    const urgent = c.priority === 'urgente' ? 'Urgent · ' : ''
    const body = [c.incidentTitle, c.incidentNumero].filter(Boolean).join(' · ')
    return { title: `${urgent}Nouvelle panne — ${where}`, body, url: `/tech/incidents/${c.entityId}`, tag }
  }

  return {
    title: `Maintenance assignée — ${where}`,
    body: c.scheduledDate ? `Prévue le ${frDate(c.scheduledDate)}` : '',
    url: c.machineSerie
      ? `/tech/scan/${encodeURIComponent(c.machineSerie)}/maintenance/${c.entityId}`
      : '/tech/planning',
    tag,
  }
}
```

- [ ] **Step 4:** `npx vitest run supabase/functions/_shared/push-message.test.ts` ⇒ 7 PASS. **Commit** — `feat(push): texto de los avisos al técnico`.

---

### Task 3: Edge Function `send-push`

**Files:** Create `supabase/functions/send-push/index.ts`

- [ ] **Step 1: Implementar.** Estructura (Deno; imitar el estilo de `cleanup-orphan-incident-photos/index.ts`):
  - Cabecera: qué hace, que se despliega con `supabase functions deploy send-push --no-verify-jwt` y que exige la cabecera `x-push-secret` (= secreto `PUSH_SENDER_SECRET`, comparar con `timingSafeEqual` de `_shared/secret-key.ts`); sin ella ⇒ 401.
  - `import webpush from 'npm:web-push@3.6.7'`; `webpush.setVapidDetails(Deno.env.get('VAPID_SUBJECT')!, Deno.env.get('VAPID_PUBLIC_KEY')!, Deno.env.get('VAPID_PRIVATE_KEY')!)`. Si falta alguna ⇒ 500 con log claro (no reclamar la cola).
  - `db = createClient(SUPABASE_URL, getSecretKey(), {auth:{autoRefreshToken:false, persistSession:false}})`.
  - `const { data: rows } = await db.rpc('claim_push_notifications', { p_limit: 50 })`.
  - Por cada fila, **`loadContext(db, row)`** → `PushContext`:
    - `incident`: `incidents` `select('id, title, numero_incident, priority, machine_id, contract_machine_id')`. Línea = `contract_machine_id` o, si es pública, la línea abierta de `machine_id` (`contract_machines` `machine_id = … AND date_fin IS NULL`, `.maybeSingle()`). Máquina = `machines(numero_serie, quartier_code)`; cliente vía `contracts(clients(nom_client, quartier_code))`.
    - `visit`: `maintenance_visits` `select('id, scheduled_date, contract_machine_id')` → línea → máquina + cliente igual.
    - Barrio: `machine.quartier_code ?? client.quartier_code` → `quartiers.label` (`.maybeSingle()`).
    - Si la entidad ya no existe ⇒ marcar la fila `failed` con `error: 'entity_not_found'` y seguir.
  - `const message = buildPushMessage(ctx)`; `payload = JSON.stringify(message)`.
  - Suscripciones: `push_subscriptions` `user_id = row.recipient_id AND disabled_at IS NULL`. Ninguna ⇒ fila `no_subscription`.
  - Enviar a cada una: `webpush.sendNotification({endpoint, keys:{p256dh, auth}}, payload, { TTL: 3600, urgency: 'high' })`.
    - OK ⇒ `last_success_at = now()`, `last_error = null` en la suscripción.
    - `statusCode` 404 o 410 ⇒ `disabled_at = now()`, `last_error`.
    - Otro error ⇒ `last_error` en la suscripción.
  - Resultado de la fila: al menos un envío OK ⇒ `sent`, `sent_at`, `error = null`. Ninguno OK: si todas estaban caducadas (404/410) ⇒ `no_subscription`; si no, `attempts >= 3` ⇒ `failed`, si no ⇒ `pending` (el cron reintenta), con `error` = primer mensaje.
  - Respuesta JSON `{ claimed, sent, failed, no_subscription }` y `console.log` del resumen.
  - Todo `try/catch` por fila: un aviso roto no para los demás.

- [ ] **Step 2: Verificación estática.** No hay Deno en local: comprobar a mano imports (`../_shared/push-message.ts` con extensión `.ts`), que no se usa nada de Node salvo vía `npm:`, y que los nombres de columnas coinciden con `src/lib/supabase/types.ts`. La prueba real es el runbook (Task 7).

- [ ] **Step 3: Commit** — `feat(push): Edge Function send-push`.

---

### Task 4: Service worker — mostrar el aviso y abrir la tarea

**Files:** Modify `public/sw.js`

- [ ] **Step 1:** Añadir (y actualizar el comentario de cabecera: Fase 2 añade push; sigue sin `fetch`):

```js
// iOS exige mostrar SIEMPRE una notificación por cada push (userVisibleOnly): nunca salir sin
// showNotification, aunque el payload venga roto.
self.addEventListener('push', event => {
  let data = {}
  try {
    data = event.data ? event.data.json() : {}
  } catch {
    data = { body: event.data ? event.data.text() : '' }
  }
  event.waitUntil(
    self.registration.showNotification(data.title || 'AMD SAV', {
      body: data.body || '',
      tag: data.tag,
      icon: '/pwa/icon-192.png',
      badge: '/pwa/icon-192.png',
      data: { url: data.url || '/tech' },
    })
  )
})

// Al tocar: reutilizar la ventana de la app si está abierta; si no, abrirla en la tarea.
self.addEventListener('notificationclick', event => {
  event.notification.close()
  const url = new URL(event.notification.data?.url || '/tech', self.location.origin).href
  event.waitUntil((async () => {
    const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true })
    for (const client of windows) {
      if ('focus' in client) {
        await client.focus()
        if ('navigate' in client) return client.navigate(url)
        return
      }
    }
    return self.clients.openWindow(url)
  })())
})
```

- [ ] **Step 2: Commit** — `feat(push): el service worker muestra el aviso y abre la tarea`.

---

### Task 5: Suscribirse desde `/tech`

**Files:** Create `src/lib/pwa/push.ts`, `src/lib/pwa/push.test.ts`, `src/app/tech/push-actions.ts`, `src/components/tech/PushToggle.tsx`; Modify `src/app/tech/page.tsx`

- [ ] **Step 1: Tests primero** (`src/lib/pwa/push.test.ts`):
  - `urlBase64ToUint8Array('AQID')` ⇒ `Uint8Array [1,2,3]`; acepta `-`/`_` y sin relleno `=`.
  - `parseSubscription(input)` ⇒ `{ endpoint, p256dh, auth }` si `endpoint` es `https://…`, y `keys.p256dh`/`keys.auth` son strings no vacíos de ≤ 512 caracteres; `null` si falta algo, si el endpoint no es https o si algo es demasiado largo (endpoint ≤ 2048).

- [ ] **Step 2: Implementar `src/lib/pwa/push.ts`** (puro):

```ts
// Utilidades puras de Web Push para la PWA de técnicos (testeadas en push.test.ts).

/** Clave pública VAPID (base64url) → bytes, como pide pushManager.subscribe(). */
export function urlBase64ToUint8Array(base64Url: string): Uint8Array {
  const padded = base64Url + '='.repeat((4 - (base64Url.length % 4)) % 4)
  const base64 = padded.replace(/-/g, '+').replace(/_/g, '/')
  const raw = atob(base64)
  return Uint8Array.from(raw, ch => ch.charCodeAt(0))
}

export type ParsedSubscription = { endpoint: string; p256dh: string; auth: string }

/** Valida lo que llega del navegador antes de guardarlo (viene del cliente: no fiarse). */
export function parseSubscription(input: unknown): ParsedSubscription | null {
  if (!input || typeof input !== 'object') return null
  const { endpoint, keys } = input as { endpoint?: unknown; keys?: { p256dh?: unknown; auth?: unknown } }
  const ok = (v: unknown, max: number): v is string => typeof v === 'string' && v.length > 0 && v.length <= max
  if (!ok(endpoint, 2048) || !endpoint.startsWith('https://')) return null
  if (!ok(keys?.p256dh, 512) || !ok(keys?.auth, 512)) return null
  return { endpoint, p256dh: keys.p256dh, auth: keys.auth }
}
```

- [ ] **Step 3: Server Action `src/app/tech/push-actions.ts`:**

```ts
'use server'

import { requireTechnician } from '@/lib/auth'
import { createAdminClient } from '@/lib/supabase/admin'
import { parseSubscription } from '@/lib/pwa/push'

// Guarda (o reasigna) la suscripción push de este aparato al técnico conectado. Con service_role
// porque el endpoint identifica el APARATO: si un móvil compartido cambia de técnico, la fila
// pasa al nuevo (upsert por endpoint), cosa que la RLS de un usuario no permitiría.
export async function savePushSubscription(
  input: unknown,
  userAgent: string | null,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const { user } = await requireTechnician()
  const sub = parseSubscription(input)
  if (!sub) return { ok: false, error: 'Abonnement invalide.' }

  const admin = createAdminClient()
  const { error } = await admin.from('push_subscriptions').upsert(
    {
      user_id: user.id,
      endpoint: sub.endpoint,
      p256dh: sub.p256dh,
      auth: sub.auth,
      user_agent: userAgent?.slice(0, 512) ?? null,
      last_seen_at: new Date().toISOString(),
      disabled_at: null,
      last_error: null,
    },
    { onConflict: 'endpoint' },
  )
  if (error) {
    console.error('[push] savePushSubscription', error)
    return { ok: false, error: 'Impossible d’activer les notifications.' }
  }
  return { ok: true }
}
```

  (Tras la migración, regenerar/actualizar `src/lib/supabase/types.ts` con las dos tablas nuevas siguiendo cómo se hizo en migraciones anteriores —mirar el historial de git de ese fichero—; si no se puede generar sin Docker, añadir las definiciones a mano con el mismo formato.)

- [ ] **Step 4: `src/components/tech/PushToggle.tsx`** (`'use client'`). Estados, calculados en `useEffect` (nada en el render del servidor):
  - Sin `NEXT_PUBLIC_VAPID_PUBLIC_KEY`, sin `serviceWorker`/`PushManager`/`Notification`, o la app **no** instalada (`isStandaloneDisplay()` de `src/lib/pwa/display.ts`) ⇒ `null` (la `InstallCard` ya guía la instalación; en iPhone el push solo existe instalada).
  - `Notification.permission === 'denied'` ⇒ tarjeta informativa: «Notifications bloquées. Activez-les dans Réglages › Notifications › AMD SAV.»
  - `'default'` ⇒ tarjeta con botón **«Activer les notifications»** (texto: «Recevez une alerte dès qu’une panne ou une maintenance vous est assignée.»). Al pulsar (el permiso DEBE pedirse dentro del toque): `Notification.requestPermission()` → si `granted`: `reg = await navigator.serviceWorker.ready` → `reg.pushManager.getSubscription() ?? reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlBase64ToUint8Array(key) })` → `savePushSubscription(sub.toJSON(), navigator.userAgent)`. Estado «en cours…» mientras tanto; error ⇒ mensaje corto.
  - `'granted'` ⇒ en segundo plano, re-suscribir/guardar sin UI (cubre reinstalación o suscripción caducada) y mostrar una línea discreta «🔔 Notifications activées».
  Estilo: mismo que `InstallCard` (tokens `bg-card`, `border-line`, `text-ink`, `bg-accent` para el botón).

- [ ] **Step 5:** Colocar `<PushToggle />` en `src/app/tech/page.tsx` justo después de `<InstallCard />`.

- [ ] **Step 6:** `npm run typecheck && npx vitest run src/lib/pwa`. **Commit** — `feat(push): el técnico activa los avisos desde /tech`.

---

### Task 6: Indicador en `/admin/team`

**Files:** Modify `src/app/admin/team/page.tsx`

- [ ] **Step 1:** Añadir al `Promise.all` una lectura con el cliente del usuario (admin por RLS): `push_subscriptions` `select('user_id')` `is('disabled_at', null)`; construir un `Set` de `user_id`. Nueva columna «Notifications»: para técnicos, «🔔 Activées» si está en el set, «— Non activées» si no; para admins, vacío. Mantener el manejo de error del fichero (`throw new Error('DATA_FETCH_ERROR')`). Ajustar el `colSpan` de la fila vacía.

- [ ] **Step 2:** `npm run typecheck && npm run build`. **Commit** — `feat(push): el equipo muestra quién tiene los avisos activados`.

---

### Task 7: Documentación + runbook de puesta en marcha

**Files:** Modify `docs/architecture.md`, spec §Fase 2, `.env.example` (si existe; si no, documentar la variable en `CLAUDE.md` §Variables de entorno)

- [ ] **Step 1:** `docs/architecture.md`: sección «Notificaciones push (Fase 2)» con el flujo (trigger → cola → toque → send-push → iPhone), tablas y estados, Vault, cron, secretos, y cómo diagnosticar (`select status, count(*) from push_notifications group by 1`).
- [ ] **Step 2:** Spec §Fase 2: anotar el refinamiento (cola + Vault + cron) y por qué.
- [ ] **Step 3:** Runbook en `docs/architecture.md` (lo ejecuta el coordinador **con confirmación del usuario**, no el implementador):
  1. `npx web-push generate-vapid-keys --json` y `openssl rand -hex 32` (secreto del toque).
  2. `supabase secrets set VAPID_PUBLIC_KEY=… VAPID_PRIVATE_KEY=… VAPID_SUBJECT=mailto:<email de AMD> PUSH_SENDER_SECRET=…`
  3. `supabase functions deploy send-push --no-verify-jwt`
  4. `supabase db push`
  5. Vault en prod (SQL Editor de Supabase): `select vault.create_secret('https://myyejbviunyvywfukysj.supabase.co/functions/v1/send-push', 'push_sender_url');` y `select vault.create_secret('<secreto>', 'push_sender_secret');`
  6. Vercel: `NEXT_PUBLIC_VAPID_PUBLIC_KEY=<clave pública>` (Production) y redeploy.
  7. Prueba en iPhone: activar avisos → asignar una avería a `testsav` desde el kiosko → llega el aviso → tocarlo abre la avería; reasignarla → «Tâche retirée»; comprobar `push_notifications` (`sent`).
- [ ] **Step 4:** `npm run typecheck && npm test && npm run build`. **Commit** — `docs(push): arquitectura y runbook de las notificaciones`.
