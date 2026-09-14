'use client'

import { X, Printer, MapPin, CalendarDays } from 'lucide-react'
import type { BoardMaintenance } from '@/lib/atelier/board'
import type { Technician } from './types'

type Props = {
  visit: BoardMaintenance
  technicians: Technician[]
  busy: boolean
  onAssign: (technicianId: string | null) => void
  onClose: () => void
}

function initials(name: string): string {
  return name.split(' ').filter(Boolean).slice(0, 2).map((p) => p[0]?.toUpperCase() ?? '').join('')
}

export default function MaintenanceDetail({ visit, technicians, busy, onAssign, onClose }: Props) {
  const date = new Date(`${visit.scheduledDate}T00:00:00`).toLocaleDateString('fr-FR', {
    weekday: 'long', day: 'numeric', month: 'long',
  })

  return (
    <section className="flex flex-1 min-h-0 flex-col gap-3 rounded-xl border-2 border-white/10 bg-[#15151C] p-5">
      <div className="flex items-start justify-between gap-4 shrink-0">
        <div className="min-w-0">
          <p className="text-sm font-bold uppercase tracking-wider" style={{ color: '#2563EB' }}>
            Maintenance préventive
          </p>
          <h2 className="font-display text-2xl font-extrabold text-white leading-tight mt-1">
            {visit.clientName ?? '—'}
          </h2>
        </div>
        <button
          type="button"
          onClick={onClose}
          disabled={busy}
          className="flex items-center gap-1.5 rounded-lg bg-white/5 px-3 py-2 text-sm font-semibold text-white/60 hover:text-white transition-colors disabled:opacity-50 shrink-0"
        >
          <X size={15} />
          Retour à la carte
        </button>
      </div>

      <div className="flex flex-wrap items-center gap-x-5 gap-y-1.5 text-sm text-white/60 shrink-0">
        <span className="flex items-center gap-1.5 font-semibold text-white">
          <CalendarDays size={14} />{date}
        </span>
        {visit.quartierLabel && (
          <span className="flex items-center gap-1.5"><MapPin size={14} />{visit.quartierLabel}</span>
        )}
        {visit.machineLabel && (
          <span className="flex items-center gap-1.5"><Printer size={14} />{visit.machineLabel}</span>
        )}
      </div>

      <div>
        <p className="text-xs font-bold uppercase tracking-wider text-white/35">Assigner à</p>
        <div className="mt-2 flex flex-wrap gap-2">
          {technicians.map((tech) => {
            const current = tech.id === visit.technicianId
            return (
              <button
                key={tech.id}
                type="button"
                disabled={busy}
                onClick={() => onAssign(current ? null : tech.id)}
                className={[
                  'flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold transition-colors disabled:opacity-50',
                  current ? 'text-white' : 'bg-white/5 text-white hover:bg-white/10',
                ].join(' ')}
                style={current ? { background: '#2563EB' } : undefined}
              >
                <span className="flex h-7 w-7 items-center justify-center rounded-full bg-white/15 text-xs font-bold">
                  {initials(tech.fullName)}
                </span>
                {tech.fullName}
              </button>
            )
          })}
          {technicians.length === 0 && (
            <p className="text-sm text-white/40">Aucun technicien enregistré.</p>
          )}
        </div>
      </div>
    </section>
  )
}
