import { createAdminClient } from '@/lib/supabase/admin'
import { requireTechnician } from '@/lib/auth'
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
  const { supabase } = await requireTechnician()

  // Autorización: la visita debe ser visible para el técnico por RLS (asignada a él o de sus
  // máquinas). Si no, no existe para él.
  const { data: visit } = await supabase
    .from('maintenance_visits')
    .select('id, scheduled_date, status')
    .eq('id', visitId)
    .maybeSingle()

  if (!visit) notFound()

  // Datos para pintar (máquina, cliente, notas del plan): solo lectura con service_role, porque
  // el técnico puede tener la visita sin tener la máquina ni el contrato visibles por RLS.
  const admin = createAdminClient()
  const { data: detail } = await admin
    .from('maintenance_visits')
    .select(`
      maintenance_plans ( notes ),
      contract_machines (
        machine_id,
        machines ( numero_serie, marque, modele, localisation ),
        contracts ( clients ( nom_client ) )
      )
    `)
    .eq('id', visitId)
    .single()

  const plan    = detail?.maintenance_plans
  const line    = detail?.contract_machines
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
      machineLocation={line?.machines?.localisation ?? null}
      planNotes={plan?.notes ?? null}
    />
  )
}
