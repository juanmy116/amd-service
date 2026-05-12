import { createClient } from '@/lib/supabase/server'
import { notFound, redirect } from 'next/navigation'
import InterventionForm from './intervention-form'
import { submitInterventionAction } from './actions'

export default async function TechIncidentPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single()
  if (!profile || !['admin', 'technician'].includes(profile.role)) redirect('/login')

  const [{ data: incident }, { data: parts }] = await Promise.all([
    supabase.from('incidents').select('*').eq('id', id).single(),
    supabase.from('incident_parts').select('part_id').eq('incident_id', id),
  ])

  if (!incident) notFound()

  // Los técnicos solo pueden ver sus incidentes asignados.
  // Error opaco: notFound en lugar de 403 para no revelar que el incidente existe.
  if (profile.role === 'technician' && incident.assigned_to !== user.id) notFound()

  const { data: contract } = await supabase
    .from('contracts')
    .select('numero_contrat, lieu_installation, clients(nom_client), machines(marque, modele, localisation)')
    .eq('id', incident.contract_id)
    .single()

  const client  = contract?.clients  as unknown as { nom_client: string }                                  | null
  const machine = contract?.machines as unknown as { marque: string; modele: string; localisation: string | null } | null

  const checkedParts = new Set(parts?.map((p) => p.part_id) ?? [])
  const boundAction  = submitInterventionAction.bind(null, incident.id)

  return (
    <InterventionForm
      incident={incident}
      boundAction={boundAction}
      clientName={client?.nom_client ?? null}
      machineName={machine ? `${machine.marque} ${machine.modele}` : incident.machine_id}
      machineLocation={machine?.localisation ?? contract?.lieu_installation ?? null}
      contractNumber={contract?.numero_contrat ?? null}
      checkedParts={checkedParts}
    />
  )
}
