import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import NewIncidentForm from './form'
import { createPortalIncidentAction } from './actions'
import { getActiveLinesForContract } from '@/lib/contract-machines'

export default async function PortalNewIncidentPage({
  searchParams,
}: {
  searchParams: Promise<{ machine?: string }>
}) {
  const { machine } = await searchParams
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: clientProfile } = await supabase
    .from('client_profiles')
    .select('client_id')
    .eq('profile_id', user.id)
    .single()

  if (!clientProfile) redirect('/portal/verify')

  // Contratos activos del cliente
  const { data: contracts } = await supabase
    .from('contracts')
    .select('id, numero_contrat')
    .eq('client_id', clientProfile.client_id)
    .eq('statut', 'actif')

  const contractIds = (contracts ?? []).map(c => c.id)

  // Líneas activas (una por máquina) para todos los contratos del cliente
  const allLines = (
    await Promise.all(contractIds.map(cid => getActiveLinesForContract(supabase, cid)))
  ).flat()

  const contractMap = new Map((contracts ?? []).map(c => [c.id, c.numero_contrat]))

  const options = allLines.map((line) => {
    const m = line.machines
    const contratNum = contractMap.get(line.contract_id) ?? ''
    return {
      id:         line.id,          // UUID de la línea (contract_machine_id)
      label:      m ? `${m.marque} ${m.modele} — ${contratNum}` : `${line.machine_id} — ${contratNum}`,
      machine_id: line.machine_id,
    }
  })

  // Si viene del QR, preseleccionar la línea que corresponde a esa máquina
  const preselectedContractId = machine
    ? (options.find(o => o.machine_id === machine)?.id ?? null)
    : null

  // La máquina escaneada no pertenece a ningún contrato activo de este cliente
  const machineNotFound = !!machine && preselectedContractId === null

  return (
    <NewIncidentForm
      action={createPortalIncidentAction}
      contracts={options}
      preselectedContractId={preselectedContractId}
      machineNotFound={machineNotFound}
    />
  )
}
