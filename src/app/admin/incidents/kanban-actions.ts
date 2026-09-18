'use server'

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { INCIDENT_STATUSES, RESOLUTION_REASONS, parseEnum } from '@/lib/enums'
import type { TablesUpdate } from '@/lib/supabase/types'
import { sendCsatForIncident } from '@/lib/csat.server'
import { buildResolution, clearResolution, reopens, type OfficeResolution } from '@/lib/resolution'
import { after } from 'next/server'

/**
 * Cambia el estado de una avería desde el tablero (kanban de admin, kanban del kiosko y ficha
 * del kiosko, que delega aquí).
 *
 * El estado anterior NO lo manda el cliente: el tablero de la TV del taller puede llevar
 * minutos abierto y arrastrar una tarjeta con datos viejos, y de ese estado dependen el
 * historial, el `resolved_at` y el envío de la encuesta.
 */
export async function updateIncidentStatusAction(
  incidentId: string,
  newStatus: string,
  office?: OfficeResolution | null
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

  const { data: current } = await admin
    .from('incidents')
    .select('status')
    .eq('id', incidentId)
    .single()
  if (!current) return { error: 'Incident introuvable' }

  const oldStatus = current.status
  if (oldStatus === status) return {}

  const updates: TablesUpdate<'incidents'> = { status }

  // Verrou de résolution: desde el tablero no se resuelve sin decir por qué. La ventana que
  // pide el motivo la pone la interfaz, pero la regla se aplica aquí — arrastrar una tarjeta
  // es un `fetch` como cualquier otro y no se puede confiar en que el navegador haya pasado
  // por el formulario.
  if (status === 'résolu') {
    const resolution = buildResolution({
      via: 'bureau',
      reason: parseEnum(office?.reason, RESOLUTION_REASONS),
      note: office?.note,
      technicianId: office?.technicianId ?? null,
    })
    if (!resolution.ok) return { error: resolution.error }
    Object.assign(updates, resolution.fields)
  }

  if (status === 'résolu' && oldStatus !== 'résolu') updates.resolved_at = new Date().toISOString()
  if (status === 'fermé'  && oldStatus !== 'fermé')  updates.closed_at   = new Date().toISOString()

  // Reabrir borra el rastro de la resolución anterior. Sin esto, devolver una tarjeta a «En
  // cours» y volver a arrastrarla a «Résolu» dejaba la avería con el informe y el escaneo de
  // la intervención de antes: indistinguible de una segunda intervención real.
  if (reopens(oldStatus, status)) Object.assign(updates, clearResolution())

  const { error } = await admin.from('incidents').update(updates).eq('id', incidentId)
  if (error) return { error: error.message }

  await admin.from('incident_history').insert({
    incident_id: incidentId,
    changed_by:  user.id,
    old_status:  oldStatus,
    new_status:  status,
    comment:     null,
  })

  // `after()` difiere el envío a DESPUÉS de la respuesta: sin él, el `return` de
  // abajo puede dar por terminada la función serverless con el envío a medias
  // (ni correo, ni fila, ni rastro). El `.catch` evita que un fallo del envío
  // tumbe la acción del usuario.
  if (status === 'résolu' && oldStatus !== 'résolu') {
    after(() => sendCsatForIncident(incidentId).catch(console.error))
  }

  return {}
}
