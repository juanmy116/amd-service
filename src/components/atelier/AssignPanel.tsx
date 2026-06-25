'use client'

import type { Technician } from './types'

type Props = {
  open: boolean
  title: string
  subtitle: string
  description?: string | null
  photoUrl?: string | null
  technicians: Technician[]
  currentTechnicianId: string | null
  busy: boolean
  onSelect: (technicianId: string | null) => void
  onClose: () => void
}

function initials(name: string): string {
  return name
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? '')
    .join('')
}

export default function AssignPanel({
  open, title, subtitle, description, photoUrl, technicians, currentTechnicianId, busy, onSelect, onClose,
}: Props) {
  if (!open) return null

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <div className="absolute inset-0 bg-black/60" onClick={busy ? undefined : onClose} />
      <div className="relative w-[380px] h-full bg-chrome border-l border-chrome-line flex flex-col">
        <div className="px-6 py-5 border-b border-chrome-line">
          <p className="text-xs font-semibold uppercase tracking-wider text-white/40">{subtitle}</p>
          <p className="text-lg font-semibold text-white mt-1">{title}</p>
        </div>

        {/* Contexto del problema para el despachador: descripción + foto del cliente */}
        {(description || photoUrl) && (
          <div className="px-6 py-4 border-b border-chrome-line space-y-3">
            {description && (
              <p className="text-sm text-white/70 whitespace-pre-wrap line-clamp-4">{description}</p>
            )}
            {photoUrl && (
              <a
                href={photoUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="block w-full overflow-hidden rounded-lg border border-chrome-line hover:opacity-90 transition-opacity"
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={photoUrl} alt="Photo signalée par le client" className="w-full max-h-48 object-cover" />
              </a>
            )}
          </div>
        )}

        <div className="flex-1 overflow-y-auto p-4 space-y-2">
          {technicians.map((tech) => {
            const isCurrent = tech.id === currentTechnicianId
            return (
              <button
                key={tech.id}
                type="button"
                disabled={busy}
                onClick={() => onSelect(tech.id)}
                className={[
                  'w-full flex items-center gap-3 rounded-xl px-4 py-3 text-left transition-colors',
                  isCurrent ? 'bg-accent text-white' : 'bg-white/5 text-white hover:bg-white/10',
                  busy ? 'opacity-50 cursor-not-allowed' : '',
                ].join(' ')}
              >
                <span className="flex h-10 w-10 items-center justify-center rounded-full bg-white/15 text-sm font-bold">
                  {initials(tech.fullName)}
                </span>
                <span className="text-base font-medium">{tech.fullName}</span>
                {isCurrent && <span className="ml-auto text-xs font-semibold">Assigné</span>}
              </button>
            )
          })}
          {technicians.length === 0 && (
            <p className="text-sm text-white/40 px-2 py-4">Aucun technicien enregistré.</p>
          )}
        </div>

        <div className="p-4 border-t border-chrome-line space-y-2">
          {currentTechnicianId && (
            <button
              type="button"
              disabled={busy}
              onClick={() => onSelect(null)}
              className="w-full rounded-xl px-4 py-3 text-base font-medium text-white/70 bg-white/5 hover:bg-white/10 transition-colors disabled:opacity-50"
            >
              Désassigner
            </button>
          )}
          <button
            type="button"
            disabled={busy}
            onClick={onClose}
            className="w-full rounded-xl px-4 py-3 text-base font-medium text-white/50 hover:text-white transition-colors disabled:opacity-50"
          >
            Fermer
          </button>
        </div>
      </div>
    </div>
  )
}
