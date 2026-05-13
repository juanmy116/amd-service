import Link from 'next/link'

const STATUS_CONFIG: Record<string, { label: string; color: string }> = {
  nouveau:  { label: 'Nouveau',  color: '#3B82F6' },
  assigné:  { label: 'Assigné',  color: '#F59E0B' },
  en_cours: { label: 'En cours', color: '#F97316' },
  résolu:   { label: 'Résolu',   color: '#10B981' },
  fermé:    { label: 'Fermé',    color: '#6B7280' },
}

type Props = {
  statusDist: Record<string, number>
  statusTotal: number
}

export default function DashboardStatusDist({ statusDist, statusTotal }: Props) {
  return (
    <div className="col-span-2 bg-white rounded-xl border border-gray-200 p-6">
      <div className="flex items-center justify-between mb-5">
        <h2 className="text-sm font-semibold text-gray-900">Statut des incidents</h2>
        <Link href="/admin/incidents" className="text-xs text-gray-400 hover:text-gray-700 transition-colors">
          Voir le kanban →
        </Link>
      </div>

      {statusTotal === 0 ? (
        <div className="flex items-center justify-center h-32 text-sm text-gray-400">
          Aucun incident enregistré
        </div>
      ) : (
        <div className="space-y-4">
          {Object.entries(STATUS_CONFIG).map(([key, { label, color }]) => {
            const count = statusDist[key] ?? 0
            const pct   = Math.round((count / statusTotal) * 100)
            return (
              <div key={key}>
                <div className="flex items-center justify-between mb-1.5">
                  <div className="flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: color }} />
                    <span className="text-xs font-medium text-gray-600">{label}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-semibold text-gray-800">{count}</span>
                    <span className="text-xs text-gray-400 w-8 text-right">{pct}%</span>
                  </div>
                </div>
                <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
                  <div
                    className="h-full rounded-full transition-all duration-500"
                    style={{ width: `${pct}%`, backgroundColor: color }}
                  />
                </div>
              </div>
            )
          })}
        </div>
      )}

      <div className="mt-5 pt-4 border-t border-gray-100 flex items-center justify-between">
        <p className="text-xs text-gray-400">Total enregistrés</p>
        <p className="text-sm font-semibold text-gray-900">{statusTotal}</p>
      </div>
    </div>
  )
}
