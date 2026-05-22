import { createClient } from '@/lib/supabase/server'
import { notFound } from 'next/navigation'
import IncidentForm from '@/components/admin/IncidentForm'
import { updateIncidentAction, deleteIncidentAction } from './actions'
import { Card } from '@/components/ui/Card'
import { Badge } from '@/components/ui/Badge'

const STATUS_DOT: Record<string, string> = {
  nouveau:  'bg-blue-500',
  assigné:  'bg-purple-500',
  en_cours: 'bg-amber-500',
  résolu:   'bg-green-500',
  fermé:    'bg-gray-400',
}

const STATUS_LABEL: Record<string, string> = {
  nouveau: 'Nouveau', assigné: 'Assigné', en_cours: 'En cours', résolu: 'Résolu', fermé: 'Fermé',
}

function formatDateTime(d: string) {
  return new Date(d).toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'short' })
}

export default async function EditIncidentPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const supabase = await createClient()

  const [{ data: incident }, { data: technicians }] = await Promise.all([
    supabase.from('incidents').select('*').eq('id', id).single(),
    supabase.from('profiles').select('id, full_name').eq('role', 'technician').order('full_name'),
  ])

  if (!incident) notFound()

  // Context: contract → client + machine (contract_id puede ser null en incidentes públicos)
  const { data: contract } = incident.contract_id
    ? await supabase
        .from('contracts')
        .select('numero_contrat, clients(nom_client), machines(marque, modele)')
        .eq('id', incident.contract_id)
        .maybeSingle()
    : { data: null }

  const clientData  = contract?.clients  as unknown as { nom_client: string }      | null
  const machineData = contract?.machines as unknown as { marque: string; modele: string } | null

  const contextInfo = {
    clientName:     clientData?.nom_client ?? null,
    machineName:    machineData ? `${machineData.marque} ${machineData.modele}` : incident.machine_id,
    contractNumber: contract?.numero_contrat ?? null,
  }

  // History
  const { data: history } = await supabase
    .from('incident_history')
    .select('id, old_status, new_status, comment, created_at, changed_by')
    .eq('incident_id', id)
    .order('created_at', { ascending: false })

  let profileMap = new Map<string, string | null>()
  if (history && history.length > 0) {
    const ids = [...new Set(history.map((h) => h.changed_by))]
    const { data: profiles } = await supabase.from('profiles').select('id, full_name').in('id', ids)
    profileMap = new Map(profiles?.map((p) => [p.id, p.full_name]) ?? [])
  }

  const boundUpdateAction = updateIncidentAction.bind(null, incident.id)

  return (
    <div>
      <IncidentForm
        action={boundUpdateAction}
        defaultValues={incident}
        technicians={technicians ?? []}
        title={`${incident.numero_incident} · ${incident.title}`}
        isEdit
        incidentId={incident.id}
        deleteAction={deleteIncidentAction}
        contextInfo={contextInfo}
      />

      {/* Contact public (incidente via QR sin autenticación) */}
      {incident.contact_name && (
        <div className="px-8 pb-4 max-w-3xl">
          <Card className="p-6">
            <div className="flex items-center gap-2 mb-4">
              <h2 className="text-sm font-semibold text-ink">Contact</h2>
              <Badge variant="warning">Public</Badge>
            </div>
            <div className="space-y-2 text-sm">
              <div className="flex gap-2">
                <span className="text-ink-muted w-24 shrink-0">Nom</span>
                <span className="text-ink font-medium">{incident.contact_name}</span>
              </div>
              <div className="flex gap-2">
                <span className="text-ink-muted w-24 shrink-0">Téléphone</span>
                <a
                  href={`tel:${incident.contact_phone}`}
                  className="text-ink hover:underline"
                >
                  {incident.contact_phone}
                </a>
              </div>
              {incident.contact_email && (
                <div className="flex gap-2">
                  <span className="text-ink-muted w-24 shrink-0">Email</span>
                  <a
                    href={`mailto:${incident.contact_email}`}
                    className="text-ink hover:underline"
                  >
                    {incident.contact_email}
                  </a>
                </div>
              )}
            </div>
          </Card>
        </div>
      )}

      {/* Rapport d'intervention */}
      {incident.rapport_intervention && (
        <div className="px-8 pb-4 max-w-3xl">
          <Card className="p-6">
            <h2 className="text-sm font-semibold text-ink mb-3">Rapport d&apos;intervention</h2>
            <p className="text-sm text-ink-soft whitespace-pre-wrap">{incident.rapport_intervention}</p>
            {incident.autres_pieces && (
              <div className="mt-3 pt-3 border-t border-line-subtle">
                <p className="text-xs font-medium text-ink-muted mb-1">Autres pièces</p>
                <p className="text-sm text-ink-soft">{incident.autres_pieces}</p>
              </div>
            )}
          </Card>
        </div>
      )}

      {/* Historique */}
      {history && history.length > 0 && (
        <div className="px-8 pb-8 max-w-3xl">
          <Card className="p-6">
            <h2 className="text-sm font-semibold text-ink mb-5">Historique</h2>
            <div className="space-y-4">
              {history.map((h) => (
                <div key={h.id} className="flex gap-3">
                  <div className="flex flex-col items-center pt-1">
                    <div className={`w-2 h-2 rounded-full shrink-0 ${STATUS_DOT[h.new_status] ?? 'bg-gray-400'}`} />
                  </div>
                  <div className="flex-1 pb-4 border-b border-line-subtle last:border-0 last:pb-0">
                    <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                      {h.old_status ? (
                        <span className="text-xs text-ink-muted">
                          {STATUS_LABEL[h.old_status] ?? h.old_status}
                          {' → '}
                          <span className="font-medium text-ink">{STATUS_LABEL[h.new_status] ?? h.new_status}</span>
                        </span>
                      ) : (
                        <span className="text-xs font-medium text-ink">{STATUS_LABEL[h.new_status] ?? h.new_status}</span>
                      )}
                      <span className="text-xs text-ink-muted">·</span>
                      <span className="text-xs text-ink-muted">{profileMap.get(h.changed_by) ?? 'Système'}</span>
                      <span className="text-xs text-ink-muted">·</span>
                      <span className="text-xs text-ink-muted">{formatDateTime(h.created_at)}</span>
                    </div>
                    {h.comment && (
                      <p className="mt-1 text-xs text-ink-muted italic">{h.comment}</p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </Card>
        </div>
      )}
    </div>
  )
}
