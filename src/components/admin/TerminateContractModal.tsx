'use client'

import { Dialog, DialogPanel, DialogTitle } from '@headlessui/react'
import { useActionState, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import type { TerminateState } from '@/app/admin/contracts/[id]/terminate-actions'

type OpenLine = { id: string; machine_id: string }

type Props = {
  openLines: OpenLine[]
  action: (prev: TerminateState, formData: FormData) => Promise<TerminateState>
}

const inputClass =
  'w-full rounded-lg border border-line bg-card px-3.5 py-2.5 text-sm text-ink ' +
  'focus:outline-none focus:ring-2 focus:ring-accent/40'
const labelClass = 'block text-sm font-medium text-ink-soft mb-1.5'

export default function TerminateContractModal({ openLines, action }: Props) {
  const [open, setOpen] = useState(false)
  const [state, formAction, pending] = useActionState<TerminateState, FormData>(action, null)
  const [readings, setReadings] = useState<Record<string, { bw: string; color: string }>>({})
  const router = useRouter()

  useEffect(() => {
    if (state && 'success' in state) {
      setOpen(false)
      router.refresh()
    }
  }, [state, router])

  const setReading = (id: string, field: 'bw' | 'color', value: string) =>
    setReadings((r) => ({ ...r, [id]: { ...r[id], [field]: value } }))

  // Payload de líneas que consume la server action / RPC.
  const linesJson = JSON.stringify(
    openLines.map((l) => ({
      cm_id: l.id,
      end_counter_bw: Number(readings[l.id]?.bw ?? ''),
      end_counter_color: Number(readings[l.id]?.color ?? ''),
    })),
  )

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-1.5 rounded-btn border border-red-300 bg-red-50 px-3 py-1.5 text-xs font-medium text-red-700 hover:bg-red-600 hover:text-white transition-colors"
      >
        Terminer le contrat
      </button>

      <Dialog open={open} onClose={() => setOpen(false)} className="relative z-50">
        <div className="fixed inset-0 bg-black/30 backdrop-blur-sm" aria-hidden="true" />
        <div className="fixed inset-0 flex items-center justify-center p-4">
          <DialogPanel className="w-full max-w-lg rounded-xl bg-surface border border-line shadow-xl p-6 max-h-[90vh] overflow-y-auto">
            <DialogTitle className="text-base font-semibold text-ink mb-1">
              Terminer le contrat
            </DialogTitle>
            <p className="text-sm text-ink-muted mb-5">
              Toutes les machines seront clôturées et renvoyées au stock. Renseignez le relevé
              final de chacune&nbsp;: c'est la dernière lecture facturée.
            </p>

            <form action={formAction} className="space-y-4">
              <input type="hidden" name="lines" value={linesJson} />

              {state && 'error' in state && (
                <div className="rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">
                  {state.error}
                </div>
              )}

              <div>
                <label className={labelClass}>
                  Date de fin <span className="text-accent">*</span>
                </label>
                <input
                  type="date"
                  name="date"
                  required
                  className={inputClass}
                  max={new Date().toISOString().split('T')[0]}
                />
              </div>

              {openLines.map((line) => (
                <fieldset key={line.id} className="rounded-lg border border-line p-4 space-y-3">
                  <legend className="text-xs font-medium text-ink-soft px-1">
                    Relevé de clôture — <span className="font-mono">{line.machine_id}</span>
                  </legend>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className={labelClass}>Compteur N&amp;B</label>
                      <input
                        type="number"
                        min="0"
                        required
                        className={inputClass}
                        placeholder="0"
                        value={readings[line.id]?.bw ?? ''}
                        onChange={(e) => setReading(line.id, 'bw', e.target.value)}
                      />
                    </div>
                    <div>
                      <label className={labelClass}>Compteur couleur</label>
                      <input
                        type="number"
                        min="0"
                        required
                        className={inputClass}
                        placeholder="0"
                        value={readings[line.id]?.color ?? ''}
                        onChange={(e) => setReading(line.id, 'color', e.target.value)}
                      />
                    </div>
                  </div>
                </fieldset>
              ))}

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
                  disabled={pending}
                  className="rounded-btn bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-60 transition-colors"
                >
                  {pending ? 'En cours…' : 'Confirmer la clôture'}
                </button>
              </div>
            </form>
          </DialogPanel>
        </div>
      </Dialog>
    </>
  )
}
