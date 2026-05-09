import MachineForm from '@/components/admin/MachineForm'
import { createMachineAction } from './actions'

export default function NewMachinePage() {
  return <MachineForm action={createMachineAction} title="Nouvelle machine" />
}
