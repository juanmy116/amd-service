'use server'

import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { sendCsatForIncident } from '@/lib/csat'

type FormState = { error: string } | null

const PARTS = [
  { id: 1, name: 'Four' }, { id: 2, name: 'Transfer Belt' },
  { id: 3, name: 'Tambour BK' }, { id: 4, name: 'Tambour C' },
  { id: 5, name: 'Tambour M' }, { id: 6, name: 'Tambour Y' },
  { id: 7, name: 'Toner BK' }, { id: 8, name: 'Toner C' },
  { id: 9, name: 'Toner M' }, { id: 10, name: 'Toner Y' },
  { id: 11, name: 'Cassette' }, { id: 12, name: 'Rouleau Pression' },
]

export async function submitInterventionAction(
  id: string,
  _prev: FormState,
  formData: FormData
): Promise<FormState> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  // Verificar que el incidente esté asignado a este técnico
  const { data: incident } = await supabase
    .from('incidents')
    .select('assigned_to, status')
    .eq('id', id)
    .single()
  if (!incident) return { error: 'Incident introuvable.' }
  if (incident.assigned_to !== user.id) return { error: 'Non autorisé.' }

  const new_status        = formData.get('status')           as string
  const old_status        = formData.get('old_status')       as string
  const rapport           = (formData.get('rapport') as string).trim() || null
  const autres_pieces     = (formData.get('autres_pieces') as string).trim() || null
  const comment           = (formData.get('comment') as string)?.trim() || null

  const updates: Record<string, unknown> = { status: new_status, assigned_to: user.id }
  if (rapport)       updates.rapport_intervention = rapport
  if (autres_pieces) updates.autres_pieces = autres_pieces
  if (new_status === 'résolu' && old_status !== 'résolu') updates.resolved_at = new Date().toISOString()
  if (new_status === 'fermé'  && old_status !== 'fermé')  updates.closed_at   = new Date().toISOString()

  const { error } = await supabase.from('incidents').update(updates).eq('id', id)
  if (error) {
    console.error('[submitIntervention]', error)
    return { error: 'Une erreur est survenue. Veuillez réessayer.' }
  }

  // Historial
  if (new_status !== old_status) {
    await supabase.from('incident_history').insert({
      incident_id: id, changed_by: user.id,
      old_status, new_status, comment,
    })
  }

  // Piezas reemplazadas
  const selectedParts = PARTS.filter((p) => formData.get(`part_${p.id}`) === 'on').map((p) => p.id)
  if (selectedParts.length > 0) {
    await supabase.from('incident_parts').delete().eq('incident_id', id)
    await supabase.from('incident_parts').insert(
      selectedParts.map((part_id) => ({ incident_id: id, part_id }))
    )
  }

  if (new_status === 'résolu' && old_status !== 'résolu') {
    sendCsatForIncident(id).catch(console.error)
  }

  redirect('/tech')
}
