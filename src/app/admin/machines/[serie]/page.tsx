import { createClient } from '@/lib/supabase/server'
import { notFound } from 'next/navigation'
import MachineForm from '@/components/admin/MachineForm'
import { updateMachineAction, deleteMachineAction } from './actions'

export default async function EditMachinePage({
  params,
}: {
  params: Promise<{ serie: string }>
}) {
  const { serie } = await params
  const numero_serie = decodeURIComponent(serie)
  const supabase = await createClient()

  const { data: machine } = await supabase
    .from('machines')
    .select('*')
    .eq('numero_serie', numero_serie)
    .single()

  if (!machine) notFound()

  const boundUpdateAction = updateMachineAction.bind(null, machine.numero_serie)

  return (
    <MachineForm
      action={boundUpdateAction}
      defaultValues={machine}
      title={`${machine.marque} ${machine.modele}`}
      isEdit
      machineId={machine.numero_serie}
      deleteAction={deleteMachineAction}
    />
  )
}
