'use client'

import { Dialog, DialogPanel, DialogTitle } from '@headlessui/react'
import { useEffect, useState } from 'react'
import { RESOLUTION_REASON_LABELS, MIN_NOTE_LENGTH, type OfficeResolution } from '@/lib/resolution'
import { RESOLUTION_REASONS } from '@/lib/enums'

/**
 * Ventana obligatoria para dar una avería por resuelta SIN intervención registrada.
 *
 * Existe para que arrastrar una tarjeta a «Résolu» no sea un gesto invisible: si resolver
 * cuesta lo mismo por las dos vías, nadie elige el atajo por ser más cómodo.
 *
 * No es una copia del formulario del técnico a propósito. Sin checklist de piezas: eso
 * alimenta el historial por máquina y el agente de anomalías, y quien está en la oficina no
 * sabe si se cambió un ADF o un tambor. Y la vía queda marcada por la puerta de entrada, no
 * por lo que se escriba aquí — si no, una resolución de oficina bien redactada sería
 * indistinguible de una intervención real.
 *
 * `variant='kiosk'` la viste para la TV del taller: fondo oscuro y texto grande, porque ahí
 * se rellena de pie, con el teclado del kiosko.
 */

type Props = {
  open: boolean
  /** «SAV-2026-0042 · Bourrage papier» — para saber qué se está cerrando. */
  incidentLabel: string
  technicians: Array<{ id: string; name: string }>
  busy?: boolean
  variant?: 'admin' | 'kiosk'
  onCancel: () => void
  onConfirm: (resolution: OfficeResolution) => void
}

export default function ResolutionDialog({
  open, incidentLabel, technicians, busy = false, variant = 'admin', onCancel, onConfirm,
}: Props) {
  const [reason, setReason] = useState('')
  const [note, setNote] = useState('')
  const [technicianId, setTechnicianId] = useState('')

  // Cada apertura empieza en blanco: heredar el motivo de la avería anterior es la forma más
  // fácil de que alguien confirme sin mirar.
  useEffect(() => {
    if (open) {
      setReason('')
      setNote('')
      setTechnicianId('')
    }
  }, [open])

  const kiosk = variant === 'kiosk'
  const tooShort = note.trim().length < MIN_NOTE_LENGTH
  const canConfirm = reason !== '' && !tooShort && !busy

  const field = kiosk
    ? 'w-full rounded-xl border-2 border-white/15 bg-white/5 px-4 py-3 text-lg text-white focus:border-accent focus:outline-none'
    : 'w-full rounded-lg border border-line bg-card px-3.5 py-2.5 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-accent/30 focus:border-accent'
  const label = kiosk
    ? 'block text-sm font-bold uppercase tracking-wider text-white/40 mb-2'
    : 'block text-sm font-medium text-ink-soft mb-1.5'

  return (
    <Dialog open={open} onClose={onCancel} className="relative z-50">
      <div className="fixed inset-0 bg-black/50 backdrop-blur-sm" aria-hidden="true" />
      <div className="fixed inset-0 flex items-center justify-center p-4">
        <DialogPanel
          className={
            kiosk
              ? 'w-full max-w-2xl space-y-5 rounded-2xl border-2 border-white/10 bg-[#15151C] p-7 text-white'
              : 'w-full max-w-lg space-y-4 rounded-xl border border-line bg-surface p-6 shadow-xl'
          }
        >
          <div>
            <DialogTitle className={kiosk ? 'text-2xl font-extrabold' : 'text-base font-semibold text-ink'}>
              Résoudre sans intervention
            </DialogTitle>
            <p className={kiosk ? 'mt-1 text-base text-white/50' : 'mt-1 text-xs text-ink-muted'}>
              {incidentLabel}
            </p>
          </div>

          <div>
            <label className={label} htmlFor="resolution-reason">Motif</label>
            <select
              id="resolution-reason"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              className={field}
            >
              <option value="">Choisir un motif...</option>
              {RESOLUTION_REASONS.map((r) => (
                <option key={r} value={r}>{RESOLUTION_REASON_LABELS[r]}</option>
              ))}
            </select>
          </div>

          <div>
            <label className={label} htmlFor="resolution-note">Explication</label>
            <textarea
              id="resolution-note"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              rows={kiosk ? 2 : 3}
              placeholder="Deux lignes suffisent : que s'est-il passé ?"
              className={`${field} resize-none`}
            />
          </div>

          <div>
            <label className={label} htmlFor="resolution-technician">
              Un technicien est-il intervenu ?
            </label>
            <select
              id="resolution-technician"
              value={technicianId}
              onChange={(e) => setTechnicianId(e.target.value)}
              className={field}
            >
              <option value="">Non, personne n&apos;est passé</option>
              {technicians.map((t) => (
                <option key={t.id} value={t.id}>Oui — {t.name}</option>
              ))}
            </select>
            <p className={kiosk ? 'mt-2 text-sm text-white/40' : 'mt-1.5 text-xs text-ink-muted'}>
              Si un technicien est passé sans le saisir, son travail sera compté pour lui.
            </p>
          </div>

          <div className={kiosk ? 'flex items-center justify-between gap-4 pt-1' : 'flex items-center justify-between gap-3 pt-1'}>
            <p className={kiosk ? 'text-sm text-white/40' : 'text-xs text-ink-muted'}>
              {reason === ''
                ? 'Choisissez un motif.'
                : tooShort
                  ? `Encore ${MIN_NOTE_LENGTH - note.trim().length} caractère(s).`
                  : ''}
            </p>
            <div className="flex shrink-0 items-center gap-2">
              <button
                type="button"
                onClick={onCancel}
                disabled={busy}
                className={
                  kiosk
                    ? 'rounded-xl bg-white/5 px-5 py-3 text-base font-semibold text-white/60 hover:text-white disabled:opacity-50'
                    : 'rounded-lg border border-line bg-card px-4 py-2.5 text-sm font-medium text-ink hover:bg-neutral-soft disabled:opacity-50'
                }
              >
                Annuler
              </button>
              <button
                type="button"
                onClick={() =>
                  onConfirm({
                    // El `select` solo ofrece valores del catálogo; la Server Action los vuelve
                    // a validar de todas formas.
                    reason: reason as OfficeResolution['reason'],
                    note: note.trim(),
                    technicianId: technicianId || null,
                  })
                }
                disabled={!canConfirm}
                className={
                  kiosk
                    ? 'rounded-xl bg-accent px-6 py-3 text-base font-bold text-white disabled:opacity-40'
                    : 'rounded-lg bg-accent px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-40'
                }
              >
                Résoudre
              </button>
            </div>
          </div>
        </DialogPanel>
      </div>
    </Dialog>
  )
}
