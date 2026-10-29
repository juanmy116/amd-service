import 'server-only'

import { createAdminClient } from './supabase/admin'
import type { TablesInsert } from './supabase/types'
import { getOpenLineForMachine } from './contract-machines'
import { staffIncidentTitle, type PickupReason, type StaffIncidentKind } from './staffIncident'

export type StaffIncidentInput = {
  serie: string
  kind: StaffIncidentKind
  reason: PickupReason | null
  description: string
  urgent: boolean
  openedBy: string
  /** Solo el kiosko asigna al crear. Con técnico entra `assigné` (y le llega el push). */
  assignedTo: string | null
  /** Texto de la primera línea del historial: dice desde dónde se creó. */
  historyComment: string
}

export type StaffIncidentResult = { error: string } | { id: string; numeroIncident: string }

/**
 * Crea la avería con service_role. Quien llama ya ha comprobado el permiso (técnico con
 * `can_create_incidents`, o despachador del kiosko): aquí no hay RLS que lo haga.
 *
 * Misma regla que el formulario del QR (`/signaler`): si la máquina tiene línea de contrato
 * abierta, la avería se cuelga de ella (así todas las pantallas encuentran cliente y contrato);
 * si está en el almacén, se guarda solo la máquina (XOR de `incidents`). Una recogida, en cambio,
 * exige contrato: no se recoge una máquina que ya está en el almacén.
 */
export async function createStaffIncident(input: StaffIncidentInput): Promise<StaffIncidentResult> {
  const admin = createAdminClient()

  const { data: machine } = await admin
    .from('machines')
    .select('numero_serie, marque, modele, active')
    .eq('numero_serie', input.serie)
    .maybeSingle()
  if (!machine || !machine.active) return { error: 'Machine introuvable ou retirée du parc.' }

  const openLine = await getOpenLineForMachine(admin, machine.numero_serie)
  if (input.kind === 'recuperation' && !openLine) {
    return { error: "Cette machine n'est dans aucun contrat : rien à récupérer." }
  }

  const status = input.assignedTo ? 'assigné' : 'nouveau'

  const { data: incident, error } = await admin
    .from('incidents')
    .insert({
      contract_machine_id: openLine?.id ?? null,
      machine_id:          openLine ? null : machine.numero_serie,   // XOR con contract_machine_id
      opened_by:           input.openedBy,
      assigned_to:         input.assignedTo,
      title:               staffIncidentTitle(input.kind, machine, input.reason),
      description:         input.description || null,
      category:            input.kind,
      priority:            input.urgent ? 'urgente' : 'normale',
      status,
    } as TablesInsert<'incidents'>)   // numero_incident lo pone el trigger trg_set_incident_numero
    .select('id, numero_incident')
    .single()

  if (error || !incident) {
    console.error('[createStaffIncident]', error)
    return { error: 'Une erreur est survenue. Veuillez réessayer.' }
  }

  const { error: historyError } = await admin.from('incident_history').insert({
    incident_id: incident.id,
    changed_by:  input.openedBy,
    old_status:  null,
    new_status:  status,
    comment:     input.historyComment,
  })
  // La avería ya existe: un historial que falla no la deshace.
  if (historyError) console.error('[createStaffIncident] history', historyError)

  return { id: incident.id, numeroIncident: incident.numero_incident }
}
