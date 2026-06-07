'use client'

import { Dialog, DialogPanel, DialogTitle } from '@headlessui/react'
import { useActionState, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import type { ReplaceState } from '@/app/admin/contracts/[id]/replace-actions'

type Machine = { numero_serie: string; marque: string; modele: string }

type Props = {
  outLineId: string
  outMachineId: string
  replacementCandidates: Machine[]
  action: (prev: ReplaceState, formData: FormData) => Promise<ReplaceState>
}

const inputClass =
  'w-full rounded-input border border-line bg-card px-3.5 py-2.5 text-sm text-ink ' +
  'focus:outline-none focus:ring-2 focus:ring-accent/40'
const labelClass = 'block text-sm font-medium text-ink-soft mb-1.5'

export default function ReplaceMachineModal({ outLineId, outMachineId, replacementCandidates, action }: Props) {
  const [open, setOpen] = useState(false)
  const [state, formAction, pending] = useActionState<ReplaceState, FormData>(action, null)
  const router = useRouter()

  useEffect(() => {
    if (state && 'success' in state) {
      setOpen(false)
      router.refresh()
    }
  }, [state, router])

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-1.5 rounded-btn border border-accent/30 bg-accent-soft px-3 py-1.5 text-xs font-medium text-accent hover:bg-accent hover:text-white transition-colors"
      >
        Remplacer
      </button>

      <Dialog open={open} onClose={() => setOpen(false)} className="relative z-50">
        <div className="fixed inset-0 bg-black/30 backdrop-blur-sm" aria-hidden="true" />
        <div className="fixed inset-0 flex items-center justify-center p-4">
          <DialogPanel className="w-full max-w-lg rounded-xl bg-surface border border-line shadow-xl p-6">
            <DialogTitle className="text-base font-semibold text-ink mb-1">
              Remplacer la machine
            </DialogTitle>
            <p className="text-sm text-ink-muted mb-5">
              Machine sortante&nbsp;:{' '}
              <span className="font-mono font-medium text-ink">{outMachineId}</span>
            </p>

            <form action={formAction} className="space-y-4">
              <input type="hidden" name="out_cm_id" value={outLineId} />

              {state && 'error' in state && (
                <div className="rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">
                  {state.error}
                </div>
              )}

              <div>
                <label className={labelClass}>
                  Machine entrante <span className="text-accent">*</span>
                </label>
                <select name="in_machine_id" required className={inputClass}>
                  <option value="">Sélectionner une machine…</option>
                  {replacementCandidates.map((m) => (
                    <option key={m.numero_serie} value={m.numero_serie}>
                      {m.numero_serie} — {m.marque} {m.modele}
                    </option>
                  ))}
                </select>
                {replacementCandidates.length === 0 && (
                  <p className="mt-1.5 text-xs text-ink-muted">
                    Aucune machine disponible. Toutes les machines actives sont déjà en contrat.
                  </p>
                )}
              </div>

              <div>
                <label className={labelClass}>
                  Date du remplacement <span className="text-accent">*</span>
                </label>
                <input
                  type="date"
                  name="date"
                  required
                  className={inputClass}
                  max={new Date().toISOString().split('T')[0]}
                />
              </div>

              <fieldset className="rounded-lg border border-line p-4 space-y-3">
                <legend className="text-xs font-medium text-ink-soft px-1">
                  Relevé de clôture — machine sortante ({outMachineId})
                </legend>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className={labelClass}>Compteur N&amp;B</label>
                    <input
                      type="number"
                      name="out_counter_bw"
                      min="0"
                      required
                      className={inputClass}
                      placeholder="0"
                    />
                  </div>
                  <div>
                    <label className={labelClass}>Compteur couleur</label>
                    <input
                      type="number"
                      name="out_counter_color"
                      min="0"
                      required
                      className={inputClass}
                      placeholder="0"
                    />
                  </div>
                </div>
              </fieldset>

              <fieldset className="rounded-lg border border-line p-4 space-y-3">
                <legend className="text-xs font-medium text-ink-soft px-1">
                  Relevé initial — machine entrante
                </legend>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className={labelClass}>Compteur N&amp;B</label>
                    <input
                      type="number"
                      name="in_counter_bw"
                      min="0"
                      required
                      className={inputClass}
                      placeholder="0"
                    />
                  </div>
                  <div>
                    <label className={labelClass}>Compteur couleur</label>
                    <input
                      type="number"
                      name="in_counter_color"
                      min="0"
                      required
                      className={inputClass}
                      placeholder="0"
                    />
                  </div>
                </div>
              </fieldset>

              <div className="flex justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  className="rounded-btn border border-line px-4 py-2 text-sm text-ink-soft hover:bg-surface-hover transition-colors"
                >
                  Annuler
                </button>
                <button
                  type="submit"
                  disabled={pending || replacementCandidates.length === 0}
                  className="rounded-btn bg-accent px-4 py-2 text-sm font-medium text-white hover:bg-accent/90 disabled:opacity-60 transition-colors"
                >
                  {pending ? 'En cours…' : 'Confirmer le remplacement'}
                </button>
              </div>
            </form>
          </DialogPanel>
        </div>
      </Dialog>
    </>
  )
}
