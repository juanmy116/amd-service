import { createClient } from '@/lib/supabase/server'
import ContractForm from '@/components/admin/ContractForm'
import { createContractAction } from './actions'

export default async function NewContractPage() {
  const supabase = await createClient()

  const [{ data: clients }, { data: machines }] = await Promise.all([
    supabase.from('clients').select('id, nom_client').eq('active', true).order('nom_client'),
    supabase.from('machines').select('numero_serie, marque, modele').eq('active', true).order('marque'),
  ])

  return (
    <ContractForm
      action={createContractAction}
      clients={clients ?? []}
      machines={machines ?? []}
      title="Nouveau contrat"
    />
  )
}
