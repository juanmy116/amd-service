import { createClient } from '@/lib/supabase/server'
import { notFound } from 'next/navigation'
import MachineForm from '@/components/admin/MachineForm'
import MachinePositionCard from '@/components/admin/MachinePositionCard'
import MachineStatusCard from '@/components/admin/MachineStatusCard'
import { getQuartiers } from '@/lib/quartiers.server'
import { replaceMachineAction } from '@/app/admin/contracts/[id]/replace-actions'
import {
  updateMachineAction, setMachinePositionAction, clearMachinePositionAction,
  setMachineHorsServiceAction, returnMachineToServiceAction,
} from './actions'

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

  // Contrato abierto de la máquina (como mucho uno: índice one_open_per_machine) y, para
  // «Remplacer», las máquinas en servicio que no están en ningún contrato abierto.
  const [openLineRes, activeMachinesRes, busyRes, horsServiceByRes] = await Promise.all([
    supabase
      .from('contract_machines')
      .select('id, contract_id, date_debut, contracts ( numero_contrat, clients ( nom_client ) )')
      .eq('machine_id', numero_serie)
      .is('date_fin', null)
      .maybeSingle(),
    supabase.from('machines').select('numero_serie, marque, modele').eq('active', true).order('marque').order('modele'),
    supabase.from('contract_machines').select('machine_id').is('date_fin', null),
    machine.hors_service_by
      ? supabase.from('profiles').select('full_name').eq('id', machine.hors_service_by).maybeSingle()
      : Promise.resolve({ data: null, error: null }),
  ])
  if (openLineRes.error || activeMachinesRes.error || busyRes.error || horsServiceByRes.error) {
    console.error('[machine status]', openLineRes.error ?? activeMachinesRes.error ?? busyRes.error ?? horsServiceByRes.error)
    throw new Error('DATA_FETCH_ERROR')
  }
  const line = openLineRes.data
  const openLine = line
    ? {
        id: line.id,
        contractId: line.contract_id,
        numeroContrat: line.contracts?.numero_contrat ?? '—',
        clientName: line.contracts?.clients?.nom_client ?? null,
        dateDebut: line.date_debut,
      }
    : null
  const busy = new Set((busyRes.data ?? []).map((l) => l.machine_id))
  const replacementCandidates = (activeMachinesRes.data ?? []).filter((m) => !busy.has(m.numero_serie))

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
        quartiers={quartiers}
      />
      <div className="px-8 pb-8 max-w-3xl space-y-6">
        <MachineStatusCard
          serie={machine.numero_serie}
          active={machine.active}
          horsServiceAt={machine.hors_service_at}
          horsServiceReason={machine.hors_service_reason}
          horsServiceByName={horsServiceByRes.data?.full_name ?? null}
          openLine={openLine}
          replacementCandidates={replacementCandidates}
          replaceAction={openLine ? replaceMachineAction.bind(null, openLine.contractId) : null}
          horsServiceAction={setMachineHorsServiceAction.bind(null, machine.numero_serie)}
          returnToServiceAction={returnMachineToServiceAction.bind(null, machine.numero_serie)}
        />
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
