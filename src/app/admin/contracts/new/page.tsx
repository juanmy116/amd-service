import { createClient } from '@/lib/supabase/server'
import ContractForm from '@/components/admin/ContractForm'
import { createContractAction } from './actions'

export default async function NewContractPage() {
  const supabase = await createClient()

  // availableMachines = machines that have NO open line (date_fin IS NULL)
  const [{ data: clients }, { data: allMachines }, { data: openLines }] = await Promise.all([
    supabase.from('clients').select('id, nom_client').eq('active', true).order('nom_client'),
    supabase.from('machines').select('numero_serie, marque, modele').eq('active', true).order('marque').order('modele'),
    supabase.from('contract_machines').select('machine_id').is('date_fin', null),
  ])

  const openMachineIds = new Set((openLines ?? []).map((l) => l.machine_id))
  const availableMachines = (allMachines ?? []).filter((m) => !openMachineIds.has(m.numero_serie))

  return (
    <ContractForm
      action={createContractAction}
      clients={clients ?? []}
      availableMachines={availableMachines}
      title="Nouveau contrat"
    />
  )
}
