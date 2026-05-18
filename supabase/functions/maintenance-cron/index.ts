import 'jsr:@supabase/functions-js/edge-runtime.d.ts'
import { createClient } from 'npm:@supabase/supabase-js'
import { getSecretKey } from '../_shared/secret-key.ts'

const SUPABASE_URL  = Deno.env.get('SUPABASE_URL')!
const SERVICE_KEY   = getSecretKey()
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

Deno.serve(async () => {
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
      maintenance_plans (
        frequency, notes,
        contracts (
          numero_contrat,
          clients  ( nom_client ),
          machines ( numero_serie, marque, modele )
        )
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
      const contract = plan?.contracts as any
      const client   = contract?.clients as any
      const machine  = contract?.machines as any

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

      await sendMatrix(lines.join('\n'))

      // Marcar como notificado
      const { error: updateErr } = await db
        .from('maintenance_visits')
        .update({ matrix_notified: true })
        .eq('id', visit.id)

      if (updateErr) errors.push(`Update visit ${visit.id}: ${updateErr.message}`)
      else results.push(`Notifié: ${machine?.numero_serie ?? visit.id} — ${dateFormatted}`)

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
