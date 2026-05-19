import Link from 'next/link'

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
  basse:   'bg-gray-100 text-gray-500',
  normale: 'bg-blue-50 text-blue-600',
  haute:   'bg-orange-50 text-orange-700',
  urgente: 'bg-red-50 text-red-700',
}
const PRIORITY_LABEL: Record<string, string> = {
  basse: 'Basse', normale: 'Normale', haute: 'Haute', urgente: 'Urgente',
}

export type IncidentRow = {
  id: string
  numero_incident: string
  title: string
  status: string
  priority: string
  machine_id: string
  created_at: string
  clientName: string | null
  technicianName: string | null
}

export default function IncidentsListView({ incidents }: { incidents: IncidentRow[] }) {
  if (incidents.length === 0) {
    return (
      <div className="bg-white rounded-xl border border-gray-200 px-5 py-12 text-center text-sm text-gray-400">
        Aucun incident
      </div>
    )
  }

  return (
    <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-gray-200 bg-gray-50">
            <th className="text-left px-5 py-3.5 font-medium text-gray-500">Nº</th>
            <th className="text-left px-5 py-3.5 font-medium text-gray-500">Titre</th>
            <th className="text-left px-5 py-3.5 font-medium text-gray-500">Client</th>
            <th className="text-left px-5 py-3.5 font-medium text-gray-500">Machine</th>
            <th className="text-left px-5 py-3.5 font-medium text-gray-500">Statut</th>
            <th className="text-left px-5 py-3.5 font-medium text-gray-500">Priorité</th>
            <th className="text-left px-5 py-3.5 font-medium text-gray-500">Technicien</th>
            <th className="text-left px-5 py-3.5 font-medium text-gray-500">Date</th>
            <th />
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100">
          {incidents.map((inc) => {
            const href = `/admin/incidents/${inc.id}`
            return (
              <tr key={inc.id} className="hover:bg-gray-50 transition-colors">
                <td className="px-5 py-4 font-mono text-xs">
                  <Link href={href} className="font-semibold text-[#BF0D0D] hover:underline">
                    {inc.numero_incident}
                  </Link>
                </td>
                <td className="px-5 py-4 font-medium max-w-xs">
                  <Link href={href} className="text-gray-900 hover:text-[#BF0D0D] hover:underline transition-colors block truncate">
                    {inc.title}
                  </Link>
                </td>
                <td className="px-5 py-4 text-gray-700">{inc.clientName ?? '—'}</td>
                <td className="px-5 py-4 font-mono text-xs text-gray-500">{inc.machine_id}</td>
                <td className="px-5 py-4">
                  <span className={`inline-flex px-2 py-0.5 rounded text-xs font-medium ${STATUS_STYLE[inc.status] ?? 'bg-gray-100 text-gray-500'}`}>
                    {STATUS_LABEL[inc.status] ?? inc.status}
                  </span>
                </td>
                <td className="px-5 py-4">
                  <span className={`inline-flex px-2 py-0.5 rounded text-xs font-medium ${PRIORITY_STYLE[inc.priority] ?? 'bg-gray-100 text-gray-500'}`}>
                    {PRIORITY_LABEL[inc.priority] ?? inc.priority}
                  </span>
                </td>
                <td className="px-5 py-4 text-gray-600">{inc.technicianName ?? '—'}</td>
                <td className="px-5 py-4 text-xs text-gray-400 whitespace-nowrap">
                  {new Date(inc.created_at).toLocaleDateString('fr-FR')}
                </td>
                <td className="px-5 py-4 text-right">
                  <Link href={href} className="text-sm font-medium text-gray-600 hover:text-gray-900 underline underline-offset-2">
                    Voir
                  </Link>
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
