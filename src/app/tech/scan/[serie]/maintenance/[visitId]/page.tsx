import { createClient } from '@/lib/supabase/server'
import { notFound } from 'next/navigation'
import { closeMaintenance } from './actions'
import MaintenanceVisitForm from '@/components/tech/MaintenanceVisitForm'

export default async function MaintenanceVisitPage({
  params,
}: {
  params: Promise<{ serie: string; visitId: string }>
}) {
  const { serie, visitId } = await params
  const numero_serie = decodeURIComponent(serie)
  const supabase = await createClient()

  const { data: visit } = await supabase
    .from('maintenance_visits')
    .select(`
      id, scheduled_date, status,
      maintenance_plans ( notes ),
      contract_machines (
        machine_id,
        machines ( numero_serie, marque, modele ),
        contracts ( lieu_installation, clients ( nom_client ) )
      )
    `)
    .eq('id', visitId)
    .single()

  if (!visit) notFound()

  const plan    = visit.maintenance_plans as unknown as { notes: string | null } | null
  const line    = visit.contract_machines as unknown as {
    machine_id: string
    machines: { numero_serie: string; marque: string; modele: string } | null
    contracts: { lieu_installation: string | null; clients: { nom_client: string } | null } | null
  } | null
  const machine = line?.machines
  const client  = line?.contracts?.clients

  // Verificar que esta visita corresponde a la máquina del QR
  if (line?.machine_id !== numero_serie) notFound()

  const boundAction = closeMaintenance.bind(null, visitId, numero_serie)

  return (
    <MaintenanceVisitForm
      boundAction={boundAction}
      backHref={`/tech/scan/${encodeURIComponent(serie)}`}
      scheduledDate={visit.scheduled_date}
      isOverdue={visit.status === 'en_retard'}
      clientName={client?.nom_client ?? null}
      machineName={`${machine?.marque ?? ''} ${machine?.modele ?? ''}`.trim()}
      machineLocation={line?.contracts?.lieu_installation ?? null}
      planNotes={plan?.notes ?? null}
    />
  )
}
