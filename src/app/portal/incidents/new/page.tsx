import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import NewIncidentForm from './form'
import { createPortalIncidentAction } from './actions'

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

  const { data: contracts } = await supabase
    .from('contracts')
    .select('id, numero_contrat, machine_id, machines(marque, modele)')
    .eq('client_id', clientProfile.client_id)
    .eq('statut', 'actif')

  const options = contracts?.map((c) => {
    const m = c.machines as unknown as { marque: string; modele: string } | null
    return {
      id:    c.id,
      label: m ? `${m.marque} ${m.modele} — ${c.numero_contrat}` : c.machine_id,
      machine_id: c.machine_id,
    }
  }) ?? []

  // Si viene del QR, preseleccionar el contrato que corresponde a esa máquina
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
