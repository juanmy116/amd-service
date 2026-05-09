import { createAdminClient } from './supabase/admin'
import { sendEmail } from './email'

export async function sendCsatForIncident(incidentId: string): Promise<void> {
  const admin = createAdminClient()

  // Comprobamos si ya existe una entrada CSAT para este incidente
  const { data: existing } = await admin
    .from('csat_responses')
    .select('token, responded_at')
    .eq('incident_id', incidentId)
    .maybeSingle()

  // Si ya respondió, no reenviamos
  if (existing?.responded_at) return

  // Obtenemos el incidente y el contrato vinculado
  const { data: incident } = await admin
    .from('incidents')
    .select('id, title, contract_id, contracts(client_id)')
    .eq('id', incidentId)
    .single()

  if (!incident?.contract_id) return
  const clientId = (incident.contracts as unknown as { client_id: number } | null)?.client_id
  if (!clientId) return

  // Obtenemos el profile_id del cliente
  const { data: cp } = await admin
    .from('client_profiles')
    .select('profile_id')
    .eq('client_id', clientId)
    .maybeSingle()

  if (!cp?.profile_id) return

  // Obtenemos el email desde auth.users
  const { data: { user } } = await admin.auth.admin.getUserById(cp.profile_id)
  if (!user?.email) return

  // Creamos (o recuperamos) la entrada CSAT
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
}
