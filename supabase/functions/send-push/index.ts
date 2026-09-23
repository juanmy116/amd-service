// Envía las notificaciones push pendientes a los técnicos (Fase 2 de la PWA).
//
// La invoca el trigger de asignación (kick_push_sender, «toque» vía pg_net) nada más encolar
// una fila, y de red de seguridad el cron de 1 minuto (migración 20260924100000). Reclama la
// cola con `claim_push_notifications` (FOR UPDATE SKIP LOCKED: varias invocaciones simultáneas
// no envían dos veces), arma el texto con la función pura de `_shared/push-message.ts` y envía
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

type Counts = { claimed: number; sent: number; failed: number; no_subscription: number }

Deno.serve(async (req: Request) => {
  const provided = req.headers.get('x-push-secret') ?? ''
  if (!PUSH_SENDER_SECRET || !timingSafeEqual(provided, PUSH_SENDER_SECRET)) {
    return new Response(JSON.stringify({ error: 'Non autorisé' }), { status: 401, headers: JSON_HEADERS })
  }

  // Sin VAPID no se puede firmar ningún envío: mejor fallar ruidosamente que reclamar la cola
  // y dejar las filas atascadas en 'sending' hasta que expire el timeout de 5 minutos.
  if (!VAPID_SUBJECT || !VAPID_PUBLIC_KEY || !VAPID_PRIVATE_KEY) {
    console.error('[send-push] VAPID_SUBJECT/VAPID_PUBLIC_KEY/VAPID_PRIVATE_KEY manquantes')
    return new Response(JSON.stringify({ error: 'Configuration manquante' }), { status: 500, headers: JSON_HEADERS })
  }
  webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY)

  const db = createClient(SUPABASE_URL, getSecretKey(), {
    auth: { autoRefreshToken: false, persistSession: false },
  })

  const { data: rows, error: claimErr } = await db.rpc('claim_push_notifications', { p_limit: 50 })
  if (claimErr) {
    console.error('[send-push] claim_push_notifications', claimErr.message)
    return new Response(JSON.stringify({ error: claimErr.message }), { status: 500, headers: JSON_HEADERS })
  }

  const queue = (rows ?? []) as QueueRow[]
  const counts: Counts = { claimed: queue.length, sent: 0, failed: 0, no_subscription: 0 }

  for (const row of queue) {
    try {
      await processRow(db, row, counts)
    } catch (err) {
      // Última red: la fila ya está 'sending' (reclamada) — nunca la dejamos así.
      const message = err instanceof Error ? err.message : String(err)
      console.error('[send-push] row', row.id, message)
      const status = row.attempts >= 3 ? 'failed' : 'pending'
      if (status === 'failed') counts.failed++
      await db.from('push_notifications').update({ status, error: message }).eq('id', row.id)
    }
  }

  console.log('[send-push]', JSON.stringify(counts))
  return new Response(JSON.stringify(counts), { headers: JSON_HEADERS })
})

/** Procesa una fila reclamada de principio a fin: carga contexto, envía, deja el estado final. */
async function processRow(db: SupabaseClient, row: QueueRow, counts: Counts): Promise<void> {
  const ctx = await loadContext(db, row)
  if (!ctx) {
    counts.failed++
    await db.from('push_notifications')
      .update({ status: 'failed', error: 'entity_not_found' })
      .eq('id', row.id)
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
    await db.from('push_notifications').update({ status, error: subsErr.message }).eq('id', row.id)
    return
  }

  const subscriptions = (subs ?? []) as { id: string; endpoint: string; p256dh: string; auth: string }[]
  if (subscriptions.length === 0) {
    counts.no_subscription++
    await db.from('push_notifications')
      .update({ status: 'no_subscription', error: null })
      .eq('id', row.id)
    return
  }

  let sentAny = false
  // Sigue en true mientras TODOS los fallos vistos sean "aparato dado de baja" (404/410); un
  // solo fallo de otro tipo lo tumba, porque entonces sí merece la pena reintentar.
  let allExpired = true
  let firstError: string | null = null

  for (const sub of subscriptions) {
    try {
      await webpush.sendNotification(
        { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
        payload,
        { TTL: 3600, urgency: 'high' },
      )
      sentAny = true
      await db.from('push_subscriptions')
        .update({ last_success_at: new Date().toISOString(), last_error: null })
        .eq('id', sub.id)
    } catch (err) {
      const statusCode = (err as { statusCode?: number } | null | undefined)?.statusCode
      const message = err instanceof Error ? err.message : String(err)
      if (firstError === null) firstError = message

      if (statusCode === 404 || statusCode === 410) {
        await db.from('push_subscriptions')
          .update({ disabled_at: new Date().toISOString(), last_error: message })
          .eq('id', sub.id)
      } else {
        allExpired = false
        await db.from('push_subscriptions')
          .update({ last_error: message })
          .eq('id', sub.id)
      }
    }
  }

  if (sentAny) {
    counts.sent++
    await db.from('push_notifications')
      .update({ status: 'sent', sent_at: new Date().toISOString(), error: null })
      .eq('id', row.id)
    return
  }

  if (allExpired) {
    counts.no_subscription++
    await db.from('push_notifications')
      .update({ status: 'no_subscription', error: firstError })
      .eq('id', row.id)
    return
  }

  if (row.attempts >= 3) {
    counts.failed++
    await db.from('push_notifications')
      .update({ status: 'failed', error: firstError })
      .eq('id', row.id)
    return
  }

  // Ni un envío ni todo caducado, y quedan intentos: vuelve a 'pending' para que el cron de
  // 1 minuto la reintente (claim_push_notifications solo recoge 'pending' o 'sending' huérfana).
  await db.from('push_notifications')
    .update({ status: 'pending', error: firstError })
    .eq('id', row.id)
}

/** Contexto del aviso (cliente, barrio, máquina…) a partir de la fila de la cola. */
async function loadContext(db: SupabaseClient, row: QueueRow): Promise<PushContext | null> {
  return row.entity_type === 'incident'
    ? loadIncidentContext(db, row)
    : loadVisitContext(db, row)
}

async function loadIncidentContext(db: SupabaseClient, row: QueueRow): Promise<PushContext | null> {
  const { data: incident, error } = await db
    .from('incidents')
    .select('id, title, numero_incident, priority, machine_id, contract_machine_id')
    .eq('id', row.entity_id)
    .maybeSingle()
  if (error) throw new Error(`incidents: ${error.message}`)
  if (!incident) return null

  let contractMachineId: string | null = incident.contract_machine_id
  let machineSerie: string | null = incident.machine_id

  if (contractMachineId) {
    const { data: line, error: lineErr } = await db
      .from('contract_machines')
      .select('machine_id')
      .eq('id', contractMachineId)
      .maybeSingle()
    if (lineErr) throw new Error(`contract_machines: ${lineErr.message}`)
    if (line) machineSerie = line.machine_id
  } else if (machineSerie) {
    // Incidencia pública (sin contract_machine_id): la línea vigente hoy de esa máquina, igual
    // que getOpenLineForMachine (src/lib/contract-machines.ts) — solo para hallar al cliente,
    // el número de serie ya lo tenemos directo de la incidencia.
    const { data: openLine, error: openErr } = await db
      .from('contract_machines')
      .select('id')
      .eq('machine_id', machineSerie)
      .is('date_fin', null)
      .maybeSingle()
    if (openErr) throw new Error(`contract_machines (línea abierta): ${openErr.message}`)
    contractMachineId = openLine?.id ?? null
  }

  const [machineQuartier, client] = await Promise.all([
    loadMachineQuartier(db, machineSerie),
    loadClient(db, contractMachineId),
  ])
  const quartier = await loadQuartierLabel(db, machineQuartier ?? client?.quartier_code ?? null)

  return {
    kind: row.kind,
    entityType: 'incident',
    entityId: row.entity_id,
    clientName: client?.nom_client ?? null,
    quartier,
    incidentTitle: incident.title,
    incidentNumero: incident.numero_incident,
    priority: incident.priority,
    scheduledDate: null,
    machineSerie,
  }
}

async function loadVisitContext(db: SupabaseClient, row: QueueRow): Promise<PushContext | null> {
  const { data: visit, error } = await db
    .from('maintenance_visits')
    .select('id, scheduled_date, contract_machine_id')
    .eq('id', row.entity_id)
    .maybeSingle()
  if (error) throw new Error(`maintenance_visits: ${error.message}`)
  if (!visit) return null

  const contractMachineId: string = visit.contract_machine_id
  const { data: line, error: lineErr } = await db
    .from('contract_machines')
    .select('machine_id')
    .eq('id', contractMachineId)
    .maybeSingle()
  if (lineErr) throw new Error(`contract_machines: ${lineErr.message}`)
  const machineSerie: string | null = line?.machine_id ?? null

  const [machineQuartier, client] = await Promise.all([
    loadMachineQuartier(db, machineSerie),
    loadClient(db, contractMachineId),
  ])
  const quartier = await loadQuartierLabel(db, machineQuartier ?? client?.quartier_code ?? null)

  return {
    kind: row.kind,
    entityType: 'visit',
    entityId: row.entity_id,
    clientName: client?.nom_client ?? null,
    quartier,
    incidentTitle: null,
    incidentNumero: null,
    priority: null,
    scheduledDate: visit.scheduled_date,
    machineSerie,
  }
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

/** Cliente (nombre + barrio de respaldo) de la línea contract_machines → contracts → clients. */
async function loadClient(
  db: SupabaseClient,
  contractMachineId: string | null,
): Promise<{ nom_client: string; quartier_code: string | null } | null> {
  if (!contractMachineId) return null
  const { data, error } = await db
    .from('contract_machines')
    .select('contracts(clients(nom_client, quartier_code))')
    .eq('id', contractMachineId)
    .maybeSingle()
  if (error) throw new Error(`contracts/clients: ${error.message}`)
  const contract = data?.contracts as { clients: { nom_client: string; quartier_code: string | null } | null } | null
  return contract?.clients ?? null
}

/** `quartiers.label` a partir de su `code` (misma regla que el kiosko, src/lib/quartiers.ts). */
async function loadQuartierLabel(db: SupabaseClient, code: string | null): Promise<string | null> {
  if (!code) return null
  const { data, error } = await db.from('quartiers').select('label').eq('code', code).maybeSingle()
  if (error) throw new Error(`quartiers: ${error.message}`)
  return data?.label ?? null
}
