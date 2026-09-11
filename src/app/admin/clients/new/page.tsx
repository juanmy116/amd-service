import ClientForm from '@/components/admin/ClientForm'
import { getQuartiers } from '@/lib/quartiers.server'
import { createClientAction } from './actions'

export default async function NewClientPage() {
  const quartiers = await getQuartiers()
  return <ClientForm action={createClientAction} title="Nouveau client" quartiers={quartiers} />
}
