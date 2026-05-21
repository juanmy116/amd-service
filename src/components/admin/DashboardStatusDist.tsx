import { Card } from '@/components/ui/Card'
import { PanelHeader } from '@/components/ui/PanelHeader'

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
    <div className="col-span-2">
      <Card>
        <PanelHeader
          title="Statut des incidents"
          action={{ label: 'Voir le kanban →', href: '/admin/incidents' }}
        />
        <div className="p-5">
          {statusTotal === 0 ? (
            <div className="flex items-center justify-center h-32 text-sm text-ink-muted">
              Aucun incident enregistré
            </div>
          ) : (
            <div className="space-y-4">
              {Object.entries(STATUS_CONFIG).map(([key, { label, color }]) => {
                const count = statusDist[key] ?? 0
                const pct = Math.round((count / statusTotal) * 100)
                return (
                  <div key={key}>
                    <div className="flex items-center justify-between mb-1.5">
                      <div className="flex items-center gap-2">
                        <span
                          className="w-2 h-2 rounded-full shrink-0"
                          style={{ backgroundColor: color }}
                        />
                        <span className="text-xs font-medium text-ink-soft">{label}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-semibold text-ink">{count}</span>
                        <span className="text-xs text-ink-muted w-8 text-right">{pct}%</span>
                      </div>
                    </div>
                    <div className="h-1.5 bg-neutral-soft rounded-full overflow-hidden">
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
          <div className="mt-5 pt-4 border-t border-line-subtle flex items-center justify-between">
            <p className="text-xs text-ink-muted">Total enregistrés</p>
            <p className="text-sm font-semibold text-ink">{statusTotal}</p>
          </div>
        </div>
      </Card>
    </div>
  )
}
