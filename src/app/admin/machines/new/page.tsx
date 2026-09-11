import MachineForm from '@/components/admin/MachineForm'
import { getQuartiers } from '@/lib/quartiers.server'
import { createMachineAction } from './actions'

export default async function NewMachinePage() {
  const quartiers = await getQuartiers()
  return <MachineForm action={createMachineAction} title="Nouvelle machine" quartiers={quartiers} />
}
