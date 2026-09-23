import { createAdminClient } from '@/lib/supabase/admin'
import { requireTechnician } from '@/lib/auth'
import { notFound } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft, CheckCircle2 } from 'lucide-react'
import { Card } from '@/components/ui/Card'
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
  const { data: detail, error: detailError } = await admin
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

  // La visita existe (el técnico la acaba de leer): un fallo aquí es de la BD, no un «no
  // existe». Se lanza para que salga como error y no como un 404 engañoso.
  if (detailError) {
    console.error('[maintenance visit] lectura del detalle fallida', { visitId, error: detailError })
    throw new Error('Lecture de la visite impossible.')
  }

  const plan    = detail?.maintenance_plans
  const line    = detail?.contract_machines
  const machine = line?.machines
  const client  = line?.contracts?.clients

  // Verificar que esta visita corresponde a la máquina del QR
  if (line?.machine_id !== numero_serie) notFound()

  const backHref = `/tech/scan/${encodeURIComponent(serie)}`

  // Visita ya cerrada (p. ej. enlace viejo o doble pestaña): tarjeta de solo lectura en vez del
  // formulario, que la RPC rechazaría igualmente con «déjà clôturée».
  if (visit.status !== 'planifié' && visit.status !== 'en_retard') {
    return (
      <div className="p-4 space-y-5">
        <div className="flex items-center gap-3 pt-2">
          <Link href={backHref} className="flex items-center justify-center w-9 h-9 rounded-xl border border-line bg-card shrink-0">
            <ArrowLeft size={16} className="text-ink-muted" />
          </Link>
          <h1 className="text-base font-semibold text-ink font-display">Maintenance</h1>
        </div>
        <Card className="p-6 text-center space-y-2">
          <CheckCircle2 size={24} className="text-success mx-auto" />
          <p className="text-sm font-semibold text-ink">Visite déjà clôturée</p>
          <p className="font-mono text-xs text-ink-muted break-all">{numero_serie}</p>
          <Link href={backHref} className="inline-block text-xs text-ink-muted underline">
            Retour à la fiche machine
          </Link>
        </Card>
      </div>
    )
  }

  const boundAction = closeMaintenance.bind(null, visitId, numero_serie)

  return (
    <MaintenanceVisitForm
      boundAction={boundAction}
      backHref={backHref}
      scheduledDate={visit.scheduled_date}
      isOverdue={visit.status === 'en_retard'}
      clientName={client?.nom_client ?? null}
      machineName={`${machine?.marque ?? ''} ${machine?.modele ?? ''}`.trim()}
      machineLocation={line?.machines?.localisation ?? null}
      planNotes={plan?.notes ?? null}
    />
  )
}
