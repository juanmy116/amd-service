import { createClient } from '@/lib/supabase/server'
import { notFound, redirect } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'

const STATUS_STYLE: Record<string, string> = {
  nouveau: 'bg-blue-50 text-blue-700', assigné: 'bg-purple-50 text-purple-700',
  en_cours: 'bg-amber-50 text-amber-700', résolu: 'bg-green-50 text-green-700', fermé: 'bg-gray-100 text-gray-500',
}
const STATUS_LABEL: Record<string, string> = {
  nouveau: 'Nouveau', assigné: 'Assigné', en_cours: 'En cours', résolu: 'Résolu', fermé: 'Fermé',
}
const STATUS_DOT: Record<string, string> = {
  nouveau: 'bg-blue-500', assigné: 'bg-purple-500', en_cours: 'bg-amber-500', résolu: 'bg-green-500', fermé: 'bg-gray-400',
}

function formatDateTime(d: string) {
  return new Date(d).toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'short' })
}

export default async function PortalIncidentDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  // Obtener client_id del usuario autenticado
  const { data: clientProfile } = await supabase
    .from('client_profiles')
    .select('client_id')
    .eq('profile_id', user.id)
    .single()
  if (!clientProfile) redirect('/portal/verify')

  // Obtener IDs de contratos del cliente (ownership check)
  const { data: clientContracts } = await supabase
    .from('contracts')
    .select('id')
    .eq('client_id', clientProfile.client_id)
  const contractIds = (clientContracts ?? []).map(c => c.id)

  const { data: incident } = await supabase
    .from('incidents')
    .select('*')
    .eq('id', id)
    .in('contract_id', contractIds.length > 0 ? contractIds : [''])
    .single()

  if (!incident) notFound()

  const { data: history } = await supabase
    .from('incident_history')
    .select('id, old_status, new_status, comment, created_at')
    .eq('incident_id', id)
    .order('created_at', { ascending: false })

  const { data: contract } = await supabase
    .from('contracts')
    .select('numero_contrat, machines(marque, modele)')
    .eq('id', incident.contract_id)
    .single()

  const machine = contract?.machines as unknown as { marque: string; modele: string } | null

  return (
    <div className="max-w-2xl space-y-6">

      {/* Header */}
      <div className="flex items-center gap-4">
        <Link href="/portal/incidents" className="flex items-center justify-center w-9 h-9 rounded-lg border border-gray-200 bg-white hover:bg-gray-50 transition-colors">
          <ArrowLeft size={16} className="text-gray-600" />
        </Link>
        <div className="flex-1 min-w-0">
          <h1 className="text-xl font-semibold text-gray-900 truncate" style={{ fontFamily: 'Poppins, sans-serif' }}>
            {incident.title}
          </h1>
          <p className="text-sm text-gray-400 mt-0.5">
            {machine ? `${machine.marque} ${machine.modele}` : incident.machine_id}
            {contract?.numero_contrat && ` · ${contract.numero_contrat}`}
          </p>
        </div>
        <span className={`shrink-0 inline-flex px-2.5 py-1 rounded-lg text-xs font-medium ${STATUS_STYLE[incident.status] ?? 'bg-gray-100 text-gray-500'}`}>
          {STATUS_LABEL[incident.status] ?? incident.status}
        </span>
      </div>

      {/* Details */}
      <div className="bg-white rounded-xl border border-gray-200 p-6 space-y-4">
        {incident.description && (
          <div>
            <p className="text-xs font-medium text-gray-400 mb-1">Description</p>
            <p className="text-sm text-gray-700 whitespace-pre-wrap">{incident.description}</p>
          </div>
        )}
        <div className="grid grid-cols-3 gap-4 pt-2 border-t border-gray-100">
          <div>
            <p className="text-xs font-medium text-gray-400 mb-1">Catégorie</p>
            <p className="text-sm text-gray-700 capitalize">{incident.category}</p>
          </div>
          <div>
            <p className="text-xs font-medium text-gray-400 mb-1">Priorité</p>
            <p className="text-sm text-gray-700 capitalize">{incident.priority}</p>
          </div>
          <div>
            <p className="text-xs font-medium text-gray-400 mb-1">Ouvert le</p>
            <p className="text-sm text-gray-700">{new Date(incident.created_at).toLocaleDateString('fr-FR')}</p>
          </div>
        </div>
      </div>

      {/* Rapport technicien */}
      {incident.rapport_intervention && (
        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <p className="text-xs font-medium text-gray-400 mb-2">Rapport d&apos;intervention</p>
          <p className="text-sm text-gray-700 whitespace-pre-wrap">{incident.rapport_intervention}</p>
        </div>
      )}

      {/* Historique */}
      {history && history.length > 0 && (
        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <p className="text-sm font-semibold text-gray-700 mb-5">Suivi de l&apos;incident</p>
          <div className="space-y-4">
            {history.map((h) => (
              <div key={h.id} className="flex gap-3">
                <div className="flex flex-col items-center pt-1">
                  <div className={`w-2 h-2 rounded-full shrink-0 ${STATUS_DOT[h.new_status] ?? 'bg-gray-400'}`} />
                </div>
                <div className="flex-1 pb-4 border-b border-gray-100 last:border-0 last:pb-0">
                  <div className="flex flex-wrap items-center gap-x-2">
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
                    <span className="text-xs text-gray-400">{formatDateTime(h.created_at)}</span>
                  </div>
                  {h.comment && <p className="mt-1 text-xs text-gray-500 italic">{h.comment}</p>}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
