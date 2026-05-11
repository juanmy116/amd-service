'use server'

import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'

type FormState = { error: string } | null

const PART_IDS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]

async function notifyMatrix(message: string): Promise<void> {
  const homeserver = process.env.MATRIX_HOMESERVER_URL
  const token      = process.env.MATRIX_ACCESS_TOKEN
  const roomId     = process.env.MATRIX_MAINTENANCE_ROOM_ID
  if (!homeserver || !token || !roomId) return
  const txnId = Date.now()
  await fetch(
    `${homeserver}/_matrix/client/v3/rooms/${encodeURIComponent(roomId)}/send/m.room.message/${txnId}`,
    {
      method: 'PUT',
      headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ msgtype: 'm.text', body: message }),
    },
  ).catch(err => console.error('[Matrix]', err))
}

export async function closeMaintenance(
  visitId: string,
  serie: string,
  _prev: FormState,
  formData: FormData
): Promise<FormState> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')
  const { data: profile } = await supabase
    .from('profiles')
    .select('role, full_name')
    .eq('id', user.id)
    .single()
  if (!profile || !['admin', 'technician'].includes(profile.role)) redirect('/login')

  // Cargar visita con plan y contrato
  const { data: visit } = await supabase
    .from('maintenance_visits')
    .select(`
      id, status, scheduled_date, plan_id,
      maintenance_plans (
        frequency, notes,
        contracts (
          numero_contrat,
          clients  ( nom_client ),
          machines ( numero_serie, marque, modele )
        )
      )
    `)
    .eq('id', visitId)
    .single()

  if (!visit) return { error: 'Visite introuvable.' }
  if (visit.status === 'fait') return { error: 'Cette visite est déjà clôturée.' }

  const notes = ((formData.get('notes') as string) ?? '').trim() || null

  // Cerrar visita
  const { error: visitErr } = await supabase
    .from('maintenance_visits')
    .update({
      status:       'fait',
      done_at:      new Date().toISOString(),
      done_by:      user.id,
      qr_verified:  true,
      notes,
    })
    .eq('id', visitId)

  if (visitErr) return { error: 'Erreur lors de la clôture de la visite.' }

  // Guardar piezas reemplazadas
  const partsToInsert = PART_IDS
    .filter(id => formData.get(`part_${id}`) === 'on')
    .map(id => ({ visit_id: visitId, part_id: id, quantity: 1 }))

  const autresPieces = ((formData.get('autres_pieces') as string) ?? '').trim()
  if (autresPieces) {
    partsToInsert.push({ visit_id: visitId, part_id: null as any, quantity: 1 } as any)
    // insertar como descripción libre
    await supabase.from('maintenance_parts').insert({
      visit_id: visitId, description: autresPieces, quantity: 1,
    })
  }

  if (partsToInsert.length > 0) {
    await supabase.from('maintenance_parts').insert(partsToInsert)
  }

  // Auto-programar siguiente visita
  const plan = visit.maintenance_plans as any
  const days = plan?.frequency === 'mensuel' ? 30 : 90
  const base = new Date(visit.scheduled_date + 'T00:00:00')
  base.setDate(base.getDate() + days)
  const nextDateStr = base.toISOString().split('T')[0]

  await supabase.from('maintenance_visits').insert({
    plan_id:        visit.plan_id,
    scheduled_date: nextDateStr,
    status:         'planifié',
  })

  // Notificación Matrix de cierre
  const contract = plan?.contracts as any
  const machine  = contract?.machines as any
  const client   = contract?.clients as any
  const nextFmt  = new Date(nextDateStr + 'T00:00:00').toLocaleDateString('fr-FR')

  await notifyMatrix([
    '✅ MAINTENANCE EFFECTUÉE',
    `Client     : ${client?.nom_client ?? '—'}`,
    `Machine    : ${machine?.marque ?? ''} ${machine?.modele ?? ''} (${machine?.numero_serie ?? serie})`,
    `Technicien : ${profile.full_name ?? user.email}`,
    `Prochaine  : ${nextFmt}`,
    partsToInsert.length > 0 ? `Pièces     : ${partsToInsert.length} remplacée(s)` : '',
  ].filter(Boolean).join('\n'))

  redirect(`/tech/scan/${encodeURIComponent(serie)}`)
}
