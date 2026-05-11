import { createClient } from '@/lib/supabase/server'
import ContractForm from '@/components/admin/ContractForm'
import { createContractAction } from './actions'

export default async function NewContractPage() {
  const supabase = await createClient()

  const [{ data: clients }, { data: allMachines }, { data: assignedMachines }] = await Promise.all([
    supabase.from('clients').select('id, nom_client').eq('active', true).order('nom_client'),
    supabase.from('machines').select('numero_serie, marque, modele').eq('active', true).order('marque'),
    supabase.from('contracts').select('machine_id').eq('statut', 'actif'),
  ])

  const assignedIds = new Set((assignedMachines ?? []).map(c => c.machine_id))
  const availableMachines = (allMachines ?? []).filter(m => !assignedIds.has(m.numero_serie))

  return (
    <ContractForm
      action={createContractAction}
      clients={clients ?? []}
      machines={availableMachines}
      title="Nouveau contrat"
    />
  )
}
