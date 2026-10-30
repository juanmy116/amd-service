'use server'

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import type { TablesUpdate } from '@/lib/supabase/types'
import { updateIncidentStatusAction } from '@/app/admin/incidents/kanban-actions'
import type { OfficeResolution } from '@/lib/resolution'
import { parseEnum } from '@/lib/enums'
import {
  PICKUP_REASONS, STAFF_INCIDENT_KINDS, cleanStaffDescription, validateStaffIncident,
} from '@/lib/staffIncident'
import { createStaffIncident } from '@/lib/staffIncident.server'

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
 * Se delega en la acción de /admin/incidents, que es la que sabe de historial, `resolved_at`,
 * envío del CSAT y borrado del rastro al reabrir — y la que lee el estado anterior de la base.
 * Nada de duplicar esas reglas.
 */
export async function setIncidentStatusAction(
  incidentId: string,
  newStatus: string,
  office?: OfficeResolution | null
): Promise<{ error?: string }> {
  const actor = await requireDispatcherActor()
  if (!actor) return { error: 'Non autorisé' }

  return updateIncidentStatusAction(incidentId, newStatus, office)
}

/** Una máquina en el buscador de la burbuja «+». */
export type AtelierMachineOption = {
  serie: string
  label: string
  clientName: string | null
  /** Tiene línea de contrato abierta: solo esas se pueden recoger. */
  inContract: boolean
}

/**
 * Máquinas para la ventana «+» del kiosko: todas las activas, con su cliente si están en
 * contrato. Se pide al abrir la ventana (no viaja con cada refresco del tablero) y se filtra
 * en el navegador: son unas pocas centenas.
 */
export async function listAtelierMachinesAction(): Promise<AtelierMachineOption[] | { error: string }> {
  const actor = await requireDispatcherActor()
  if (!actor) return { error: 'Non autorisé' }

  const admin = createAdminClient()

  // PostgREST corta cada respuesta en 1000 filas (`max_rows`): se pide por páginas para que,
  // con el parque completo cargado, las últimas series no desaparezcan del buscador sin avisar.
  const PAGE = 1000
  const park: { numero_serie: string | null; marque: string | null; modele: string | null; client_id: number | null; open_line_id: string | null }[] = []
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await admin
      .from('v_machine_park')
      .select('numero_serie, marque, modele, client_id, open_line_id')
      .eq('active', true)
      .order('numero_serie')
      .range(from, from + PAGE - 1)
    if (error) return { error: 'Impossible de charger les machines.' }
    park.push(...(data ?? []))
    if (!data || data.length < PAGE) break
  }

  // Todos los clientes y no `.in(ids)`: con cientos de ids la URL de la consulta se haría enorme.
  const clientName = new Map<number, string>()
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await admin.from('clients').select('id, nom_client').order('id').range(from, from + PAGE - 1)
    if (error) return { error: 'Impossible de charger les machines.' }
    for (const c of data ?? []) clientName.set(c.id, c.nom_client)
    if (!data || data.length < PAGE) break
  }

  return park
    .filter((m): m is typeof m & { numero_serie: string } => m.numero_serie !== null)
    .map((m) => ({
      serie:      m.numero_serie,
      label:      `${m.marque ?? ''} ${m.modele ?? ''}`.trim(),
      clientName: m.client_id !== null ? clientName.get(m.client_id) ?? null : null,
      inContract: m.open_line_id !== null,
    }))
}

export type AtelierIncidentInput = {
  serie: string
  kind: string
  reason: string | null
  description: string
  urgent: boolean
  technicianId: string | null
}

/**
 * Burbuja «+» del kiosko: crea una panne o una recogida (categoría `recuperation`). El
 * despachador puede asignarla ya; si no, entra `nouveau` sin técnico.
 */
export async function createAtelierIncidentAction(
  input: AtelierIncidentInput
): Promise<{ error: string } | { numeroIncident: string }> {
  const actor = await requireDispatcherActor()
  if (!actor) return { error: 'Non autorisé' }

  const kind = parseEnum(input.kind, STAFF_INCIDENT_KINDS)
  if (!kind) return { error: 'Type invalide.' }
  const reason = kind === 'recuperation' ? parseEnum(input.reason, PICKUP_REASONS) : null
  const description = cleanStaffDescription(input.description)
  const invalid = validateStaffIncident({ kind, reason, description })
  if (invalid) return { error: invalid }

  // El técnico llega del navegador: tiene que ser un técnico de campo de verdad (no la cuenta
  // del taller), los mismos que ofrece la lista del tablero.
  if (input.technicianId) {
    const { data: tech } = await createAdminClient()
      .from('profiles')
      .select('role, is_dispatcher')
      .eq('id', input.technicianId)
      .maybeSingle()
    if (tech?.role !== 'technician' || tech.is_dispatcher) return { error: 'Technicien invalide.' }
  }

  const result = await createStaffIncident({
    serie:          typeof input.serie === 'string' ? input.serie.trim() : '',
    kind,
    reason,
    description,
    urgent:         kind === 'panne' && input.urgent === true,
    openedBy:       actor.userId,
    assignedTo:     input.technicianId || null,
    historyComment: kind === 'recuperation' ? 'Récupération créée depuis l\'atelier' : 'Panne créée depuis l\'atelier',
  })
  if ('error' in result) return result
  return { numeroIncident: result.numeroIncident }
}
