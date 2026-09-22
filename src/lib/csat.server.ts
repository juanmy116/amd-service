import { createAdminClient } from './supabase/admin'
import { sendEmail } from './email'
import { csatExpiresAt, isSurveyStillValid, resolveCsatRecipient } from './csat'
import { sendsSurvey } from './resolution'

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
    .select('token, responded_at, sent_at, expires_at')
    .eq('incident_id', incidentId)
    .maybeSingle()

  if (existing?.responded_at) return

  // Ya se envió y el enlace sigue vigente: reenviarlo solo duplicaría el email del cliente
  // y pisaría `sent_to`/`sent_at`. No es un fallo, así que no deja rastro.
  if (isSurveyStillValid(existing?.sent_at, existing?.expires_at)) return

  const { data: incident } = await admin
    .from('incidents')
    .select('id, title, numero_incident, contact_name, contact_email, machine_id, contract_machine_id, resolved_via')
    .eq('id', incidentId)
    .single()

  if (!incident) return

  // Verrou de résolution: la encuesta pregunta por la INTERVENCIÓN, no por el cierre. Mandarla
  // tras una resolución de oficina —una falsa alerta de Princity, un duplicado, algo resuelto
  // por teléfono— sería pedirle al cliente que puntúe la visita de un técnico que no fue.
  if (!sendsSurvey(incident.resolved_via)) {
    // Sin vía marcada no es un cierre de oficina: es una puerta que no dejó rastro. No se
    // molesta al cliente, pero que quede en el registro hasta que el candado del PR-4 lo
    // haga imposible.
    if (incident.resolved_via === null) {
      console.warn('[csat] résolution sans trace — enquête non envoyée', { incidentId })
    }
    return
  }

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
    const { data: csat, error } = await admin
      .from('csat_responses')
      .insert({ incident_id: incidentId })
      .select('token')
      .single()
    if (!csat?.token) {
      // Puede chocar con `UNIQUE (incident_id)` si dos resoluciones compiten (kanban + kiosko).
      // Nada en esta función falla en silencio: sin rastro la incidencia se quedaría en `résolu`
      // sin explicación ninguna en su historial.
      console.error('[csat] échec création de la réponse CSAT', { incidentId, error })
      await admin.from('incident_history').insert({
        incident_id: incidentId,
        changed_by:  null,
        old_status:  null,
        new_status:  null,
        comment:     "Enquête de satisfaction non envoyée — échec de la création de l'enquête",
      })
      return
    }
    token = csat.token
  }

  const appUrl  = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000'
  const csatUrl = `${appUrl}/csat/${token}`
  const equipement = await machineLabel(admin, incident.machine_id, incident.contract_machine_id)

  // `sendEmail` no lanza cuando el proveedor rechaza el envío: devuelve `{ error }` (`src/lib/email.ts`).
  // El try/catch cubre además que reviente el propio fetch (red/DNS).
  let emailFailed = false
  let emailError: unknown = null
  try {
    const sent = await sendEmail({
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
    if ('error' in sent) {
      emailFailed = true
      emailError  = sent.error
    }
  } catch (err) {
    emailFailed = true
    emailError  = err
  }

  if (emailFailed) {
    // Un `sent_at` que miente es peor que no tenerlo, así que no lo escribimos. Y NO cerramos la
    // incidencia: el cliente no ha recibido nada, se queda en `résolu` para poder reintentarlo.
    console.error('[csat] échec envoi email', { incidentId, error: emailError })
    await admin.from('incident_history').insert({
      incident_id: incidentId,
      changed_by:  null,
      old_status:  null,
      new_status:  null,
      comment:     "Enquête de satisfaction — échec de l'envoi de l'email",
    })
    // La fila de `csat_responses` se conserva: su token sigue siendo válido y el próximo paso a `résolu` la reutiliza.
    return
  }

  // La caducidad se refresca SIEMPRE (también en la fila recién creada, donde ya venía bien):
  // el enlace que acaba de salir debe valer 7 días desde ESTE envío, que es lo que promete el email.
  const now = new Date()
  await admin
    .from('csat_responses')
    .update({
      sent_to:    recipient.email,
      sent_at:    now.toISOString(),
      expires_at: csatExpiresAt(now),
    })
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
