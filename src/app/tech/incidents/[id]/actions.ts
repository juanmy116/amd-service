'use server'

import { createClient } from '@/lib/supabase/server'
import { INCIDENT_STATUSES, parseEnum } from '@/lib/enums'
import type { TablesUpdate } from '@/lib/supabase/types'
import { redirect } from 'next/navigation'
import { sendCsatForIncident } from '@/lib/csat'
import { PARTS } from '@/lib/parts'

type FormState = { error: string } | null

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

  const new_status = parseEnum(formData.get('status'),     INCIDENT_STATUSES)
  const old_status = parseEnum(formData.get('old_status'), INCIDENT_STATUSES)
  if (!new_status) return { error: 'Statut invalide.' }
  if (!old_status) return { error: 'Statut actuel invalide.' }

  const rapport           = (formData.get('rapport') as string).trim() || null
  const autres_pieces     = (formData.get('autres_pieces') as string).trim() || null
  const comment           = (formData.get('comment') as string)?.trim() || null

  const updates: TablesUpdate<'incidents'> = { status: new_status, assigned_to: user.id }
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

  // Piezas reemplazadas (con cantidad). Se reemplaza el set completo de forma
  // atómica vía RPC: borra las existentes y reinserta las marcadas en una sola
  // transacción (desmarcar todas vacía la lista). El RPC es SECURITY INVOKER:
  // respeta la RLS del técnico sobre incident_parts.
  const selectedParts = PARTS
    .filter((p) => formData.get(`part_${p.id}`) === 'on')
    .map((p) => {
      const raw = Number(formData.get(`qty_${p.id}`))
      const quantity = Number.isInteger(raw) && raw > 0 ? raw : 1
      return { part_id: p.id, quantity }
    })
  const { error: partsError } = await supabase.rpc('set_incident_parts', {
    p_incident_id: id,
    p_parts: selectedParts,
  })
  if (partsError) {
    console.error('[submitIntervention.parts]', partsError)
    return { error: 'Erreur lors de l\'enregistrement des pièces. Veuillez réessayer.' }
  }

  if (new_status === 'résolu' && old_status !== 'résolu') {
    sendCsatForIncident(id).catch(console.error)
  }

  redirect('/tech')
}
