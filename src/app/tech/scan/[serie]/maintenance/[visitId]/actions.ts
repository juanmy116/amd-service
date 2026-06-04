'use server'

import { requireTechnician } from '@/lib/auth'
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
  const { user, profile, supabase } = await requireTechnician()

  // Cargar visita con su línea de contrato (modelo N máquinas).
  const { data: visit } = await supabase
    .from('maintenance_visits')
    .select(`
      id, status, scheduled_date, plan_id, contract_machine_id,
      maintenance_plans ( frequency, notes ),
      contract_machines (
        machine_id,
        maintenance_frequency_override,
        machines ( numero_serie, marque, modele ),
        contracts ( numero_contrat, clients ( nom_client ) )
      )
    `)
    .eq('id', visitId)
    .single()

  if (!visit) return { error: 'Visite introuvable.' }

  // Verificar que la visita pertenece a la máquina escaneada.
  const line = visit.contract_machines as unknown as {
    machine_id: string
    maintenance_frequency_override: 'mensuel' | 'trimestriel' | null
    machines: { numero_serie: string; marque: string; modele: string } | null
    contracts: { numero_contrat: string; clients: { nom_client: string } | null } | null
  } | null

  if (line?.machine_id !== serie) return { error: 'Visite introuvable.' }
  if (visit.status === 'fait') return { error: 'Cette visite est déjà clôturée.' }

  const notes = ((formData.get('notes') as string) ?? '').trim() || null

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

  // Piezas reemplazadas.
  const partsToInsert = PART_IDS
    .filter(id => formData.get(`part_${id}`) === 'on')
    .map(id => ({ visit_id: visitId, part_id: id, quantity: 1 }))

  const autresPieces = ((formData.get('autres_pieces') as string) ?? '').trim()
  if (autresPieces) {
    await supabase.from('maintenance_parts').insert({
      visit_id: visitId, description: autresPieces, quantity: 1,
    })
  }
  if (partsToInsert.length > 0) {
    await supabase.from('maintenance_parts').insert(partsToInsert)
  }

  // Auto-programar siguiente visita para LA MISMA máquina.
  // Frecuencia: override de la línea, si no la del plan.
  const plan = visit.maintenance_plans as unknown as { frequency: string; notes: string | null } | null
  const effectiveFreq = line?.maintenance_frequency_override ?? plan?.frequency
  const days = effectiveFreq === 'mensuel' ? 30 : 90
  const base = new Date(visit.scheduled_date + 'T00:00:00')
  base.setDate(base.getDate() + days)
  const nextDateStr = base.toISOString().split('T')[0]

  await supabase.from('maintenance_visits').insert({
    plan_id:             visit.plan_id,
    contract_machine_id: visit.contract_machine_id,
    scheduled_date:      nextDateStr,
    status:              'planifié',
  })

  // Notificación Matrix de cierre.
  const machine = line?.machines
  const client  = line?.contracts?.clients
  const nextFmt = new Date(nextDateStr + 'T00:00:00').toLocaleDateString('fr-FR')

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
