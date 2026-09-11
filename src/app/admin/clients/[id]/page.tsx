import { createClient } from '@/lib/supabase/server'
import { notFound } from 'next/navigation'
import ClientForm from '@/components/admin/ClientForm'
import { getQuartiers } from '@/lib/quartiers.server'
import { updateClientAction, deleteClientAction } from './actions'

export default async function EditClientPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const supabase = await createClient()

  const { data: client } = await supabase
    .from('clients')
    .select('*')
    .eq('id', Number(id))
    .single()

  if (!client) notFound()

  const quartiers = await getQuartiers()

  const boundUpdateAction = updateClientAction.bind(null, client.id)

  return (
    <ClientForm
      action={boundUpdateAction}
      defaultValues={client}
      title={client.nom_client}
      clientId={client.id}
      quartiers={quartiers}
      deleteAction={deleteClientAction}
    />
  )
}
