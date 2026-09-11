'use client'

import { X, Phone, Printer, MapPin } from 'lucide-react'
import { waitingLabel, type BoardIncident } from '@/lib/atelier/board'
import type { Technician } from '@/app/atelier/data'

type Props = {
  incident: BoardIncident
  technicians: Technician[]
  busy: boolean
  now: Date
  onAssign: (technicianId: string | null) => void
  onChangeStatus: (status: string) => void
  onClose: () => void
}

const STATUSES = [
  { value: 'nouveau', label: 'Nouveau', color: '#3B82F6' },
  { value: 'assigné', label: 'Assigné', color: '#F59E0B' },
  { value: 'en_cours', label: 'En cours', color: '#F97316' },
  { value: 'résolu', label: 'Résolu', color: '#16A34A' },
] as const

const LABEL = 'text-xs font-bold uppercase tracking-wider text-white/35'

function initials(name: string): string {
  return name.split(' ').filter(Boolean).slice(0, 2).map((p) => p[0]?.toUpperCase() ?? '').join('')
}

export default function IncidentDetail({
  incident, technicians, busy, now, onAssign, onChangeStatus, onClose,
}: Props) {
  const waiting = waitingLabel(incident.createdAt, now)

  return (
    <section className="flex flex-1 min-h-0 flex-col gap-3 rounded-xl border-2 border-white/10 bg-[#15151C] p-5">
      <div className="flex items-start justify-between gap-4 shrink-0">
        <div className="min-w-0">
          <p className="flex items-center gap-2 font-mono text-sm font-bold text-accent">
            {incident.numeroIncident}
            <span className={`font-sans ${waiting.urgent ? 'text-accent' : 'text-white/40'}`}>
              · {waiting.text}
            </span>
            {incident.priority === 'urgente' && (
              <span className="rounded bg-accent px-2 py-0.5 text-[10px] font-bold text-white">URGENTE</span>
            )}
          </p>
          <h2 className="font-display text-2xl font-extrabold text-white leading-tight mt-1">
            {incident.title}
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
        <span className="font-semibold text-white">{incident.clientName ?? '—'}</span>
        {incident.quartierLabel && (
          <span className="flex items-center gap-1.5"><MapPin size={14} />{incident.quartierLabel}</span>
        )}
        {incident.machineLabel && (
          <span className="flex items-center gap-1.5"><Printer size={14} />{incident.machineLabel}</span>
        )}
        {incident.contactPhone && (
          <span className="flex items-center gap-1.5 font-semibold text-white">
            <Phone size={14} />{incident.contactPhone}
          </span>
        )}
      </div>

      <div className="flex min-h-0 flex-1 gap-4">
        <div className="flex min-w-0 flex-1 flex-col gap-3">
          {incident.description && (
            <p className="max-h-32 overflow-y-auto whitespace-pre-wrap rounded-lg bg-white/5 p-3 text-sm leading-relaxed text-white/75">
              {incident.description}
            </p>
          )}

          <div>
            <p className={LABEL}>Assigner à</p>
            <div className="mt-2 flex flex-wrap gap-2">
              {technicians.map((tech) => {
                const current = tech.id === incident.technicianId
                return (
                  <button
                    key={tech.id}
                    type="button"
                    disabled={busy}
                    onClick={() => onAssign(current ? null : tech.id)}
                    className={[
                      'flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold transition-colors disabled:opacity-50',
                      current ? 'bg-accent text-white' : 'bg-white/5 text-white hover:bg-white/10',
                    ].join(' ')}
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

          <div>
            <p className={LABEL}>Statut</p>
            <div className="mt-2 flex gap-2">
              {STATUSES.map((s) => {
                const current = s.value === incident.status
                return (
                  <button
                    key={s.value}
                    type="button"
                    disabled={busy || current}
                    onClick={() => onChangeStatus(s.value)}
                    className={[
                      'flex-1 rounded-xl py-2.5 text-sm font-bold transition-colors disabled:opacity-60',
                      current ? 'text-white' : 'bg-white/5 text-white/60 hover:bg-white/10 hover:text-white',
                    ].join(' ')}
                    style={current ? { background: s.color } : undefined}
                  >
                    {s.label}
                  </button>
                )
              })}
            </div>
          </div>
        </div>

        {incident.photoUrl && (
          <a
            href={incident.photoUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="w-64 shrink-0 overflow-hidden rounded-lg border border-white/10 transition-opacity hover:opacity-90"
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={incident.photoUrl}
              alt="Photo signalée par le client"
              className="h-full w-full object-cover"
            />
          </a>
        )}
      </div>
    </section>
  )
}
