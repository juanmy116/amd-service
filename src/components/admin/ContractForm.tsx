'use client'

import { useActionState, useState } from 'react'
import Link from 'next/link'
import { Loader2, ArrowLeft, Trash2, AlertTriangle } from 'lucide-react'
import { Card } from '@/components/ui/Card'

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

const inputClass =
  'w-full px-3.5 py-2.5 rounded-lg border border-line text-ink text-sm placeholder-ink-muted bg-card focus:outline-none focus:ring-2 focus:ring-accent/30 focus:border-accent'

const selectClass =
  'w-full px-3.5 py-2.5 rounded-lg border border-line text-ink text-sm bg-card focus:outline-none focus:ring-2 focus:ring-accent/30 focus:border-accent'

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
          className="flex items-center justify-center w-9 h-9 rounded-lg border border-line bg-card hover:bg-neutral-soft transition-colors"
        >
          <ArrowLeft size={16} className="text-ink-soft" />
        </Link>
        <h1 className="flex-1 text-2xl font-semibold text-ink font-display">
          {title}
        </h1>

        {/* Delete */}
        {deleteAction && contractId && (
          confirming ? (
            <div className="flex items-center gap-2">
              <span className="text-sm text-ink-soft flex items-center gap-1.5">
                <AlertTriangle size={14} className="text-accent" />
                Confirmer ?
              </span>
              <form action={deleteAction} className="contents">
                <input type="hidden" name="id" value={contractId} />
                <button
                  type="submit"
                  className="px-3 py-2 rounded-lg text-sm font-medium text-white bg-accent"
                >
                  Oui, supprimer
                </button>
              </form>
              <button
                type="button"
                onClick={() => setConfirming(false)}
                className="px-3 py-2 rounded-lg text-sm font-medium text-ink-soft border border-line hover:bg-neutral-soft"
              >
                Annuler
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setConfirming(true)}
              className="flex items-center gap-2 px-3.5 py-2.5 rounded-lg border border-accent/20 text-sm font-medium text-accent bg-card hover:bg-accent-soft transition-colors"
            >
              <Trash2 size={15} />
              Supprimer
            </button>
          )
        )}
      </div>

      {/* Form */}
      <form action={formAction}>
        <Card className="p-6 space-y-5">

          {state?.error && (
            <div className="px-4 py-3 rounded-lg bg-accent-soft border border-accent/20 text-sm text-accent">
              {state.error}
            </div>
          )}

          {/* Nº Contrat */}
          <div>
            <label className="block text-sm font-medium text-ink-soft mb-1.5">
              Numéro de contrat {!isEdit && <span className="text-accent">*</span>}
            </label>
            {isEdit ? (
              <div className="px-3.5 py-2.5 rounded-lg border border-line bg-neutral-soft text-sm text-ink-soft font-mono">
                {defaultValues?.numero_contrat}
              </div>
            ) : (
              <input
                name="numero_contrat"
                type="text"
                required
                defaultValue={defaultValues?.numero_contrat}
                placeholder="AMD-2026-001"
                className={`${inputClass} font-mono`}
              />
            )}
          </div>

          {/* Client + Machine */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-ink-soft mb-1.5">
                Client <span className="text-accent">*</span>
              </label>
              <select
                name="client_id"
                required
                defaultValue={defaultValues?.client_id ?? ''}
                className={selectClass}
              >
                <option value="" disabled>Sélectionner...</option>
                {clients.map((c) => (
                  <option key={c.id} value={c.id}>{c.nom_client}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-ink-soft mb-1.5">
                Machine <span className="text-accent">*</span>
              </label>
              <select
                name="machine_id"
                required
                defaultValue={defaultValues?.machine_id ?? ''}
                className={selectClass}
              >
                <option value="" disabled>Sélectionner...</option>
                {machines.map((m) => (
                  <option key={m.numero_serie} value={m.numero_serie}>
                    {m.marque} {m.modele} — {m.numero_serie}
                  </option>
                ))}
              </select>
              {!isEdit && machines.length === 0 && (
                <p className="text-xs text-warning mt-1.5">
                  Aucune machine disponible (toutes sont déjà assignées à un contrat actif).
                </p>
              )}
            </div>
          </div>

          {/* Dates */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-ink-soft mb-1.5">
                Date de début <span className="text-accent">*</span>
              </label>
              <input
                name="date_debut"
                type="date"
                required
                defaultValue={defaultValues?.date_debut ?? ''}
                className={inputClass}
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-ink-soft mb-1.5">Date de renouvellement</label>
              <input
                name="date_renouvellement"
                type="date"
                defaultValue={defaultValues?.date_renouvellement ?? ''}
                className={inputClass}
              />
            </div>
          </div>

          {/* Lieu d'installation */}
          <div>
            <label className="block text-sm font-medium text-ink-soft mb-1.5">Lieu d&apos;installation</label>
            <input
              name="lieu_installation"
              type="text"
              defaultValue={defaultValues?.lieu_installation ?? ''}
              placeholder="Rue 10, Point E, Dakar"
              className={inputClass}
            />
          </div>

          {/* Statut */}
          <div>
            <label className="block text-sm font-medium text-ink-soft mb-1.5">Statut</label>
            <select
              name="statut"
              defaultValue={defaultValues?.statut ?? 'actif'}
              className={selectClass}
            >
              <option value="actif">Actif</option>
              <option value="suspendu">Suspendu</option>
              <option value="terminé">Terminé</option>
            </select>
          </div>
        </Card>

        {/* Actions */}
        <div className="flex items-center justify-end gap-3 mt-6">
          <Link
            href="/admin/contracts"
            className="px-4 py-2.5 rounded-lg border border-line text-sm font-medium text-ink bg-card hover:bg-neutral-soft transition-colors"
          >
            Annuler
          </Link>
          <button
            type="submit"
            disabled={pending}
            className="flex items-center gap-2 px-5 py-2.5 rounded-lg text-sm font-medium text-white bg-accent disabled:opacity-60 transition-opacity hover:opacity-90"
          >
            {pending && <Loader2 size={15} className="animate-spin" />}
            Enregistrer
          </button>
        </div>
      </form>
    </div>
  )
}
