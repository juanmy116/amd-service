'use server'

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { INCIDENT_STATUSES, RESOLUTION_REASONS, parseEnum, type ResolutionReason } from '@/lib/enums'
import type { TablesUpdate } from '@/lib/supabase/types'
import { sendCsatForIncident } from '@/lib/csat.server'
import {
  archivedReportNote,
  buildResolution,
  clearResolution,
  historyComment,
  reopens,
  requiresOfficeResolution,
  isOpenStatus,
  finalResolutionStatus,
  RESOLUTION_REASON_LABELS,
  type OfficeResolution,
} from '@/lib/resolution'
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
    .select('status, resolved_via, rapport_intervention')
    .eq('id', incidentId)
    .single()
  if (!current) return { error: 'Incident introuvable' }

  const oldStatus = current.status
  if (oldStatus === status) return {}

  // Verrou de résolution: desde el tablero no se cierra una avería sin decir por qué. La
  // ventana que pide el motivo la pone la interfaz, pero la regla se aplica aquí — arrastrar
  // una tarjeta es un `fetch` como cualquier otro y no se puede confiar en que el navegador
  // haya pasado por el formulario.
  const isOffice = requiresOfficeResolution(oldStatus, status, current.resolved_via)

  // Lo que llega del navegador dice qué quiso hacer el usuario; lo que se escribe lo decide
  // esta acción: una resolución que no va a generar encuesta se archiva en el acto, porque
  // nada la sacaría después de «Résolu» (ver `finalResolutionStatus`).
  const viaAfter = isOffice ? 'bureau' : current.resolved_via
  const finalStatus = finalResolutionStatus(status, viaAfter)

  // Lo pedido no cambia nada: des-archivar una resolución de oficina la devuelve a «Fermé»,
  // que es donde ya estaba. La tarjeta vuelve a su sitio al refrescar y no se inventa una
  // línea de historial que diga «fermé → fermé».
  if (finalStatus === oldStatus) return {}

  const updates: TablesUpdate<'incidents'> = { status: finalStatus }
  let officeReason: ResolutionReason | null = null

  if (isOffice) {
    // El técnico acreditado se valida como el motivo: sin esto, una llamada a mano podría
    // apuntar el trabajo a un UUID cualquiera (violación de FK con el mensaje crudo de
    // Postgres en pantalla) o a un perfil de admin, que acabaría contando en el recuento por
    // técnico del panel.
    const technicianId = office?.technicianId ?? null
    if (technicianId) {
      const { data: tech } = await admin
        .from('profiles')
        .select('id')
        .eq('id', technicianId)
        .eq('role', 'technician')
        .maybeSingle()
      if (!tech) return { error: 'Technicien invalide' }
    }

    const resolution = buildResolution({
      via: 'bureau',
      reason: parseEnum(office?.reason, RESOLUTION_REASONS),
      note: office?.note,
      technicianId,
    })
    if (!resolution.ok) return { error: resolution.error }
    Object.assign(updates, resolution.fields)
    officeReason = resolution.fields.resolution_reason
  }

  // La avería quedó resuelta hoy aunque se archive en el mismo gesto: `resolved_at` es lo que
  // cuenta el marcador «Résolus cette semaine» del kiosko (`atelier/data.ts`).
  //
  // Solo cuenta si venía de un estado abierto. Documentar hoy una avería que ya estaba
  // resuelta o cerrada —arrastrar una vieja a «Résolu» para rellenarle el motivo— no puede
  // reescribir la fecha en que de verdad se arregló, o el marcador de la semana se infla.
  const resolvedNow = finalStatus === 'résolu' || isOffice
  if (resolvedNow && isOpenStatus(oldStatus)) updates.resolved_at = new Date().toISOString()
  if (finalStatus === 'fermé' && oldStatus !== 'fermé') updates.closed_at = new Date().toISOString()

  // Reabrir borra el rastro de la resolución anterior. Sin esto, devolver una tarjeta a «En
  // cours» y volver a arrastrarla a «Résolu» dejaba la avería con el informe y el escaneo de
  // la intervención de antes: indistinguible de una segunda intervención real.
  // Igual que en la puerta del técnico: el informe anterior se archiva en el historial antes
  // de borrarlo, para que la próxima resolución no pueda presentarlo como suyo.
  let archivedReport: string | null = null
  if (reopens(oldStatus, finalStatus)) {
    archivedReport = archivedReportNote(current.rapport_intervention)
    Object.assign(updates, clearResolution())
  }

  const { error } = await admin.from('incidents').update(updates).eq('id', incidentId)
  if (error) return { error: error.message }

  // Sin el motivo, el salto directo a «Fermé» parecería un archivado a secas; y esta fila
  // puede ser la única copia del informe anterior cuando se reabre. Las dos cosas caben, y el
  // fallo del insert no puede pasar en silencio.
  const { error: histErr } = await admin.from('incident_history').insert({
    incident_id: incidentId,
    changed_by:  user.id,
    old_status:  oldStatus,
    new_status:  finalStatus,
    comment:     historyComment(
      officeReason ? `Résolu au bureau — ${RESOLUTION_REASON_LABELS[officeReason]}` : null,
      archivedReport,
    ),
  })
  if (histErr) console.error('[updateIncidentStatus] historique', { incidentId, archivedReport, error: histErr })

  // `after()` difiere el envío a DESPUÉS de la respuesta: sin él, el `return` de
  // abajo puede dar por terminada la función serverless con el envío a medias
  // (ni correo, ni fila, ni rastro). El `.catch` evita que un fallo del envío
  // tumbe la acción del usuario.
  // Solo las intervenciones piden opinión al cliente; una resolución de oficina nunca llega
  // a `résolu`, y `sendCsatForIncident` lo vuelve a comprobar por su cuenta.
  if (finalStatus === 'résolu' && oldStatus !== 'résolu') {
    after(() => sendCsatForIncident(incidentId).catch(console.error))
  }

  return {}
}
