'use client'

import { ImageIcon } from 'lucide-react'
import { waitingLabel, type BoardIncident } from '@/lib/atelier/board'

type Props = {
  incident: BoardIncident
  selected: boolean
  now: Date
  onOpen: (incident: BoardIncident) => void
}

/** Franja de color de la izquierda: el estado de un vistazo, sin leer nada. */
const STATUS_COLOR: Record<string, string> = {
  nouveau: '#3B82F6',
  'assigné': '#F59E0B',
  en_cours: '#F97316',
}

function initials(name: string): string {
  return name.split(' ').filter(Boolean).slice(0, 2).map((p) => p[0]?.toUpperCase() ?? '').join('')
}

export default function PanneCard({ incident, selected, now, onOpen }: Props) {
  const waiting = waitingLabel(incident.createdAt, now)

  return (
    <button
      type="button"
      onClick={() => onOpen(incident)}
      className={[
        'w-full text-left bg-white rounded-xl p-3.5 relative overflow-hidden transition-all',
        selected ? 'ring-2 ring-accent' : 'hover:ring-2 hover:ring-accent/40',
      ].join(' ')}
    >
      <span
        className="absolute left-0 top-0 bottom-0 w-1"
        style={{ background: STATUS_COLOR[incident.status] ?? '#9CA3AF' }}
      />

      <div className="flex items-center justify-between gap-2 pl-1.5">
        <span className="font-mono text-xs font-bold text-accent">{incident.numeroIncident}</span>
        <span className={`text-xs font-bold ${waiting.urgent ? 'text-accent' : 'text-ink-muted'}`}>
          {waiting.text}
        </span>
      </div>

      <p className="pl-1.5 text-base font-semibold text-ink leading-snug mt-1 line-clamp-2">
        {incident.title}
      </p>

      <p className="pl-1.5 text-sm text-ink-muted mt-1 truncate">
        {incident.clientName ?? '—'}
        {incident.quartierLabel && (
          <span className="ml-1.5 inline-block rounded bg-neutral-soft px-1.5 py-0.5 text-xs font-semibold text-ink-soft align-middle">
            {incident.quartierLabel}
          </span>
        )}
      </p>

      <div className="pl-1.5 mt-2.5 pt-2.5 border-t border-line-subtle flex items-center justify-between gap-2">
        {incident.technicianName ? (
          <span className="flex items-center gap-1.5 text-sm font-medium text-ink-soft truncate">
            <span className="flex h-5 w-5 items-center justify-center rounded-full bg-neutral-soft text-[10px] font-bold text-ink-soft shrink-0">
              {initials(incident.technicianName)}
            </span>
            {incident.technicianName}
          </span>
        ) : (
          <span className="text-sm font-bold text-accent">À assigner</span>
        )}

        <span className="flex items-center gap-1.5 shrink-0">
          {incident.photoUrl && <ImageIcon size={14} className="text-ink-muted" />}
          {incident.priority === 'urgente' && (
            <span className="rounded bg-accent px-2 py-0.5 text-[10px] font-bold text-white">URGENTE</span>
          )}
        </span>
      </div>
    </button>
  )
}
