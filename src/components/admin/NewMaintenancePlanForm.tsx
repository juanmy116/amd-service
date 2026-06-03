'use client'

import { useActionState } from 'react'
import Link from 'next/link'
import { Loader2, ArrowLeft } from 'lucide-react'
import { Card } from '@/components/ui/Card'

type FormState = { error: string } | null

type ContractOption = {
  id: string
  numero_contrat: string
  clients:  { nom_client: string }
  /** Representative machine for the contract (first active line, or placeholder) */
  machines: { marque: string; modele: string }
}

type Props = {
  action:    (prev: FormState, data: FormData) => Promise<FormState>
  contracts: ContractOption[]
}

const inputClass =
  'w-full px-3.5 py-2.5 rounded-lg border border-line text-ink text-sm placeholder-ink-muted bg-card focus:outline-none focus:ring-2 focus:ring-accent/30 focus:border-accent'

const selectClass =
  'w-full px-3.5 py-2.5 rounded-lg border border-line text-ink text-sm bg-card focus:outline-none focus:ring-2 focus:ring-accent/30 focus:border-accent'

export default function NewMaintenancePlanForm({ action, contracts }: Props) {
  const [state, formAction, pending] = useActionState(action, null)

  return (
    <div className="p-8 max-w-2xl">

      <div className="flex items-center gap-4 mb-8">
        <Link
          href="/admin/maintenance"
          className="flex items-center justify-center w-9 h-9 rounded-lg border border-line bg-card hover:bg-neutral-soft transition-colors"
        >
          <ArrowLeft size={16} className="text-ink-soft" />
        </Link>
        <h1 className="text-2xl font-semibold text-ink font-display">
          Nouveau plan de maintenance
        </h1>
      </div>

      <form action={formAction} className="space-y-6">

        {state?.error && (
          <div className="px-4 py-3 rounded-lg bg-accent-soft border border-accent/20 text-sm text-accent">
            {state.error}
          </div>
        )}

        <Card className="p-6 space-y-5">

          {/* Contrat */}
          <div>
            <label className="block text-sm font-medium text-ink-soft mb-1.5">
              Contrat <span className="text-accent">*</span>
            </label>
            <select
              name="contract_id"
              required
              defaultValue=""
              className={selectClass}
            >
              <option value="" disabled>Sélectionner un contrat...</option>
              {contracts.map(c => (
                <option key={c.id} value={c.id}>
                  {c.numero_contrat} — {c.clients.nom_client} ({c.machines.marque} {c.machines.modele})
                </option>
              ))}
            </select>
            {contracts.length === 0 && (
              <p className="text-xs text-warning mt-1.5">
                Tous les contrats actifs ont déjà un plan de maintenance.
              </p>
            )}
          </div>

          {/* Fréquence */}
          <div>
            <label className="block text-sm font-medium text-ink-soft mb-1.5">
              Fréquence <span className="text-accent">*</span>
            </label>
            <select name="frequency" required defaultValue="mensuel" className={selectClass}>
              <option value="mensuel">Mensuel (toutes les 4 semaines)</option>
              <option value="trimestriel">Trimestriel (tous les 3 mois)</option>
            </select>
          </div>

          {/* Primera visita */}
          <div>
            <label className="block text-sm font-medium text-ink-soft mb-1.5">
              Date de la première visite <span className="text-accent">*</span>
            </label>
            <input
              name="first_visit"
              type="date"
              required
              className={inputClass}
            />
          </div>

          {/* Notes */}
          <div>
            <label className="block text-sm font-medium text-ink-soft mb-1.5">
              Notes pour les techniciens
            </label>
            <textarea
              name="notes"
              rows={3}
              placeholder="Points à vérifier, consignes particulières..."
              className={`${inputClass} resize-none`}
            />
          </div>
        </Card>

        <div className="flex items-center justify-end gap-3">
          <Link
            href="/admin/maintenance"
            className="px-4 py-2.5 rounded-lg border border-line text-sm font-medium text-ink bg-card hover:bg-neutral-soft transition-colors"
          >
            Annuler
          </Link>
          <button
            type="submit"
            disabled={pending || contracts.length === 0}
            className="flex items-center gap-2 px-5 py-2.5 rounded-lg text-sm font-medium text-white bg-accent disabled:opacity-60 transition-opacity hover:opacity-90"
          >
            {pending && <Loader2 size={15} className="animate-spin" />}
            Créer le plan
          </button>
        </div>
      </form>
    </div>
  )
}
