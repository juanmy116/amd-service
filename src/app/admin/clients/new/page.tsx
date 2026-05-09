import ClientForm from '@/components/admin/ClientForm'
import { createClientAction } from './actions'

export default function NewClientPage() {
  return <ClientForm action={createClientAction} title="Nouveau client" />
}
