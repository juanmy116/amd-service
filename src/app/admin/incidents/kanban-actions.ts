'use server'

import { createClient } from '@/lib/supabase/server'
import { sendCsatForIncident } from '@/lib/csat'

export async function updateIncidentStatusAction(
  incidentId: string,
  oldStatus: string,
  newStatus: string
): Promise<{ error?: string }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  const updates: Record<string, unknown> = { status: newStatus }
  if (newStatus === 'résolu' && oldStatus !== 'résolu') updates.resolved_at = new Date().toISOString()
  if (newStatus === 'fermé'  && oldStatus !== 'fermé')  updates.closed_at   = new Date().toISOString()

  const { error } = await supabase.from('incidents').update(updates).eq('id', incidentId)
  if (error) return { error: error.message }

  if (user) {
    await supabase.from('incident_history').insert({
      incident_id: incidentId,
      changed_by:  user.id,
      old_status:  oldStatus,
      new_status:  newStatus,
      comment:     null,
    })
  }

  if (newStatus === 'résolu' && oldStatus !== 'résolu') {
    sendCsatForIncident(incidentId).catch(console.error)
  }

  return {}
}
