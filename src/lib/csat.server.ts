import { createAdminClient } from './supabase/admin'
import { sendEmail } from './email'
import { resolveCsatRecipient } from './csat'

/** Email de la cuenta de portal del cliente dueño de la línea de contrato, si existe. */
async function portalEmailForLine(
  admin: ReturnType<typeof createAdminClient>,
  contractMachineId: string | null,
): Promise<string | null> {
  if (!contractMachineId) return null

  const { data: line } = await admin
    .from('contract_machines')
    .select('contracts(client_id)')
    .eq('id', contractMachineId)
    .single()

  const clientId = line?.contracts?.client_id ?? null
  if (!clientId) return null

  const { data: cp } = await admin
    .from('client_profiles')
    .select('profile_id')
    .eq('client_id', clientId)
    .maybeSingle()

  if (!cp?.profile_id) return null

  const { data: { user } } = await admin.auth.admin.getUserById(cp.profile_id)
  return user?.email ?? null
}

/** Etiqueta legible del equipo: «Ricoh MP-C3004 · V9314505033». Null si no se puede resolver. */
async function machineLabel(
  admin: ReturnType<typeof createAdminClient>,
  incidentMachineId: string | null,
  contractMachineId: string | null,
): Promise<string | null> {
  let serie = incidentMachineId

  if (!serie && contractMachineId) {
    const { data: line } = await admin
      .from('contract_machines')
      .select('machine_id')
      .eq('id', contractMachineId)
      .single()
    serie = line?.machine_id ?? null
  }

  if (!serie) return null

  const { data: machine } = await admin
    .from('machines')
    .select('marque, modele')
    .eq('numero_serie', serie)
    .maybeSingle()

  if (!machine) return serie
  return `${machine.marque} ${machine.modele} · ${serie}`
}

export async function sendCsatForIncident(incidentId: string): Promise<void> {
  const admin = createAdminClient()

  const { data: existing } = await admin
    .from('csat_responses')
    .select('token, responded_at')
    .eq('incident_id', incidentId)
    .maybeSingle()

  if (existing?.responded_at) return

  const { data: incident } = await admin
    .from('incidents')
    .select('id, title, numero_incident, contact_name, contact_email, machine_id, contract_machine_id')
    .eq('id', incidentId)
    .single()

  if (!incident) return

  // Antes había aquí un corte por `contract_machine_id` que descartaba TODAS las incidencias
  // del QR público (van por machine_id). Era la razón de que nunca saliera una sola encuesta.
  const portalEmail = await portalEmailForLine(admin, incident.contract_machine_id)
  const recipient = resolveCsatRecipient(incident.contact_email, portalEmail)

  if (!recipient) {
    // Sin destinatario no hay encuesta, pero que quede rastro visible en la ficha:
    // un fallo silencioso es lo que mantuvo esto roto durante meses.
    await admin.from('incident_history').insert({
      incident_id: incidentId,
      changed_by:  null,
      old_status:  null,
      new_status:  null,
      comment:     'Enquête de satisfaction non envoyée — aucune adresse email',
    })
    return
  }

  let token: string
  if (existing) {
    token = existing.token
  } else {
    const { data: csat } = await admin
      .from('csat_responses')
      .insert({ incident_id: incidentId })
      .select('token')
      .single()
    if (!csat?.token) return
    token = csat.token
  }

  const appUrl  = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000'
  const csatUrl = `${appUrl}/csat/${token}`
  const equipement = await machineLabel(admin, incident.machine_id, incident.contract_machine_id)

  await sendEmail({
    template: 'csat',
    to: recipient.email,
    data: {
      title:       incident.title,
      csat_url:    csatUrl,
      reference:   incident.numero_incident ?? '',
      client_name: incident.contact_name ?? '',
      equipement:  equipement ?? '',
    },
  })

  await admin
    .from('csat_responses')
    .update({ sent_to: recipient.email, sent_at: new Date().toISOString() })
    .eq('incident_id', incidentId)

  const { data: closed } = await admin
    .from('incidents')
    .update({ status: 'fermé', closed_at: new Date().toISOString() })
    .eq('id', incidentId)
    .eq('status', 'résolu')
    .select('id')

  if (closed && closed.length > 0) {
    await admin.from('incident_history').insert({
      incident_id: incidentId,
      changed_by: null,
      old_status: 'résolu',
      new_status: 'fermé',
      comment: 'Fermé automatiquement — email CSAT envoyé',
    })
  }
}
