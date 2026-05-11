'use client'

import { useActionState } from 'react'
import Link from 'next/link'
import { Loader2, ArrowLeft } from 'lucide-react'

type FormState = { error: string } | null

type ContractOption = {
  id: string
  numero_contrat: string
  clients:  { nom_client: string }
  machines: { marque: string; modele: string }
}

type Props = {
  action:    (prev: FormState, data: FormData) => Promise<FormState>
  contracts: ContractOption[]
}

const inputClass =
  'w-full px-3.5 py-2.5 rounded-lg border border-gray-300 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-red-500 focus:border-transparent'

export default function NewMaintenancePlanForm({ action, contracts }: Props) {
  const [state, formAction, pending] = useActionState(action, null)

  return (
    <div className="p-8 max-w-2xl">

      <div className="flex items-center gap-4 mb-8">
        <Link
          href="/admin/maintenance"
          className="flex items-center justify-center w-9 h-9 rounded-lg border border-gray-200 bg-white hover:bg-gray-50 transition-colors"
        >
          <ArrowLeft size={16} className="text-gray-600" />
        </Link>
        <h1 className="text-2xl font-semibold text-gray-900" style={{ fontFamily: 'Poppins, sans-serif' }}>
          Nouveau plan de maintenance
        </h1>
      </div>

      <form action={formAction} className="space-y-6">

        {state?.error && (
          <div className="px-4 py-3 rounded-lg bg-red-50 border border-red-200 text-sm text-red-700">
            {state.error}
          </div>
        )}

        <div className="bg-white rounded-xl border border-gray-200 p-6 space-y-5">

          {/* Contrat */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">
              Contrat <span className="text-red-500">*</span>
            </label>
            <select
              name="contract_id"
              required
              defaultValue=""
              className={`${inputClass} bg-white`}
            >
              <option value="" disabled>Sélectionner un contrat...</option>
              {contracts.map(c => (
                <option key={c.id} value={c.id}>
                  {c.numero_contrat} — {c.clients.nom_client} ({c.machines.marque} {c.machines.modele})
                </option>
              ))}
            </select>
            {contracts.length === 0 && (
              <p className="text-xs text-amber-600 mt-1.5">
                Tous les contrats actifs ont déjà un plan de maintenance.
              </p>
            )}
          </div>

          {/* Fréquence */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">
              Fréquence <span className="text-red-500">*</span>
            </label>
            <select name="frequency" required defaultValue="mensuel" className={`${inputClass} bg-white`}>
              <option value="mensuel">Mensuel (toutes les 4 semaines)</option>
              <option value="trimestriel">Trimestriel (tous les 3 mois)</option>
            </select>
          </div>

          {/* Primera visita */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">
              Date de la première visite <span className="text-red-500">*</span>
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
            <label className="block text-sm font-medium text-gray-700 mb-1.5">
              Notes pour les techniciens
            </label>
            <textarea
              name="notes"
              rows={3}
              placeholder="Points à vérifier, consignes particulières..."
              className={`${inputClass} resize-none`}
            />
          </div>
        </div>

        <div className="flex items-center justify-end gap-3">
          <Link
            href="/admin/maintenance"
            className="px-4 py-2.5 rounded-lg border border-gray-300 text-sm font-medium text-gray-700 bg-white hover:bg-gray-50 transition-colors"
          >
            Annuler
          </Link>
          <button
            type="submit"
            disabled={pending || contracts.length === 0}
            className="flex items-center gap-2 px-5 py-2.5 rounded-lg text-sm font-medium text-white disabled:opacity-60 transition-opacity hover:opacity-90"
            style={{ backgroundColor: '#BF0D0D' }}
          >
            {pending && <Loader2 size={15} className="animate-spin" />}
            Créer le plan
          </button>
        </div>
      </form>
    </div>
  )
}
