import { createClient } from '@/lib/supabase/server'
import { notFound } from 'next/navigation'
import IncidentForm from '@/components/admin/IncidentForm'
import { updateIncidentAction, deleteIncidentAction } from './actions'

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

  // Context: contract → client + machine
  const { data: contract } = await supabase
    .from('contracts')
    .select('numero_contrat, clients(nom_client), machines(marque, modele)')
    .eq('id', incident.contract_id)
    .single()

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
        title={incident.title}
        isEdit
        incidentId={incident.id}
        deleteAction={deleteIncidentAction}
        contextInfo={contextInfo}
      />

      {/* Rapport d'intervention */}
      {incident.rapport_intervention && (
        <div className="px-8 pb-4 max-w-3xl">
          <div className="bg-white rounded-xl border border-gray-200 p-6">
            <h2 className="text-sm font-semibold text-gray-700 mb-3">Rapport d&apos;intervention</h2>
            <p className="text-sm text-gray-600 whitespace-pre-wrap">{incident.rapport_intervention}</p>
            {incident.autres_pieces && (
              <div className="mt-3 pt-3 border-t border-gray-100">
                <p className="text-xs font-medium text-gray-500 mb-1">Autres pièces</p>
                <p className="text-sm text-gray-600">{incident.autres_pieces}</p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Historique */}
      {history && history.length > 0 && (
        <div className="px-8 pb-8 max-w-3xl">
          <div className="bg-white rounded-xl border border-gray-200 p-6">
            <h2 className="text-sm font-semibold text-gray-700 mb-5">Historique</h2>
            <div className="space-y-4">
              {history.map((h) => (
                <div key={h.id} className="flex gap-3">
                  <div className="flex flex-col items-center pt-1">
                    <div className={`w-2 h-2 rounded-full shrink-0 ${STATUS_DOT[h.new_status] ?? 'bg-gray-400'}`} />
                  </div>
                  <div className="flex-1 pb-4 border-b border-gray-100 last:border-0 last:pb-0">
                    <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                      {h.old_status ? (
                        <span className="text-xs text-gray-500">
                          {STATUS_LABEL[h.old_status] ?? h.old_status}
                          {' → '}
                          <span className="font-medium text-gray-800">{STATUS_LABEL[h.new_status] ?? h.new_status}</span>
                        </span>
                      ) : (
                        <span className="text-xs font-medium text-gray-800">{STATUS_LABEL[h.new_status] ?? h.new_status}</span>
                      )}
                      <span className="text-xs text-gray-300">·</span>
                      <span className="text-xs text-gray-400">{profileMap.get(h.changed_by) ?? 'Système'}</span>
                      <span className="text-xs text-gray-300">·</span>
                      <span className="text-xs text-gray-400">{formatDateTime(h.created_at)}</span>
                    </div>
                    {h.comment && (
                      <p className="mt-1 text-xs text-gray-500 italic">{h.comment}</p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
