'use client'

import PanneCard from './PanneCard'
import { filterByStatus, sortByOldestFirst, type BoardIncident } from '@/lib/atelier/board'

type Props = {
  incidents: BoardIncident[]
  statusFilter: string | null
  onStatusFilter: (status: string | null) => void
  selectedId: string | null
  now: Date
  onOpen: (incident: BoardIncident) => void
}

const FILTERS = [
  { value: null, label: 'Toutes' },
  { value: 'nouveau', label: 'Nouveau' },
  { value: 'assigné', label: 'Assigné' },
  { value: 'en_cours', label: 'En cours' },
] as const

export default function PanneList({
  incidents, statusFilter, onStatusFilter, selectedId, now, onOpen,
}: Props) {
  // La más antigua arriba: es una cola de trabajo, no un muro de novedades.
  const visible = sortByOldestFirst(filterByStatus(incidents, statusFilter))

  return (
    <section className="flex flex-col min-h-0">
      <div className="flex items-center justify-between mb-2 px-1 shrink-0">
        <span className="text-sm font-bold uppercase tracking-wide text-white">Pannes</span>
        <span className="rounded-full bg-white/10 px-2 py-0.5 text-xs font-bold text-white/60 tabular-nums">
          {visible.length}
        </span>
      </div>

      <div className="flex gap-1.5 mb-2 shrink-0">
        {FILTERS.map((f) => {
          const active = statusFilter === f.value
          return (
            <button
              key={f.label}
              type="button"
              onClick={() => onStatusFilter(f.value)}
              className={[
                'rounded-full px-3 py-1 text-xs font-bold transition-colors',
                active ? 'bg-white text-ink' : 'bg-white/5 text-white/60 hover:text-white',
              ].join(' ')}
            >
              {f.label}
            </button>
          )
        })}
      </div>

      <div className="flex-1 min-h-0 space-y-2 overflow-y-auto rounded-xl border-2 border-white/[0.05] bg-white/[0.02] p-2">
        {visible.map((incident) => (
          <PanneCard
            key={incident.id}
            incident={incident}
            selected={selectedId === incident.id}
            now={now}
            onOpen={onOpen}
          />
        ))}

        {visible.length === 0 && (
          <div className="flex h-32 items-center justify-center text-sm text-white/25">
            Aucune panne
          </div>
        )}
      </div>
    </section>
  )
}
