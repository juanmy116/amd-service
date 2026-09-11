'use client'

import { groupMaintenancesByDay, type BoardMaintenance, type MaintenanceGroup } from '@/lib/atelier/board'

type Props = {
  maintenances: BoardMaintenance[]
  /** Fecha de hoy en ISO (YYYY-MM-DD), calculada en el servidor para no depender del reloj del kiosko. */
  today: string
  selectedId: string | null
  onOpen: (visit: BoardMaintenance) => void
}

function initials(name: string): string {
  return name.split(' ').filter(Boolean).slice(0, 2).map((p) => p[0]?.toUpperCase() ?? '').join('')
}

function groupTitle(group: MaintenanceGroup, today: string): string {
  if (group.kind === 'retard') return 'En retard'
  if (group.kind === 'today') return "Aujourd'hui"

  const date = new Date(`${group.date}T00:00:00`)
  const tomorrow = new Date(`${today}T00:00:00`)
  tomorrow.setDate(tomorrow.getDate() + 1)
  if (group.date === tomorrow.toISOString().slice(0, 10)) return 'Demain'

  return date.toLocaleDateString('fr-FR', { weekday: 'short', day: 'numeric', month: 'short' })
}

export default function MaintenanceList({ maintenances, today, selectedId, onOpen }: Props) {
  const groups = groupMaintenancesByDay(maintenances, today)
  const total = groups.reduce((sum, g) => sum + g.visits.length, 0)

  return (
    <section className="flex flex-col min-h-0">
      <div className="flex items-center justify-between mb-2 px-1 shrink-0">
        <span className="text-sm font-bold uppercase tracking-wide text-white">Maintenances</span>
        <span className="rounded-full bg-white/10 px-2 py-0.5 text-xs font-bold text-white/60 tabular-nums">
          {total}
        </span>
      </div>

      <div className="flex-1 min-h-0 space-y-3 overflow-y-auto rounded-xl border-2 border-white/[0.05] bg-white/[0.02] p-2">
        {groups.map((group) => (
          <div key={group.kind === 'retard' ? 'retard' : group.date}>
            <p
              className={[
                'mb-1.5 px-1 text-xs font-bold uppercase tracking-wider',
                group.kind === 'retard' ? 'text-accent' : 'text-white/40',
              ].join(' ')}
            >
              {groupTitle(group, today)}
              {group.kind === 'retard' && ` · ${group.visits.length}`}
            </p>

            <div className="space-y-2">
              {group.visits.map((visit) => (
                <button
                  key={visit.id}
                  type="button"
                  onClick={() => onOpen(visit)}
                  className={[
                    'w-full text-left bg-white rounded-xl p-3 relative overflow-hidden transition-all',
                    selectedId === visit.id ? 'ring-2 ring-info' : 'hover:ring-2 hover:ring-info/40',
                  ].join(' ')}
                >
                  <span
                    className="absolute left-0 top-0 bottom-0 w-1"
                    style={{ background: group.kind === 'retard' ? '#BF0D0D' : '#2563EB' }}
                  />
                  <p className="pl-1.5 text-sm font-semibold text-ink leading-snug truncate">
                    {visit.clientName ?? '—'}
                  </p>
                  <p className="pl-1.5 text-xs text-ink-muted mt-0.5 truncate">
                    {visit.machineLabel ?? '—'}
                    {visit.quartierLabel && ` · ${visit.quartierLabel}`}
                  </p>
                  <div className="pl-1.5 mt-2 pt-2 border-t border-line-subtle">
                    {visit.technicianName ? (
                      <span className="flex items-center gap-1.5 text-xs font-medium text-ink-soft truncate">
                        <span className="flex h-4 w-4 items-center justify-center rounded-full bg-neutral-soft text-[9px] font-bold shrink-0">
                          {initials(visit.technicianName)}
                        </span>
                        {visit.technicianName}
                      </span>
                    ) : (
                      <span className="text-xs font-bold text-accent">À assigner</span>
                    )}
                  </div>
                </button>
              ))}
            </div>
          </div>
        ))}

        {groups.length === 0 && (
          <div className="flex h-32 items-center justify-center text-sm text-white/25">
            Aucune visite prévue
          </div>
        )}
      </div>
    </section>
  )
}
