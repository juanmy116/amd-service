'use client'

import { useActionState, useState } from 'react'
import { AlertTriangle, CheckCircle2, Loader2 } from 'lucide-react'
import { Card } from '@/components/ui/Card'
import { useSubmitKeepingValues } from '@/lib/useSubmitKeepingValues'
import { STAFF_DESCRIPTION_MAX } from '@/lib/staffIncident'
import { ErrorBox, PRIMARY_BUTTON, SECONDARY_BUTTON } from '@/app/tech/incidents/[id]/scan-steps'
import { reportPanneAction, type ReportPanneState } from './actions'

/**
 * «Signaler une panne» en la ficha de máquina, solo para técnicos con el permiso (tanda 6).
 * Cerrado es un botón; abierto, un formulario corto. Tras enviar, confirma con el número y
 * explica que la oficina asigna: el técnico no la verá en su lista hasta que se la den.
 */
export default function ReportPanne({ serie }: { serie: string }) {
  const [open, setOpen] = useState(false)
  const [state, formAction, pending] = useActionState<ReportPanneState, FormData>(
    reportPanneAction.bind(null, serie),
    null,
  )
  const submit = useSubmitKeepingValues(formAction)

  if (state && 'numeroIncident' in state) {
    return (
      <Card className="p-4 flex items-start gap-3">
        <CheckCircle2 size={20} className="text-success shrink-0 mt-0.5" />
        <div>
          <p className="text-sm font-semibold text-ink">Panne {state.numeroIncident} signalée</p>
          <p className="text-xs text-ink-muted mt-0.5">Le bureau va l&apos;assigner à un technicien.</p>
        </div>
      </Card>
    )
  }

  if (!open) {
    return (
      <button type="button" onClick={() => setOpen(true)} className={SECONDARY_BUTTON}>
        <AlertTriangle size={16} className="text-accent" />
        Signaler une panne
      </button>
    )
  }

  return (
    <form onSubmit={submit}>
      <Card className="p-4 space-y-4">
        <p className="text-sm font-semibold text-ink">Signaler une panne</p>

        {state && 'error' in state && <ErrorBox>{state.error}</ErrorBox>}

        <div>
          <label htmlFor="panne-description" className="block text-xs font-medium text-ink-soft mb-1.5">
            Ce qui ne va pas <span className="text-accent">*</span>
          </label>
          <textarea
            id="panne-description"
            name="description"
            required
            rows={4}
            maxLength={STAFF_DESCRIPTION_MAX}
            placeholder="Bourrage papier, message d'erreur, bruit…"
            className="w-full px-3.5 py-2.5 rounded-xl border border-line text-ink text-sm placeholder-ink-muted bg-card focus:outline-none focus:ring-2 focus:ring-accent/30 focus:border-accent"
          />
        </div>

        <label className="flex items-center gap-2.5 text-sm text-ink">
          <input name="urgent" type="checkbox" className="w-4 h-4 accent-[#BF0D0D]" />
          Urgente — la machine est à l&apos;arrêt
        </label>

        <div className="space-y-2">
          <button type="submit" disabled={pending} className={PRIMARY_BUTTON}>
            {pending && <Loader2 size={15} className="animate-spin" />}
            Envoyer au bureau
          </button>
          <button type="button" onClick={() => setOpen(false)} disabled={pending} className={SECONDARY_BUTTON}>
            Annuler
          </button>
        </div>
      </Card>
    </form>
  )
}
