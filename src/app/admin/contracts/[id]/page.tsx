import { createClient } from '@/lib/supabase/server'
import { notFound } from 'next/navigation'
import ContractForm from '@/components/admin/ContractForm'
import { updateContractAction, deleteContractAction } from './actions'

export default async function EditContractPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const supabase = await createClient()

  const [{ data: contract }, { data: clients }, { data: machines }] = await Promise.all([
    supabase.from('contracts').select('*').eq('id', id).single(),
    supabase.from('clients').select('id, nom_client').eq('active', true).order('nom_client'),
    supabase.from('machines').select('numero_serie, marque, modele').eq('active', true).order('marque'),
  ])

  if (!contract) notFound()

  const boundUpdateAction = updateContractAction.bind(null, contract.id)

  return (
    <ContractForm
      action={boundUpdateAction}
      defaultValues={contract}
      clients={clients ?? []}
      machines={machines ?? []}
      title={contract.numero_contrat}
      isEdit
      contractId={contract.id}
      deleteAction={deleteContractAction}
    />
  )
}
