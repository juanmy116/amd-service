// Envía las notificaciones push pendientes a los técnicos (Fase 2 de la PWA).
//
// La invoca el trigger de asignación (kick_push_sender, «toque» vía pg_net) nada más encolar
// una fila, y de red de seguridad el cron de 1 minuto (migración 20260924100000). Reclama la
// cola con `claim_push_notifications` (FOR UPDATE SKIP LOCKED: varias invocaciones simultáneas
// no envían dos veces) de 10 en 10 y procesa esas filas EN PARALELO (el tiempo de pared de la
// función queda acotado aunque un servicio push tarde), arma el texto con la función pura de `_shared/push-message.ts` y envía
// Web Push (VAPID) a todas las suscripciones activas del destinatario. Cada fila queda con un
// estado final (`sent` / `no_subscription` / `failed` / `pending` para reintento) — nunca se
// deja una fila reclamada sin actualizar, ni un aviso roto detiene a los demás.
//
// Desplegar con: supabase functions deploy send-push --no-verify-jwt
// Exige la cabecera `x-push-secret` (= secreto PUSH_SENDER_SECRET, comparación en tiempo
// constante); sin ella, o si no coincide, responde 401. No es un endpoint público: solo lo
// llaman el trigger y el cron, que conocen el secreto guardado en Vault.

import 'jsr:@supabase/functions-js/edge-runtime.d.ts'
import { createClient, type SupabaseClient } from 'npm:@supabase/supabase-js'
import webpush from 'npm:web-push@3.6.7'
import { getSecretKey, timingSafeEqual } from '../_shared/secret-key.ts'
import { buildPushMessage, type PushContext } from '../_shared/push-message.ts'

const SUPABASE_URL       = Deno.env.get('SUPABASE_URL') ?? ''
const PUSH_SENDER_SECRET = Deno.env.get('PUSH_SENDER_SECRET') ?? ''
const VAPID_SUBJECT      = Deno.env.get('VAPID_SUBJECT') ?? ''
const VAPID_PUBLIC_KEY   = Deno.env.get('VAPID_PUBLIC_KEY') ?? ''
const VAPID_PRIVATE_KEY  = Deno.env.get('VAPID_PRIVATE_KEY') ?? ''

const JSON_HEADERS = { 'Content-Type': 'application/json' }

type QueueRow = {
  id: string
  recipient_id: string
  kind: 'assigned' | 'unassigned'
  entity_type: 'incident' | 'visit'
  entity_id: string
  attempts: number
}

type Counts = { claimed: number; sent: number; failed: number; no_subscription: number; stale: number }

/** Actualiza una fila de la cola sin dejar que un fallo de escritura tumbe el resto del lote. */
async function updateNotification(db: SupabaseClient, id: string, patch: Record<string, unknown>): Promise<void> {
  const { error } = await db.from('push_notifications').update(patch).eq('id', id)
  if (error) console.error('[send-push] update push_notifications falló', id, error.message)
}

/** Idem para una suscripción — un fallo aquí no debe pasar por un envío no registrado. */
async function updateSubscription(db: SupabaseClient, id: string, patch: Record<string, unknown>): Promise<void> {
  const { error } = await db.from('push_subscriptions').update(patch).eq('id', id)
  if (error) console.error('[send-push] update push_subscriptions falló', id, error.message)
}

Deno.serve(async (req: Request) => {
  const provided = req.headers.get('x-push-secret') ?? ''
  if (!PUSH_SENDER_SECRET) {
    console.error('[send-push] PUSH_SENDER_SECRET no configurado')
  }
  if (!PUSH_SENDER_SECRET || !timingSafeEqual(provided, PUSH_SENDER_SECRET)) {
    return new Response(JSON.stringify({ error: 'Non autorisé' }), { status: 401, headers: JSON_HEADERS })
  }

  // Sin VAPID no se puede firmar ningún envío: mejor fallar ruidosamente que reclamar la cola
  // y dejar las filas atascadas en 'sending' hasta que expire el timeout de 5 minutos.
  if (!VAPID_SUBJECT || !VAPID_PUBLIC_KEY || !VAPID_PRIVATE_KEY) {
    console.error('[send-push] VAPID_SUBJECT/VAPID_PUBLIC_KEY/VAPID_PRIVATE_KEY manquantes')
    return new Response(JSON.stringify({ error: 'Configuration manquante' }), { status: 500, headers: JSON_HEADERS })
  }
  try {
    webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY)
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    console.error('[send-push] VAPID inválido', message)
    return new Response(JSON.stringify({ error: 'Configuration invalide' }), { status: 500, headers: JSON_HEADERS })
  }

  const db = createClient(SUPABASE_URL, getSecretKey(), {
    auth: { autoRefreshToken: false, persistSession: false },
  })

  // Lote pequeño + en paralelo: cada envío puede tardar hasta 10 s por aparato; 50 filas en serie
  // podían agotar el tiempo de pared de la Edge Function y dejar filas 'sending' huérfanas.
  const { data: rows, error: claimErr } = await db.rpc('claim_push_notifications', { p_limit: 10 })
  if (claimErr) {
    console.error('[send-push] claim_push_notifications', claimErr.message)
    return new Response(JSON.stringify({ error: claimErr.message }), { status: 500, headers: JSON_HEADERS })
  }

  const queue = (rows ?? []) as QueueRow[]
  const counts: Counts = { claimed: queue.length, sent: 0, failed: 0, no_subscription: 0, stale: 0 }

  // Cada fila lleva su propio try/catch y deja su estado final; allSettled solo garantiza que
  // esperamos a TODAS antes de responder, aunque alguna rechace de forma inesperada.
  await Promise.allSettled(queue.map(async row => {
    try {
      await processRow(db, row, counts)
    } catch (err) {
      // Última red: la fila ya está 'sending' (reclamada) — nunca la dejamos así.
      const message = err instanceof Error ? err.message : String(err)
      console.error('[send-push] row', row.id, message)
      const status = row.attempts >= 3 ? 'failed' : 'pending'
      if (status === 'failed') counts.failed++
      await updateNotification(db, row.id, { status, error: message })
    }
  }))

  console.log('[send-push]', JSON.stringify(counts))
  return new Response(JSON.stringify(counts), { headers: JSON_HEADERS })
})

/** Contexto de un aviso más el estado ACTUAL de la asignación (para detectar avisos caducados). */
type LoadedContext = PushContext & { assignedTo: string | null; entityStatus: string | null }

/**
 * Un aviso puede quedar obsoleto entre que se encola y se envía (el cron de 1 min, un reintento…):
 * la tarea se reasignó otra vez o ya se cerró. Enviarlo confundiría al técnico.
 * - kind='assigned': caduca si ya no está asignada a este destinatario, o si la tarea ya se cerró.
 * - kind='unassigned': caduca si el destinatario ha vuelto a ser el asignado (reasignación de ida y vuelta).
 */
function isStale(row: QueueRow, ctx: LoadedContext): boolean {
  if (row.kind === 'assigned') {
    if (ctx.assignedTo !== row.recipient_id) return true
    if (ctx.entityType === 'incident') return ctx.entityStatus === 'résolu' || ctx.entityStatus === 'fermé'
    return ctx.entityStatus === 'fait'
  }
  return ctx.assignedTo === row.recipient_id
}

/** Detalle útil del rechazo de web-push: `WebPushError.message` es siempre el mismo texto genérico. */
function pushErrorDetail(err: unknown): { statusCode: number | undefined; detail: string } {
  const statusCode = (err as { statusCode?: number } | null | undefined)?.statusCode
  const detail = statusCode
    ? `${statusCode} ${String((err as { body?: unknown }).body ?? '').slice(0, 200)}`
    : (err instanceof Error ? err.message : String(err))
  return { statusCode, detail }
}

/**
 * ¿Se le llegó a AVISAR a este técnico de la asignación? Un «Tâche retirée» de algo de lo que
 * nunca supo (la asignación caducó, no tenía aparato, falló el envío…) solo confunde.
 */
async function wasAssignmentNotified(db: SupabaseClient, row: QueueRow): Promise<boolean> {
  const { data, error } = await db
    .from('push_notifications')
    .select('id')
    .eq('recipient_id', row.recipient_id)
    .eq('entity_type', row.entity_type)
    .eq('entity_id', row.entity_id)
    .eq('kind', 'assigned')
    .eq('status', 'sent')
    .limit(1)
  if (error) throw new Error(`push_notifications (assigned previo): ${error.message}`)
  return (data ?? []).length > 0
}

/** Procesa una fila reclamada de principio a fin: carga contexto, envía, deja el estado final. */
async function processRow(db: SupabaseClient, row: QueueRow, counts: Counts): Promise<void> {
  if (row.kind === 'unassigned' && !(await wasAssignmentNotified(db, row))) {
    counts.stale++
    await updateNotification(db, row.id, { status: 'expired', error: 'stale' })
    return
  }

  const ctx = await loadContext(db, row)
  if (!ctx) {
    counts.failed++
    await updateNotification(db, row.id, { status: 'failed', error: 'entity_not_found' })
    return
  }

  if (isStale(row, ctx)) {
    counts.stale++
    await updateNotification(db, row.id, { status: 'expired', error: 'stale' })
    return
  }

  const message = buildPushMessage(ctx)
  const payload = JSON.stringify(message)

  const { data: subs, error: subsErr } = await db
    .from('push_subscriptions')
    .select('id, endpoint, p256dh, auth')
    .eq('user_id', row.recipient_id)
    .is('disabled_at', null)

  if (subsErr) {
    const status = row.attempts >= 3 ? 'failed' : 'pending'
    if (status === 'failed') counts.failed++
    await updateNotification(db, row.id, { status, error: subsErr.message })
    return
  }

  const subscriptions = (subs ?? []) as { id: string; endpoint: string; p256dh: string; auth: string }[]
  if (subscriptions.length === 0) {
    counts.no_subscription++
    await updateNotification(db, row.id, { status: 'no_subscription', error: null })
    return
  }

  let sentAny = false
  // Sigue en true mientras TODOS los fallos vistos sean "aparato dado de baja" (404/410); un
  // solo fallo de otro tipo lo tumba, porque entonces sí merece la pena reintentar.
  let allExpired = true
  let firstError: string | null = null

  for (const sub of subscriptions) {
    try {
      // timeout: sin él, un solo servicio push colgado (Apple/Google caído) bloquea todo el lote.
      await webpush.sendNotification(
        { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
        payload,
        { TTL: 3600, urgency: 'high', timeout: 10_000 },
      )
      sentAny = true
      await updateSubscription(db, sub.id, { last_success_at: new Date().toISOString(), last_error: null })
    } catch (err) {
      const { statusCode, detail } = pushErrorDetail(err)
      if (firstError === null) firstError = detail
      // Nunca se registra endpoint/keys/secretos — solo el código y el cuerpo de la respuesta.
      console.error('[send-push] envío fallido', statusCode ?? '', detail)

      if (statusCode === 404 || statusCode === 410) {
        await updateSubscription(db, sub.id, { disabled_at: new Date().toISOString(), last_error: detail })
      } else {
        allExpired = false
        await updateSubscription(db, sub.id, { last_error: detail })
      }
    }
  }

  if (sentAny) {
    counts.sent++
    await updateNotification(db, row.id, { status: 'sent', sent_at: new Date().toISOString(), error: null })
    return
  }

  if (allExpired) {
    counts.no_subscription++
    await updateNotification(db, row.id, { status: 'no_subscription', error: firstError })
    return
  }

  if (row.attempts >= 3) {
    counts.failed++
    await updateNotification(db, row.id, { status: 'failed', error: firstError })
    return
  }

  // Ni un envío ni todo caducado, y quedan intentos: vuelve a 'pending' para que el cron de
  // 1 minuto la reintente (claim_push_notifications solo recoge 'pending' o 'sending' huérfana).
  await updateNotification(db, row.id, { status: 'pending', error: firstError })
}

/** Contexto del aviso (cliente, barrio, máquina…) a partir de la fila de la cola. */
async function loadContext(db: SupabaseClient, row: QueueRow): Promise<LoadedContext | null> {
  return row.entity_type === 'incident'
    ? loadIncidentContext(db, row)
    : loadVisitContext(db, row)
}

async function loadIncidentContext(db: SupabaseClient, row: QueueRow): Promise<LoadedContext | null> {
  const { data: incident, error } = await db
    .from('incidents')
    .select('id, title, numero_incident, priority, machine_id, contract_machine_id, assigned_to, status')
    .eq('id', row.entity_id)
    .maybeSingle()
  if (error) throw new Error(`incidents: ${error.message}`)
  if (!incident) return null

  // Con línea: esa línea. Incidencia pública (sin contract_machine_id): la línea vigente hoy de
  // esa máquina, igual que getOpenLineForMachine (src/lib/contract-machines.ts).
  const line = incident.contract_machine_id
    ? await loadLine(db, 'id', incident.contract_machine_id)
    : incident.machine_id
      ? await loadLine(db, 'machine_id', incident.machine_id)
      : null

  // Sin línea (o la línea no se encontró), el barrio de la máquina sigue saliendo del serie
  // de la propia incidencia.
  const machineQuartier = line
    ? line.machineQuartier
    : await loadMachineQuartier(db, incident.machine_id)
  const quartier = await loadQuartierLabel(db, machineQuartier ?? line?.client?.quartier_code ?? null)

  return {
    kind: row.kind,
    entityType: 'incident',
    entityId: row.entity_id,
    clientName: line?.client?.nom_client ?? null,
    quartier,
    incidentTitle: incident.title,
    incidentNumero: incident.numero_incident,
    priority: incident.priority,
    scheduledDate: null,
    assignedTo: incident.assigned_to,
    entityStatus: incident.status,
  }
}

async function loadVisitContext(db: SupabaseClient, row: QueueRow): Promise<LoadedContext | null> {
  const { data: visit, error } = await db
    .from('maintenance_visits')
    .select('id, scheduled_date, contract_machine_id, assigned_to, status')
    .eq('id', row.entity_id)
    .maybeSingle()
  if (error) throw new Error(`maintenance_visits: ${error.message}`)
  if (!visit) return null

  const line = await loadLine(db, 'id', visit.contract_machine_id)
  const quartier = await loadQuartierLabel(db, line?.machineQuartier ?? line?.client?.quartier_code ?? null)

  return {
    kind: row.kind,
    entityType: 'visit',
    entityId: row.entity_id,
    clientName: line?.client?.nom_client ?? null,
    quartier,
    incidentTitle: null,
    incidentNumero: null,
    priority: null,
    scheduledDate: visit.scheduled_date,
    assignedTo: visit.assigned_to,
    entityStatus: visit.status,
  }
}

type LineInfo = {
  /** `machines.quartier_code` (barrio de la instalación). */
  machineQuartier: string | null
  /** Cliente de la línea (nombre + barrio de respaldo). */
  client: { nom_client: string; quartier_code: string | null } | null
}

/**
 * Una línea contract_machines con su máquina y su cliente en UNA sola consulta. La relación
 * contract_machines → machines es única (FK `machine_id`), así que el embed no es ambiguo.
 * - `by = 'id'`: la línea concreta.
 * - `by = 'machine_id'`: la línea vigente (sin date_fin) de ese serie — como mucho una (índice
 *   único `contract_machines_one_open_per_machine`).
 */
async function loadLine(db: SupabaseClient, by: 'id' | 'machine_id', value: string): Promise<LineInfo | null> {
  let query = db
    .from('contract_machines')
    .select('machines(quartier_code), contracts(clients(nom_client, quartier_code))')
    .eq(by, value)
  if (by === 'machine_id') query = query.is('date_fin', null)
  const { data, error } = await query.maybeSingle()
  if (error) throw new Error(`contract_machines: ${error.message}`)
  if (!data) return null
  const machine = data.machines as unknown as { quartier_code: string | null } | null
  const contract = data.contracts as unknown as { clients: { nom_client: string; quartier_code: string | null } | null } | null
  return { machineQuartier: machine?.quartier_code ?? null, client: contract?.clients ?? null }
}

/** `machines.quartier_code` de la máquina (barrio de la instalación), si se conoce el serie. */
async function loadMachineQuartier(db: SupabaseClient, serie: string | null): Promise<string | null> {
  if (!serie) return null
  const { data, error } = await db
    .from('machines')
    .select('quartier_code')
    .eq('numero_serie', serie)
    .maybeSingle()
  if (error) throw new Error(`machines: ${error.message}`)
  return data?.quartier_code ?? null
}

/** `quartiers.label` a partir de su `code` (misma regla que el kiosko, src/lib/quartiers.ts). */
async function loadQuartierLabel(db: SupabaseClient, code: string | null): Promise<string | null> {
  if (!code) return null
  const { data, error } = await db.from('quartiers').select('label').eq('code', code).maybeSingle()
  if (error) throw new Error(`quartiers: ${error.message}`)
  return data?.label ?? null
}
