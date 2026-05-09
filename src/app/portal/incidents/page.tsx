import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { Plus } from 'lucide-react'

const STATUS_STYLE: Record<string, string> = {
  nouveau:  'bg-blue-50 text-blue-700',
  assigné:  'bg-purple-50 text-purple-700',
  en_cours: 'bg-amber-50 text-amber-700',
  résolu:   'bg-green-50 text-green-700',
  fermé:    'bg-gray-100 text-gray-500',
}

const STATUS_LABEL: Record<string, string> = {
  nouveau: 'Nouveau', assigné: 'Assigné', en_cours: 'En cours', résolu: 'Résolu', fermé: 'Fermé',
}

const PRIORITY_STYLE: Record<string, string> = {
  basse: 'bg-gray-100 text-gray-500', normale: 'bg-blue-50 text-blue-600',
  haute: 'bg-orange-50 text-orange-700', urgente: 'bg-red-50 text-red-700',
}
const PRIORITY_LABEL: Record<string, string> = {
  basse: 'Basse', normale: 'Normale', haute: 'Haute', urgente: 'Urgente',
}

export default async function PortalIncidentsPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: clientProfile } = await supabase
    .from('client_profiles')
    .select('client_id')
    .eq('profile_id', user.id)
    .single()

  if (!clientProfile) redirect('/portal/verify')

  const { data: contractIds } = await supabase
    .from('contracts')
    .select('id')
    .eq('client_id', clientProfile.client_id)

  const ids = contractIds?.map(c => c.id) ?? []

  const { data: incidents } = await supabase
    .from('incidents')
    .select('id, title, status, priority, category, created_at, machine_id')
    .in('contract_id', ids)
    .order('created_at', { ascending: false })

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-semibold text-gray-900" style={{ fontFamily: 'Poppins, sans-serif' }}>
          Mes incidents
        </h1>
        <Link
          href="/portal/incidents/new"
          className="flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium text-white transition-opacity hover:opacity-90"
          style={{ backgroundColor: '#BF0D0D' }}
        >
          <Plus size={16} />
          Signaler un problème
        </Link>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-200 bg-gray-50">
              <th className="text-left px-5 py-3.5 font-medium text-gray-500">Titre</th>
              <th className="text-left px-5 py-3.5 font-medium text-gray-500">Machine</th>
              <th className="text-left px-5 py-3.5 font-medium text-gray-500">Priorité</th>
              <th className="text-left px-5 py-3.5 font-medium text-gray-500">Statut</th>
              <th className="text-left px-5 py-3.5 font-medium text-gray-500">Date</th>
              <th />
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {(!incidents || incidents.length === 0) && (
              <tr>
                <td colSpan={6} className="px-5 py-10 text-center text-gray-400">Aucun incident signalé</td>
              </tr>
            )}
            {incidents?.map((inc) => (
              <tr key={inc.id} className="hover:bg-gray-50">
                <td className="px-5 py-4 font-medium text-gray-900">{inc.title}</td>
                <td className="px-5 py-4 font-mono text-xs text-gray-400">{inc.machine_id}</td>
                <td className="px-5 py-4">
                  <span className={`inline-flex px-2 py-0.5 rounded text-xs font-medium ${PRIORITY_STYLE[inc.priority] ?? 'bg-gray-100 text-gray-500'}`}>
                    {PRIORITY_LABEL[inc.priority] ?? inc.priority}
                  </span>
                </td>
                <td className="px-5 py-4">
                  <span className={`inline-flex px-2 py-0.5 rounded text-xs font-medium ${STATUS_STYLE[inc.status] ?? 'bg-gray-100 text-gray-500'}`}>
                    {STATUS_LABEL[inc.status] ?? inc.status}
                  </span>
                </td>
                <td className="px-5 py-4 text-xs text-gray-400">
                  {new Date(inc.created_at).toLocaleDateString('fr-FR')}
                </td>
                <td className="px-5 py-4 text-right">
                  <Link href={`/portal/incidents/${inc.id}`} className="text-sm text-gray-400 hover:text-gray-700 underline underline-offset-2">Voir</Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
