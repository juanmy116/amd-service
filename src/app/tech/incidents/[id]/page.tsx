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

  // Resolver contexto de cliente/máquina/contrato para el incidente.
  // Incidencias nuevas (post-refactor) tienen contract_id=NULL y contract_machine_id=<uuid>.
  let contractInfo: {
    numero_contrat: string | null
    lieu_installation: string | null
    clients: { nom_client: string } | null
    machines: { marque: string; modele: string; localisation: string | null } | null
  } | null = null

  if (incident.contract_id) {
    const { data } = await supabase
      .from('contracts')
      .select('numero_contrat, lieu_installation, clients(nom_client), machines(marque, modele, localisation)')
      .eq('id', incident.contract_id)
      .maybeSingle()
    contractInfo = data as typeof contractInfo
  } else if (incident.contract_machine_id) {
    const { data } = await supabase
      .from('contract_machines')
      .select('contracts(numero_contrat, clients(nom_client)), machines(marque, modele, localisation, numero_serie)')
      .eq('id', incident.contract_machine_id)
      .maybeSingle()
    if (data) {
      const cm = data as unknown as {
        contracts: { numero_contrat: string; clients: { nom_client: string } | null } | null
        machines: { marque: string; modele: string; localisation: string | null; numero_serie: string } | null
      }
      contractInfo = {
        numero_contrat: cm.contracts?.numero_contrat ?? null,
        lieu_installation: cm.machines?.localisation ?? null,
        clients: cm.contracts?.clients ?? null,
        machines: cm.machines ? { marque: cm.machines.marque, modele: cm.machines.modele, localisation: cm.machines.localisation } : null,
      }
    }
  }

  const clientName  = contractInfo?.clients?.nom_client ?? null
  const machine     = contractInfo?.machines ?? null
  const machineName = machine ? `${machine.marque} ${machine.modele}` : (incident.machine_id ?? '')
  const machineLocation = machine?.localisation ?? contractInfo?.lieu_installation ?? null
  const contractNumber = contractInfo?.numero_contrat ?? null

  const checkedParts = new Set(parts?.map((p) => p.part_id) ?? [])
  const boundAction  = submitInterventionAction.bind(null, incident.id)

  return (
    <InterventionForm
      incident={incident}
      boundAction={boundAction}
      clientName={clientName}
      machineName={machineName}
      machineLocation={machineLocation}
      contractNumber={contractNumber}
      checkedParts={checkedParts}
    />
  )
}
