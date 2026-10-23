'use client'

import { useActionState, useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Dialog, DialogBackdrop, DialogPanel, DialogTitle } from '@headlessui/react'
import { FileText, Ban, RotateCcw, AlertTriangle } from 'lucide-react'
import { Card } from '@/components/ui/Card'
import { Badge } from '@/components/ui/Badge'
import ReplaceMachineModal from '@/components/admin/ReplaceMachineModal'
import { DIALOG_BACKDROP_TRANSITION, DIALOG_PANEL_TRANSITION } from '@/components/ui/dialogTransitions'
import type { ReplaceState } from '@/app/admin/contracts/[id]/replace-actions'
import type { HorsServiceState } from '@/app/admin/machines/[serie]/actions'
import { useSubmitKeepingValues } from '@/lib/useSubmitKeepingValues'

type Machine = { numero_serie: string; marque: string; modele: string }

export type MachineOpenLine = {
  id: string
  contractId: string
  numeroContrat: string
  clientName: string | null
  dateDebut: string
}

type Props = {
  serie: string
  active: boolean
  horsServiceAt: string | null
  horsServiceReason: string | null
  horsServiceByName: string | null
  openLine: MachineOpenLine | null
  replacementCandidates: Machine[]
  replaceAction: ((prev: ReplaceState, data: FormData) => Promise<ReplaceState>) | null
  horsServiceAction: (prev: HorsServiceState, data: FormData) => Promise<HorsServiceState>
  returnToServiceAction: (prev: HorsServiceState, data: FormData) => Promise<HorsServiceState>
}

const fmtDate = (iso: string) => new Date(iso.length === 10 ? `${iso}T00:00:00` : iso).toLocaleDateString('fr-FR')

/**
 * Contrato y estado de la máquina. Una máquina no se borra nunca (pasa de cliente en cliente):
 * en contrato se REEMPLAZA; en stock se puede poner HORS SERVICE por obsolescencia; y una baja
 * se puede deshacer. La BD aplica las mismas reglas (20261023180000_machines_hors_service.sql).
 */
export default function MachineStatusCard(props: Props) {
  const { serie, active, horsServiceAt, horsServiceReason, horsServiceByName, openLine } = props

  return (
    <Card className="p-6 space-y-4">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-sm font-semibold text-ink-soft uppercase tracking-wide">Contrat et statut</h2>
        {!active
          ? <Badge variant="danger">Hors service</Badge>
          : openLine
            ? <Badge variant="success">Sous contrat</Badge>
            : <Badge variant="neutral">En stock</Badge>}
      </div>

      {openLine && (
        <div className="flex items-center justify-between gap-4 rounded-lg border border-line px-4 py-3">
          <div className="min-w-0 flex items-start gap-3">
            <FileText size={16} className="mt-0.5 shrink-0 text-ink-muted" />
            <div className="min-w-0">
              <p className="text-sm text-ink truncate">
                <Link href={`/admin/contracts/${openLine.contractId}`} className="font-mono font-medium hover:text-accent">
                  {openLine.numeroContrat}
                </Link>
                {openLine.clientName && <span className="text-ink-soft"> · {openLine.clientName}</span>}
              </p>
              <p className="text-xs text-ink-muted mt-0.5">Depuis le {fmtDate(openLine.dateDebut)}</p>
            </div>
          </div>
          {props.replaceAction && (
            <ReplaceMachineModal
              outLineId={openLine.id}
              outMachineId={serie}
              replacementCandidates={props.replacementCandidates}
              action={props.replaceAction}
            />
          )}
        </div>
      )}

      {active && openLine && (
        <p className="text-xs text-ink-muted">
          Pour la mettre hors service, remplacez-la ou retirez-la d&apos;abord du contrat : elle revient alors en stock.
        </p>
      )}

      {active && !openLine && <HorsServiceButton serie={serie} action={props.horsServiceAction} />}

      {!active && (
        <div className="rounded-lg border border-accent/20 bg-accent-soft px-4 py-3 space-y-1">
          <p className="text-sm text-ink">
            Hors service{horsServiceAt ? <> depuis le <span className="font-medium">{fmtDate(horsServiceAt)}</span></> : null}
            {horsServiceByName ? <span className="text-ink-soft"> · par {horsServiceByName}</span> : null}
          </p>
          {horsServiceReason && <p className="text-sm text-ink-soft">Motif : {horsServiceReason}</p>}
          <p className="text-xs text-ink-muted">Elle n&apos;est plus proposée pour les contrats et ne peut plus être scannée.</p>
          <ReturnToServiceButton action={props.returnToServiceAction} />
        </div>
      )}
    </Card>
  )
}

function HorsServiceButton({ serie, action }: { serie: string; action: Props['horsServiceAction'] }) {
  const [open, setOpen] = useState(false)
  const [state, formAction, pending] = useActionState<HorsServiceState, FormData>(action, null)
  const submitKeepingValues = useSubmitKeepingValues(formAction)
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
        className="inline-flex items-center gap-1.5 rounded-lg border border-accent/30 px-3 py-1.5 text-xs font-medium text-accent hover:bg-accent-soft transition-colors"
      >
        <Ban size={13} />
        Mettre hors service
      </button>

      <Dialog open={open} onClose={() => setOpen(false)} className="relative z-50">
        <DialogBackdrop transition className={`fixed inset-0 bg-black/30 backdrop-blur-sm ${DIALOG_BACKDROP_TRANSITION}`} />
        <div className="fixed inset-0 flex items-center justify-center p-4">
          <DialogPanel transition className={`w-full max-w-lg rounded-xl bg-card border border-line shadow-xl p-6 ${DIALOG_PANEL_TRANSITION}`}>
            <DialogTitle className="text-base font-semibold text-ink mb-1">Mettre hors service</DialogTitle>
            <p className="text-sm text-ink-muted mb-5">
              Machine <span className="font-mono font-medium text-ink">{serie}</span>. Elle ne sera pas supprimée :
              son historique est conservé et la décision peut être annulée.
            </p>
            <form onSubmit={submitKeepingValues} className="space-y-4">
              {state && 'error' in state && (
                <div className="flex items-start gap-2 rounded-lg bg-accent-soft border border-accent/20 px-4 py-3 text-sm text-accent">
                  <AlertTriangle size={15} className="mt-0.5 shrink-0" />
                  {state.error}
                </div>
              )}
              <div>
                <label className="block text-sm font-medium text-ink-soft mb-1.5">
                  Motif <span className="text-accent">*</span>
                </label>
                <textarea
                  name="reason"
                  required
                  rows={3}
                  maxLength={500}
                  placeholder="Obsolète, pièces introuvables, réparation trop coûteuse…"
                  className="w-full rounded-lg border border-line bg-card px-3.5 py-2.5 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-accent/40"
                />
              </div>
              <div className="flex justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  className="px-4 py-2 rounded-lg border border-line text-sm font-medium text-ink bg-card hover:bg-neutral-soft"
                >
                  Annuler
                </button>
                <button
                  type="submit"
                  disabled={pending}
                  className="px-4 py-2 rounded-lg text-sm font-medium text-white bg-accent disabled:opacity-60 hover:opacity-90"
                >
                  {pending ? '…' : 'Mettre hors service'}
                </button>
              </div>
            </form>
          </DialogPanel>
        </div>
      </Dialog>
    </>
  )
}

function ReturnToServiceButton({ action }: { action: Props['returnToServiceAction'] }) {
  const [confirming, setConfirming] = useState(false)
  const [state, formAction, pending] = useActionState<HorsServiceState, FormData>(action, null)
  const router = useRouter()

  useEffect(() => {
    if (state && 'success' in state) router.refresh()
  }, [state, router])

  if (!confirming) {
    return (
      <button
        type="button"
        onClick={() => setConfirming(true)}
        className="mt-2 inline-flex items-center gap-1.5 rounded-lg border border-line bg-card px-3 py-1.5 text-xs font-medium text-ink-soft hover:bg-neutral-soft"
      >
        <RotateCcw size={13} />
        Remettre en service
      </button>
    )
  }

  return (
    <form action={formAction} className="mt-2 flex items-center gap-2">
      <span className="text-xs text-ink-soft">Remettre cette machine en service ?</span>
      <button type="submit" disabled={pending} className="px-3 py-1.5 rounded-lg text-xs font-medium text-white bg-accent disabled:opacity-60">
        {pending ? '…' : 'Oui'}
      </button>
      <button type="button" onClick={() => setConfirming(false)} className="px-3 py-1.5 rounded-lg text-xs font-medium text-ink-soft border border-line bg-card">
        Annuler
      </button>
      {state && 'error' in state && <span className="text-xs text-accent">{state.error}</span>}
    </form>
  )
}
