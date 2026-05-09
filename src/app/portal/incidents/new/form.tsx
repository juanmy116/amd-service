'use client'

import { useActionState } from 'react'
import Link from 'next/link'
import { Loader2, ArrowLeft } from 'lucide-react'

type FormState = { error: string } | null
type ContractOption = { id: string; label: string }

type Props = {
  action: (prev: FormState, data: FormData) => Promise<FormState>
  contracts: ContractOption[]
}

const CATEGORY_OPTIONS = [
  { value: 'panne',       label: 'Panne / dysfonctionnement' },
  { value: 'consommable', label: 'Consommable (toner, papier...)' },
  { value: 'maintenance', label: 'Maintenance' },
  { value: 'autre',       label: 'Autre' },
]

const PRIORITY_OPTIONS = [
  { value: 'normale', label: 'Normale — machine partiellement fonctionnelle' },
  { value: 'haute',   label: 'Haute — impact important sur le travail' },
  { value: 'urgente', label: 'Urgente — machine totalement hors service' },
]

export default function NewIncidentForm({ action, contracts }: Props) {
  const [state, formAction, pending] = useActionState(action, null)

  return (
    <div className="max-w-2xl">
      <div className="flex items-center gap-4 mb-8">
        <Link href="/portal/incidents" className="flex items-center justify-center w-9 h-9 rounded-lg border border-gray-200 bg-white hover:bg-gray-50 transition-colors">
          <ArrowLeft size={16} className="text-gray-600" />
        </Link>
        <h1 className="text-2xl font-semibold text-gray-900" style={{ fontFamily: 'Poppins, sans-serif' }}>
          Signaler un problème
        </h1>
      </div>

      <form action={formAction}>
        <div className="bg-white rounded-xl border border-gray-200 p-6 space-y-5">

          {state?.error && (
            <div className="px-4 py-3 rounded-lg bg-red-50 border border-red-200 text-sm text-red-700">
              {state.error}
            </div>
          )}

          {/* Machine concernée */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">
              Machine concernée <span className="text-red-500">*</span>
            </label>
            {contracts.length === 0 ? (
              <p className="text-sm text-gray-400">Aucune machine active sur votre contrat.</p>
            ) : (
              <select
                name="contract_id"
                required
                defaultValue=""
                className="w-full px-3.5 py-2.5 rounded-lg border border-gray-300 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-red-500 focus:border-transparent bg-white"
              >
                <option value="" disabled>Sélectionner une machine...</option>
                {contracts.map((c) => (
                  <option key={c.id} value={c.id}>{c.label}</option>
                ))}
              </select>
            )}
          </div>

          {/* Titre */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">
              Titre du problème <span className="text-red-500">*</span>
            </label>
            <input
              name="title"
              type="text"
              required
              placeholder="Ex : Bourrage papier récurrent"
              className="w-full px-3.5 py-2.5 rounded-lg border border-gray-300 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-red-500 focus:border-transparent"
            />
          </div>

          {/* Description */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">Description</label>
            <textarea
              name="description"
              rows={4}
              placeholder="Décrivez le problème en détail : depuis quand, dans quelles conditions, messages d'erreur..."
              className="w-full px-3.5 py-2.5 rounded-lg border border-gray-300 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-red-500 focus:border-transparent resize-none"
            />
          </div>

          {/* Catégorie */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">Type de problème</label>
            <div className="space-y-2">
              {CATEGORY_OPTIONS.map((o) => (
                <label key={o.value} className="flex items-center gap-3 p-3 rounded-lg border border-gray-200 hover:border-gray-300 cursor-pointer transition-colors">
                  <input type="radio" name="category" value={o.value} defaultChecked={o.value === 'panne'} className="accent-red-600" />
                  <span className="text-sm text-gray-700">{o.label}</span>
                </label>
              ))}
            </div>
          </div>

          {/* Priorité */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">Urgence</label>
            <div className="space-y-2">
              {PRIORITY_OPTIONS.map((o) => (
                <label key={o.value} className="flex items-center gap-3 p-3 rounded-lg border border-gray-200 hover:border-gray-300 cursor-pointer transition-colors">
                  <input type="radio" name="priority" value={o.value} defaultChecked={o.value === 'normale'} className="accent-red-600" />
                  <span className="text-sm text-gray-700">{o.label}</span>
                </label>
              ))}
            </div>
          </div>
        </div>

        <div className="flex items-center justify-end gap-3 mt-6">
          <Link href="/portal/incidents" className="px-4 py-2.5 rounded-lg border border-gray-300 text-sm font-medium text-gray-700 bg-white hover:bg-gray-50 transition-colors">
            Annuler
          </Link>
          <button
            type="submit"
            disabled={pending || contracts.length === 0}
            className="flex items-center gap-2 px-5 py-2.5 rounded-lg text-sm font-medium text-white disabled:opacity-60 transition-opacity hover:opacity-90"
            style={{ backgroundColor: '#BF0D0D' }}
          >
            {pending && <Loader2 size={15} className="animate-spin" />}
            Envoyer le signalement
          </button>
        </div>
      </form>
    </div>
  )
}
