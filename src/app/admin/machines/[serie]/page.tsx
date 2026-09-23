import { createClient } from '@/lib/supabase/server'
import { notFound } from 'next/navigation'
import MachineForm from '@/components/admin/MachineForm'
import MachinePositionCard from '@/components/admin/MachinePositionCard'
import { getQuartiers } from '@/lib/quartiers.server'
import { updateMachineAction, deleteMachineAction, setMachinePositionAction, clearMachinePositionAction } from './actions'

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

  const quartiers = await getQuartiers()

  // « Premier scan de X » : nom du technicien qui a fixé la position (admin_read_all_profiles
  // permet à un admin de lire n'importe quel profil).
  let setByName: string | null = null
  if (machine.location_source === 'first_scan' && machine.location_set_by) {
    const { data: profile } = await supabase
      .from('profiles')
      .select('full_name')
      .eq('id', machine.location_set_by)
      .maybeSingle()
    setByName = profile?.full_name ?? null
  }

  const boundUpdateAction = updateMachineAction.bind(null, machine.numero_serie)
  const boundSetPosition = setMachinePositionAction.bind(null, machine.numero_serie)
  const boundClearPosition = clearMachinePositionAction.bind(null, machine.numero_serie)

  return (
    <>
      <MachineForm
        action={boundUpdateAction}
        defaultValues={machine}
        title={`${machine.marque} ${machine.modele}`}
        isEdit
        machineId={machine.numero_serie}
        deleteAction={deleteMachineAction}
        quartiers={quartiers}
      />
      <div className="px-8 pb-8 max-w-3xl">
        <MachinePositionCard
          lat={machine.lat}
          lng={machine.lng}
          accuracy={machine.location_accuracy_m}
          source={machine.location_source as 'first_scan' | 'admin' | null}
          setAt={machine.location_set_at}
          setByName={setByName}
          setAction={boundSetPosition}
          clearAction={boundClearPosition}
        />
      </div>
    </>
  )
}
