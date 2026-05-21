'use server'

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

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

  const updates: Record<string, unknown> = { assigned_to: technicianId }
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
