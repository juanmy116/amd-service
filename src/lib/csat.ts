import { createAdminClient } from './supabase/admin'
import { sendEmail } from './email'

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
    .select('id, title, contract_machine_id')
    .eq('id', incidentId)
    .single()

  if (!incident) return

  // Resolver client_id por contract_machine_id.
  let clientId: number | null = null

  if (incident.contract_machine_id) {
    const { data: line } = await admin
      .from('contract_machines')
      .select('contracts(client_id)')
      .eq('id', incident.contract_machine_id)
      .single()
    clientId = (line?.contracts as unknown as { client_id: number } | null)?.client_id ?? null
  }

  if (!clientId) return

  const { data: cp } = await admin
    .from('client_profiles')
    .select('profile_id')
    .eq('client_id', clientId)
    .maybeSingle()

  if (!cp?.profile_id) return

  const { data: { user } } = await admin.auth.admin.getUserById(cp.profile_id)
  if (!user?.email) return

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

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000'
  const csatUrl = `${appUrl}/csat/${token}`

  await sendEmail({
    template: 'csat',
    to: user.email,
    data: { title: incident.title, csat_url: csatUrl },
  })

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
