'use client'

import { useActionState, useState } from 'react'
import Link from 'next/link'
import { Loader2, ArrowLeft, Trash2, AlertTriangle } from 'lucide-react'

type FormState = { error: string } | null

type ContractData = {
  numero_contrat?: string
  client_id?: number
  machine_id?: string
  date_debut?: string
  date_renouvellement?: string | null
  lieu_installation?: string | null
  statut?: 'actif' | 'suspendu' | 'terminé'
}

type ClientOption = { id: number; nom_client: string }
type MachineOption = { numero_serie: string; marque: string; modele: string }

type Props = {
  action: (prev: FormState, data: FormData) => Promise<FormState>
  defaultValues?: ContractData
  clients: ClientOption[]
  machines: MachineOption[]
  title: string
  isEdit?: boolean
  contractId?: string
  deleteAction?: (formData: FormData) => Promise<void>
}

export default function ContractForm({
  action, defaultValues, clients, machines, title, isEdit, contractId, deleteAction,
}: Props) {
  const [state, formAction, pending] = useActionState(action, null)
  const [confirming, setConfirming] = useState(false)

  return (
    <div className="p-8 max-w-3xl">

      {/* Header */}
      <div className="flex items-center gap-4 mb-8">
        <Link
          href="/admin/contracts"
          className="flex items-center justify-center w-9 h-9 rounded-lg border border-gray-200 bg-white hover:bg-gray-50 transition-colors"
        >
          <ArrowLeft size={16} className="text-gray-600" />
        </Link>
        <h1 className="flex-1 text-2xl font-semibold text-gray-900" style={{ fontFamily: 'Poppins, sans-serif' }}>
          {title}
        </h1>

        {/* Delete */}
        {deleteAction && contractId && (
          confirming ? (
            <div className="flex items-center gap-2">
              <span className="text-sm text-gray-600 flex items-center gap-1.5">
                <AlertTriangle size={14} className="text-red-500" />
                Confirmer ?
              </span>
              <form action={deleteAction} className="contents">
                <input type="hidden" name="id" value={contractId} />
                <button
                  type="submit"
                  className="px-3 py-2 rounded-lg text-sm font-medium text-white"
                  style={{ backgroundColor: '#BF0D0D' }}
                >
                  Oui, supprimer
                </button>
              </form>
              <button
                type="button"
                onClick={() => setConfirming(false)}
                className="px-3 py-2 rounded-lg text-sm font-medium text-gray-600 border border-gray-300 hover:bg-gray-50"
              >
                Annuler
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setConfirming(true)}
              className="flex items-center gap-2 px-3.5 py-2.5 rounded-lg border border-red-200 text-sm font-medium text-red-600 bg-white hover:bg-red-50 transition-colors"
            >
              <Trash2 size={15} />
              Supprimer
            </button>
          )
        )}
      </div>

      {/* Form */}
      <form action={formAction}>
        <div className="bg-white rounded-xl border border-gray-200 p-6 space-y-5">

          {state?.error && (
            <div className="px-4 py-3 rounded-lg bg-red-50 border border-red-200 text-sm text-red-700">
              {state.error}
            </div>
          )}

          {/* Nº Contrat */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">
              Numéro de contrat {!isEdit && <span className="text-red-500">*</span>}
            </label>
            {isEdit ? (
              <div className="px-3.5 py-2.5 rounded-lg border border-gray-200 bg-gray-50 text-sm text-gray-600 font-mono">
                {defaultValues?.numero_contrat}
              </div>
            ) : (
              <input
                name="numero_contrat"
                type="text"
                required
                defaultValue={defaultValues?.numero_contrat}
                placeholder="AMD-2026-001"
                className="w-full px-3.5 py-2.5 rounded-lg border border-gray-300 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-red-500 focus:border-transparent font-mono"
              />
            )}
          </div>

          {/* Client + Machine */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">
                Client <span className="text-red-500">*</span>
              </label>
              <select
                name="client_id"
                required
                defaultValue={defaultValues?.client_id ?? ''}
                className="w-full px-3.5 py-2.5 rounded-lg border border-gray-300 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-red-500 focus:border-transparent bg-white"
              >
                <option value="" disabled>Sélectionner...</option>
                {clients.map((c) => (
                  <option key={c.id} value={c.id}>{c.nom_client}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">
                Machine <span className="text-red-500">*</span>
              </label>
              <select
                name="machine_id"
                required
                defaultValue={defaultValues?.machine_id ?? ''}
                className="w-full px-3.5 py-2.5 rounded-lg border border-gray-300 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-red-500 focus:border-transparent bg-white"
              >
                <option value="" disabled>Sélectionner...</option>
                {machines.map((m) => (
                  <option key={m.numero_serie} value={m.numero_serie}>
                    {m.marque} {m.modele} — {m.numero_serie}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Dates */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">
                Date de début <span className="text-red-500">*</span>
              </label>
              <input
                name="date_debut"
                type="date"
                required
                defaultValue={defaultValues?.date_debut ?? ''}
                className="w-full px-3.5 py-2.5 rounded-lg border border-gray-300 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-red-500 focus:border-transparent"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">Date de renouvellement</label>
              <input
                name="date_renouvellement"
                type="date"
                defaultValue={defaultValues?.date_renouvellement ?? ''}
                className="w-full px-3.5 py-2.5 rounded-lg border border-gray-300 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-red-500 focus:border-transparent"
              />
            </div>
          </div>

          {/* Lieu d'installation */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">Lieu d&apos;installation</label>
            <input
              name="lieu_installation"
              type="text"
              defaultValue={defaultValues?.lieu_installation ?? ''}
              placeholder="Rue 10, Point E, Dakar"
              className="w-full px-3.5 py-2.5 rounded-lg border border-gray-300 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-red-500 focus:border-transparent"
            />
          </div>

          {/* Statut */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">Statut</label>
            <select
              name="statut"
              defaultValue={defaultValues?.statut ?? 'actif'}
              className="w-full px-3.5 py-2.5 rounded-lg border border-gray-300 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-red-500 focus:border-transparent bg-white"
            >
              <option value="actif">Actif</option>
              <option value="suspendu">Suspendu</option>
              <option value="terminé">Terminé</option>
            </select>
          </div>
        </div>

        {/* Actions */}
        <div className="flex items-center justify-end gap-3 mt-6">
          <Link
            href="/admin/contracts"
            className="px-4 py-2.5 rounded-lg border border-gray-300 text-sm font-medium text-gray-700 bg-white hover:bg-gray-50 transition-colors"
          >
            Annuler
          </Link>
          <button
            type="submit"
            disabled={pending}
            className="flex items-center gap-2 px-5 py-2.5 rounded-lg text-sm font-medium text-white disabled:opacity-60 transition-opacity hover:opacity-90"
            style={{ backgroundColor: '#BF0D0D' }}
          >
            {pending && <Loader2 size={15} className="animate-spin" />}
            Enregistrer
          </button>
        </div>
      </form>
    </div>
  )
}
