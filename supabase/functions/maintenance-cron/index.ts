// Desplegar con: supabase functions deploy maintenance-cron --no-verify-jwt
// Exige la cabecera `x-cron-secret` (= secreto MAINTENANCE_CRON_SECRET, comparación en tiempo
// constante); sin ella, o si no coincide, responde 401. Solo la llama pg_cron, que lee el mismo
// secreto de Vault (`maintenance_cron_secret`, migración 20260930170000).

import 'jsr:@supabase/functions-js/edge-runtime.d.ts'
import { createClient } from 'npm:@supabase/supabase-js'
import { getSecretKey, timingSafeEqual } from '../_shared/secret-key.ts'

const SUPABASE_URL  = Deno.env.get('SUPABASE_URL')!
const SERVICE_KEY   = getSecretKey()
const CRON_SECRET   = Deno.env.get('MAINTENANCE_CRON_SECRET') ?? ''
const HOMESERVER    = Deno.env.get('MATRIX_HOMESERVER_URL')!
const BOT_TOKEN     = Deno.env.get('MATRIX_ACCESS_TOKEN')!
const ROOM_ID       = Deno.env.get('MATRIX_MAINTENANCE_ROOM_ID')!

async function sendMatrix(message: string): Promise<void> {
  if (!HOMESERVER || !BOT_TOKEN || !ROOM_ID) {
    console.warn('[Matrix] Variables manquantes, notification ignorée')
    return
  }
  const txnId = Date.now()
  await fetch(
    `${HOMESERVER}/_matrix/client/v3/rooms/${encodeURIComponent(ROOM_ID)}/send/m.room.message/${txnId}`,
    {
      method: 'PUT',
      headers: { 'Authorization': `Bearer ${BOT_TOKEN}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ msgtype: 'm.text', body: message }),
    },
  ).catch(err => console.error('[Matrix]', err.message))
}

Deno.serve(async (req: Request) => {
  const provided = req.headers.get('x-cron-secret') ?? ''
  if (!CRON_SECRET) {
    console.error('[maintenance-cron] MAINTENANCE_CRON_SECRET no configurado')
  }
  if (!CRON_SECRET || !timingSafeEqual(provided, CRON_SECRET)) {
    return new Response(JSON.stringify({ error: 'Non autorisé' }), {
      status: 401, headers: { 'Content-Type': 'application/json' },
    })
  }

  const db = createClient(SUPABASE_URL, SERVICE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  })

  const today = new Date()
  today.setUTCHours(0, 0, 0, 0)
  const todayStr = today.toISOString().split('T')[0]

  const alertLimit = new Date(today)
  alertLimit.setDate(alertLimit.getDate() + 3)
  const alertLimitStr = alertLimit.toISOString().split('T')[0]

  const results: string[] = []
  const errors:  string[] = []

  // 1. Marcar visitas atrasadas
  const { error: overdueErr } = await db
    .from('maintenance_visits')
    .update({ status: 'en_retard' })
    .lt('scheduled_date', todayStr)
    .eq('status', 'planifié')

  if (overdueErr) errors.push(`Overdue update: ${overdueErr.message}`)
  else results.push('Visites en retard mises à jour')

  // 2. Charger visites à notifier (aujourd'hui + 3 jours, pas encore notifiées)
  const { data: visits, error: fetchErr } = await db
    .from('maintenance_visits')
    .select(`
      id, scheduled_date, status,
      maintenance_plans ( frequency, notes ),
      contract_machines (
        machines ( numero_serie, marque, modele ),
        contracts ( numero_contrat, clients ( nom_client ) )
      )
    `)
    .gte('scheduled_date', todayStr)
    .lte('scheduled_date', alertLimitStr)
    .eq('matrix_notified', false)
    .in('status', ['planifié', 'en_retard'])

  if (fetchErr) {
    errors.push(`Fetch visits: ${fetchErr.message}`)
    return new Response(JSON.stringify({ results, errors }), { headers: { 'Content-Type': 'application/json' } })
  }

  for (const visit of visits ?? []) {
    try {
      const plan     = visit.maintenance_plans as any
      const line     = visit.contract_machines as any
      const contract = line?.contracts as any
      const client   = contract?.clients as any
      const machine  = line?.machines as any

      const dateFormatted = new Date(visit.scheduled_date + 'T00:00:00')
        .toLocaleDateString('fr-FR')

      const isOverdue = visit.status === 'en_retard'

      const lines = [
        isOverdue
          ? `⚠️ MAINTENANCE EN RETARD — ${dateFormatted}`
          : `🔧 MAINTENANCE PLANIFIÉE — ${dateFormatted}`,
        `Client  : ${client?.nom_client ?? '—'}`,
        `Machine : ${machine?.marque ?? ''} ${machine?.modele ?? ''} (${machine?.numero_serie ?? '—'})`,
        `Contrat : ${contract?.numero_contrat ?? '—'}`,
        `Fréq.   : ${plan?.frequency === 'mensuel' ? 'Mensuelle' : 'Trimestrielle'}`,
      ]

      if (plan?.notes) lines.push(`Notes   : ${plan.notes}`)
      lines.push('')
      lines.push('Qui prend en charge ?')

      // Marcar como notificado ANTES de enviar, solo si nadie lo hizo ya: dos ejecuciones
      // simultáneas no pueden reclamar la misma visita ni enviar el mensaje dos veces.
      const { data: claimed, error: updateErr } = await db
        .from('maintenance_visits')
        .update({ matrix_notified: true })
        .eq('id', visit.id)
        .eq('matrix_notified', false)
        .select('id')

      if (updateErr) {
        errors.push(`Update visit ${visit.id}: ${updateErr.message}`)
        continue
      }
      if (!claimed || claimed.length === 0) continue

      await sendMatrix(lines.join('\n'))
      results.push(`Notifié: ${machine?.numero_serie ?? visit.id} — ${dateFormatted}`)

    } catch (err) {
      errors.push(`Visit ${visit.id}: ${(err as Error).message}`)
    }
  }

  if ((visits ?? []).length === 0) results.push('Aucune visite à notifier')

  return new Response(
    JSON.stringify({ results, errors, date: todayStr }),
    { headers: { 'Content-Type': 'application/json' } },
  )
})
