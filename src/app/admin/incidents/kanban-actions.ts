'use server'

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { INCIDENT_STATUSES, parseEnum } from '@/lib/enums'
import type { TablesUpdate } from '@/lib/supabase/types'
import { sendCsatForIncident } from '@/lib/csat.server'
import { after } from 'next/server'

export async function updateIncidentStatusAction(
  incidentId: string,
  oldStatus: string,
  newStatus: string
): Promise<{ error?: string }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Non authentifié' }

  const { data: caller } = await supabase
    .from('profiles')
    .select('role, is_dispatcher')
    .eq('id', user.id)
    .single()
  if (caller?.role !== 'admin' && caller?.is_dispatcher !== true) {
    return { error: 'Non autorisé' }
  }

  const status = parseEnum(newStatus, INCIDENT_STATUSES)
  if (!status) return { error: 'Statut invalide' }

  const admin = createAdminClient()

  const updates: TablesUpdate<'incidents'> = { status }
  if (newStatus === 'résolu' && oldStatus !== 'résolu') updates.resolved_at = new Date().toISOString()
  if (newStatus === 'fermé'  && oldStatus !== 'fermé')  updates.closed_at   = new Date().toISOString()

  const { error } = await admin.from('incidents').update(updates).eq('id', incidentId)
  if (error) return { error: error.message }

  await admin.from('incident_history').insert({
    incident_id: incidentId,
    changed_by:  user.id,
    old_status:  oldStatus,
    new_status:  newStatus,
    comment:     null,
  })

  // `after()` difiere el envío a DESPUÉS de la respuesta: sin él, el `return` de
  // abajo puede dar por terminada la función serverless con el envío a medias
  // (ni correo, ni fila, ni rastro). El `.catch` evita que un fallo del envío
  // tumbe la acción del usuario.
  if (newStatus === 'résolu' && oldStatus !== 'résolu') {
    after(() => sendCsatForIncident(incidentId).catch(console.error))
  }

  return {}
}
