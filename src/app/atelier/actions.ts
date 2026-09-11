'use server'

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import type { TablesUpdate } from '@/lib/supabase/types'
import { updateIncidentStatusAction } from '@/app/admin/incidents/kanban-actions'

async function requireDispatcherActor(): Promise<{ userId: string } | null> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null
  const { data: caller } = await supabase
    .from('profiles')
    .select('role, is_dispatcher')
    .eq('id', user.id)
    .single()
  if (caller?.role !== 'admin' && caller?.is_dispatcher !== true) return null
  return { userId: user.id }
}

export async function assignIncidentAction(
  incidentId: string,
  technicianId: string | null
): Promise<{ error?: string }> {
  const actor = await requireDispatcherActor()
  if (!actor) return { error: 'Non autorisé' }

  const admin = createAdminClient()

  const { data: incident } = await admin
    .from('incidents')
    .select('status')
    .eq('id', incidentId)
    .single()
  if (!incident) return { error: 'Incident introuvable' }

  const updates: TablesUpdate<'incidents'> = { assigned_to: technicianId }
  const autoAssign = technicianId !== null && incident.status === 'nouveau'
  if (autoAssign) updates.status = 'assigné'

  const { error } = await admin.from('incidents').update(updates).eq('id', incidentId)
  if (error) return { error: error.message }

  if (autoAssign) {
    await admin.from('incident_history').insert({
      incident_id: incidentId,
      changed_by:  actor.userId,
      old_status:  'nouveau',
      new_status:  'assigné',
      comment:     null,
    })
  }

  return {}
}

export async function assignMaintenanceVisitAction(
  visitId: string,
  technicianId: string | null
): Promise<{ error?: string }> {
  const actor = await requireDispatcherActor()
  if (!actor) return { error: 'Non autorisé' }

  const admin = createAdminClient()
  const { error } = await admin
    .from('maintenance_visits')
    .update({ assigned_to: technicianId })
    .eq('id', visitId)
  if (error) return { error: error.message }

  return {}
}

/**
 * Cambia el estado desde la ficha del kiosko.
 *
 * En la vista carte ya no se arrastran tarjetas entre columnas, así que aquí no llega el estado
 * anterior: se lee de la base y se delega en la acción de /admin/incidents, que es la que sabe
 * de historial, `resolved_at` y envío del CSAT. Nada de duplicar esas reglas.
 */
export async function setIncidentStatusAction(
  incidentId: string,
  newStatus: string
): Promise<{ error?: string }> {
  const actor = await requireDispatcherActor()
  if (!actor) return { error: 'Non autorisé' }

  const admin = createAdminClient()
  const { data: incident } = await admin
    .from('incidents')
    .select('status')
    .eq('id', incidentId)
    .single()
  if (!incident) return { error: 'Incident introuvable' }
  if (incident.status === newStatus) return {}

  return updateIncidentStatusAction(incidentId, incident.status, newStatus)
}
