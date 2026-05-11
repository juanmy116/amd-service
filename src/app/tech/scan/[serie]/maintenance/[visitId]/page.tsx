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
      maintenance_plans (
        notes,
        contracts (
          lieu_installation,
          clients  ( nom_client ),
          machines ( numero_serie, marque, modele )
        )
      )
    `)
    .eq('id', visitId)
    .single()

  if (!visit) notFound()

  const plan     = visit.maintenance_plans as any
  const contract = plan?.contracts as any
  const machine  = contract?.machines as any
  const client   = contract?.clients as any

  // Verificar que esta visita corresponde a la máquina del QR
  if (machine?.numero_serie !== numero_serie) notFound()

  const boundAction = closeMaintenance.bind(null, visitId, numero_serie)

  return (
    <MaintenanceVisitForm
      boundAction={boundAction}
      backHref={`/tech/scan/${encodeURIComponent(serie)}`}
      scheduledDate={visit.scheduled_date}
      isOverdue={visit.status === 'en_retard'}
      clientName={client?.nom_client ?? null}
      machineName={`${machine?.marque ?? ''} ${machine?.modele ?? ''}`.trim()}
      machineLocation={contract?.lieu_installation ?? null}
      planNotes={plan?.notes ?? null}
    />
  )
}
