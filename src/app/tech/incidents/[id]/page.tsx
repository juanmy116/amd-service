import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { notFound, redirect } from 'next/navigation'
import InterventionForm from './intervention-form'
import IncidentPhotos from '@/components/IncidentPhotos'
import { submitInterventionAction } from './actions'
import { getOpenLineForMachine } from '@/lib/contract-machines'
import { itineraryDestination } from '@/lib/geo.server'

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
    supabase.from('incident_parts').select('part_id, quantity').eq('incident_id', id),
  ])

  if (!incident) notFound()

  // Los técnicos solo pueden ver sus incidentes asignados.
  // Error opaco: notFound en lugar de 403 para no revelar que el incidente existe.
  if (profile.role === 'technician' && incident.assigned_to !== user.id) notFound()

  // Resolver contexto de cliente/máquina/contrato vía contract_machine_id.
  // Incidencias públicas (QR) sin línea muestran solo machine_id.
  let contractInfo: {
    numero_contrat: string | null
    clients: { nom_client: string; adresse: string | null; ville: string | null; quartier_code: string | null } | null
    machines: { marque: string; modele: string; localisation: string | null; lat: number | null; lng: number | null; quartier_code: string | null } | null
  } | null = null

  // Destination pour le bouton « Itinéraire » (`itineraryDestination`). Pour une incidence
  // PUBLIQUE (sans ligne de contrat), la RLS du technicien ne couvre pas machines/contract_machines
  // pour cette machine — on lit avec service_role, comme la fiche de scan (`/tech/scan/[serie]`) :
  // c'est bien SON incident.
  let destMachine: { lat: number | null; lng: number | null; quartier_code: string | null } | null = null
  let destClient: { adresse: string | null; ville: string | null; quartier_code: string | null } | null = null

  if (incident.contract_machine_id) {
    const { data } = await supabase
      .from('contract_machines')
      .select(`
        contracts(numero_contrat, clients(nom_client, adresse, ville, quartier_code)),
        machines(marque, modele, localisation, numero_serie, lat, lng, quartier_code)
      `)
      .eq('id', incident.contract_machine_id)
      .maybeSingle()
    if (data) {
      const cm = data
      contractInfo = {
        numero_contrat: cm.contracts?.numero_contrat ?? null,
        clients: cm.contracts?.clients ?? null,
        machines: cm.machines,
      }
      destMachine = cm.machines
      destClient = cm.contracts?.clients ?? null
    }
  } else if (incident.machine_id) {
    const admin = createAdminClient()
    const { data: machine } = await admin
      .from('machines')
      .select('lat, lng, quartier_code')
      .eq('numero_serie', incident.machine_id)
      .maybeSingle()
    destMachine = machine

    const openLine = await getOpenLineForMachine(admin, incident.machine_id)
    if (openLine) {
      const { data: contract } = await admin
        .from('contracts')
        .select('clients(adresse, ville, quartier_code)')
        .eq('id', openLine.contract_id)
        .maybeSingle()
      destClient = contract?.clients ?? null
    }
  }

  const { coords: destCoords, text: destText } = await itineraryDestination(destMachine, destClient)

  const clientName  = contractInfo?.clients?.nom_client ?? null
  const machine     = contractInfo?.machines ?? null
  const machineName = machine ? `${machine.marque} ${machine.modele}` : (incident.machine_id ?? '')
  const machineLocation = machine?.localisation ?? null
  const contractNumber = contractInfo?.numero_contrat ?? null

  const checkedParts = new Map((parts ?? []).map((p) => [p.part_id, p.quantity]))
  const boundAction  = submitInterventionAction.bind(null, incident.id)

  return (
    <InterventionForm
      incident={incident}
      boundAction={boundAction}
      clientName={clientName}
      machineName={machineName}
      machineLocation={machineLocation}
      contractNumber={contractNumber}
      destCoords={destCoords}
      destText={destText}
      checkedParts={checkedParts}
      photos={<IncidentPhotos incidentId={incident.id} />}
    />
  )
}
