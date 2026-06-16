'use client'

import { useActionState } from 'react'
import Link from 'next/link'
import { ArrowLeft, Loader2, Building2, MapPin, Wrench, AlertTriangle } from 'lucide-react'
import { Card } from '@/components/ui/Card'
import { PARTS } from '@/lib/parts'

type FormState = { error: string } | null

type Props = {
  boundAction:     (prev: FormState, data: FormData) => Promise<FormState>
  backHref:        string
  scheduledDate:   string
  isOverdue:       boolean
  clientName:      string | null
  machineName:     string
  machineLocation: string | null
  planNotes:       string | null
}

export default function MaintenanceVisitForm({
  boundAction, backHref, scheduledDate, isOverdue,
  clientName, machineName, machineLocation, planNotes,
}: Props) {
  const [state, formAction, pending] = useActionState(boundAction, null)

  return (
    <div className="p-4 space-y-5 pb-10">

      {/* Header */}
      <div className="flex items-center gap-3 pt-2">
        <Link href={backHref} className="flex items-center justify-center w-9 h-9 rounded-xl border border-line bg-card shrink-0">
          <ArrowLeft size={16} className="text-ink-muted" />
        </Link>
        <div>
          <h1 className="text-base font-semibold text-ink font-display">
            Maintenance préventive
          </h1>
          <div className="flex items-center gap-1.5 mt-0.5">
            {isOverdue
              ? <span className="inline-flex items-center gap-1 text-xs font-medium text-accent"><AlertTriangle size={11} /> En retard</span>
              : <span className="text-xs text-info font-medium">Planifiée</span>
            }
            <span className="text-xs text-ink-muted">· {new Date(scheduledDate + 'T00:00:00').toLocaleDateString('fr-FR')}</span>
          </div>
        </div>
      </div>

      {/* Infos */}
      <Card className="p-4 space-y-3">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0 bg-accent">
            <Wrench size={14} className="text-white" />
          </div>
          <p className="text-sm font-semibold text-ink">{machineName}</p>
        </div>
        {clientName && (
          <div className="flex items-center gap-2 text-sm text-ink-soft">
            <Building2 size={14} className="text-ink-muted shrink-0" />
            {clientName}
          </div>
        )}
        {machineLocation && (
          <div className="flex items-center gap-2 text-sm text-ink-soft">
            <MapPin size={14} className="text-ink-muted shrink-0" />
            {machineLocation}
          </div>
        )}
        {planNotes && (
          <div className="pt-2 border-t border-line-subtle">
            <p className="text-xs font-medium text-ink-muted mb-1">Points à vérifier</p>
            <p className="text-sm text-ink-soft">{planNotes}</p>
          </div>
        )}
      </Card>

      <form action={formAction} className="space-y-5">

        {state?.error && (
          <div className="px-4 py-3 rounded-xl bg-red-50 border border-red-200 text-sm text-red-700">
            {state.error}
          </div>
        )}

        {/* Piezas */}
        <Card className="p-4">
          <p className="text-sm font-semibold text-ink-soft mb-3">Pièces remplacées</p>
          <div className="grid grid-cols-2 gap-2">
            {PARTS.map(p => (
              <label key={p.id} className="flex items-center gap-2.5 p-2.5 rounded-xl border border-line cursor-pointer active:bg-neutral-soft">
                <input
                  type="checkbox"
                  name={`part_${p.id}`}
                  className="w-4 h-4 rounded accent-red-600"
                />
                <span className="text-sm text-ink-soft">{p.name}</span>
              </label>
            ))}
          </div>
          <input
            name="autres_pieces"
            type="text"
            placeholder="Autres pièces (libre)"
            className="mt-3 w-full px-3 py-2.5 rounded-xl border border-line text-sm text-ink placeholder-ink-muted focus:outline-none focus:ring-2 focus:ring-accent focus:border-transparent"
          />
        </Card>

        {/* Notes */}
        <Card className="p-4">
          <p className="text-sm font-semibold text-ink-soft mb-3">Notes de la visite</p>
          <textarea
            name="notes"
            rows={4}
            placeholder="État de la machine, observations, anomalies constatées..."
            className="w-full px-3 py-2.5 rounded-xl border border-line text-sm text-ink placeholder-ink-muted focus:outline-none focus:ring-2 focus:ring-accent focus:border-transparent resize-none"
          />
        </Card>

        <button
          type="submit"
          disabled={pending}
          className="w-full flex items-center justify-center gap-2 py-3.5 rounded-2xl text-sm font-semibold text-white bg-accent disabled:opacity-60 transition-opacity"
        >
          {pending && <Loader2 size={16} className="animate-spin" />}
          Clôturer la maintenance
        </button>
      </form>
    </div>
  )
}
