import { createClient } from '@/lib/supabase/server'
import Link from 'next/link'

const STATUS_BADGE: Record<string, { label: string; className: string }> = {
  nouveau:  { label: 'Nouveau',  className: 'bg-blue-50 text-blue-700' },
  assigné:  { label: 'Assigné',  className: 'bg-purple-50 text-purple-700' },
  en_cours: { label: 'En cours', className: 'bg-amber-50 text-amber-700' },
}

type RecentIncident = {
  id: string
  title: string
  status: string
  created_at: string
  clients: { nom_client: string } | null
  profiles: { full_name: string } | null
}

export default async function DashboardRecentIncidents() {
  const supabase = await createClient()

  const { data } = await supabase
    .from('incidents')
    .select(`
      id, title, status, created_at,
      clients!client_id ( nom_client ),
      profiles!assigned_to ( full_name )
    `)
    .not('status', 'in', '("résolu","fermé")')
    .order('created_at', { ascending: false })
    .limit(8)

  const incidents = (data ?? []) as unknown as RecentIncident[]

  return (
    <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
      <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
        <h2 className="text-sm font-semibold text-gray-900">Incidents récents</h2>
        <Link href="/admin/incidents" className="text-xs text-gray-400 hover:text-gray-700 transition-colors">
          Voir tout →
        </Link>
      </div>
      <table className="w-full text-sm">
        <thead>
          <tr className="bg-gray-50/60 border-b border-gray-50">
            <th className="text-left text-[11px] font-medium text-gray-400 px-6 py-3">Titre</th>
            <th className="text-left text-[11px] font-medium text-gray-400 px-4 py-3">Client</th>
            <th className="text-left text-[11px] font-medium text-gray-400 px-4 py-3">Statut</th>
            <th className="text-left text-[11px] font-medium text-gray-400 px-4 py-3">Technicien</th>
            <th className="text-right text-[11px] font-medium text-gray-400 px-6 py-3">Date</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-50">
          {incidents.length === 0 ? (
            <tr>
              <td colSpan={5} className="px-6 py-10 text-center text-sm text-gray-400">
                Aucun incident ouvert
              </td>
            </tr>
          ) : (
            incidents.map(inc => {
              const badge = STATUS_BADGE[inc.status]
              return (
                <tr key={inc.id} className="hover:bg-gray-50/60 transition-colors">
                  <td className="px-6 py-3.5">
                    <Link
                      href={`/admin/incidents/${inc.id}`}
                      className="font-medium text-gray-900 hover:text-[#BF0D0D] transition-colors truncate block max-w-[220px]"
                    >
                      {inc.title}
                    </Link>
                  </td>
                  <td className="px-4 py-3.5 text-gray-600">{inc.clients?.nom_client ?? '—'}</td>
                  <td className="px-4 py-3.5">
                    {badge ? (
                      <span className={`inline-flex px-2 py-0.5 rounded text-[10px] font-semibold ${badge.className}`}>
                        {badge.label}
                      </span>
                    ) : (
                      <span className="text-xs text-gray-400">{inc.status}</span>
                    )}
                  </td>
                  <td className="px-4 py-3.5 text-gray-600">{inc.profiles?.full_name ?? 'Non assigné'}</td>
                  <td className="px-6 py-3.5 text-right text-xs text-gray-400 whitespace-nowrap">
                    {new Date(inc.created_at).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })}
                  </td>
                </tr>
              )
            })
          )}
        </tbody>
      </table>
    </div>
  )
}
