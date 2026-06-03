'use client'

import { useActionState } from 'react'
import Link from 'next/link'
import { Loader2, ArrowLeft, QrCode, AlertTriangle } from 'lucide-react'
import { Card } from '@/components/ui/Card'

type FormState = { error: string } | null
type ContractOption = { id: string; label: string }

type Props = {
  action: (prev: FormState, data: FormData) => Promise<FormState>
  contracts: ContractOption[]
  preselectedContractId?: string | null
  machineNotFound?: boolean
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

const inputClass = 'w-full px-3.5 py-2.5 rounded-lg border border-line text-ink text-sm placeholder-ink-muted focus:outline-none focus:ring-2 focus:ring-accent/30 focus:border-accent'
const selectClass = 'w-full px-3.5 py-2.5 rounded-lg border border-line text-ink text-sm bg-card focus:outline-none focus:ring-2 focus:ring-accent/30 focus:border-accent'

export default function NewIncidentForm({ action, contracts, preselectedContractId, machineNotFound }: Props) {
  const [state, formAction, pending] = useActionState(action, null)

  return (
    <div className="max-w-2xl">
      <div className="flex items-center gap-4 mb-8">
        <Link href="/portal/incidents" className="flex items-center justify-center w-9 h-9 rounded-lg border border-line bg-card hover:bg-neutral-soft transition-colors">
          <ArrowLeft size={16} className="text-ink-soft" />
        </Link>
        <h1 className="text-2xl font-semibold text-ink font-display">
          Signaler un problème
        </h1>
      </div>

      {/* Banner QR — máquina escaneada no pertenece al cliente */}
      {machineNotFound && (
        <div className="flex items-start gap-3 px-4 py-3 rounded-lg bg-warning-soft border border-warning/30 text-sm text-ink mb-5">
          <AlertTriangle size={16} className="mt-0.5 shrink-0 text-warning" />
          <span>La machine scannée ne fait pas partie de votre contrat. Sélectionnez une machine ci-dessous.</span>
        </div>
      )}

      {/* Banner QR — máquina preseleccionada correctamente */}
      {preselectedContractId && (
        <div className="flex items-center gap-3 px-4 py-3 rounded-lg bg-success-soft border border-success/20 text-sm text-ink mb-5">
          <QrCode size={16} className="shrink-0 text-success" />
          <span>Machine identifiée par QR code et pré-sélectionnée.</span>
        </div>
      )}

      <form action={formAction}>
        <Card className="p-6 space-y-5">

          {state?.error && (
            <div className="px-4 py-3 rounded-lg bg-accent-soft border border-accent/20 text-sm text-accent">
              {state.error}
            </div>
          )}

          {/* Machine concernée */}
          <div>
            <label className="block text-sm font-medium text-ink-soft mb-1.5">
              Machine concernée <span className="text-accent">*</span>
            </label>
            {contracts.length === 0 ? (
              <p className="text-sm text-ink-muted">Aucune machine active sur votre contrat.</p>
            ) : (
              <select
                name="contract_machine_id"
                required
                defaultValue={preselectedContractId ?? ''}
                className={selectClass}
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
            <label className="block text-sm font-medium text-ink-soft mb-1.5">
              Titre du problème <span className="text-accent">*</span>
            </label>
            <input
              name="title"
              type="text"
              required
              placeholder="Ex : Bourrage papier récurrent"
              className={inputClass}
            />
          </div>

          {/* Description */}
          <div>
            <label className="block text-sm font-medium text-ink-soft mb-1.5">Description</label>
            <textarea
              name="description"
              rows={4}
              placeholder="Décrivez le problème en détail : depuis quand, dans quelles conditions, messages d'erreur..."
              className={`${inputClass} resize-none`}
            />
          </div>

          {/* Catégorie */}
          <div>
            <label className="block text-sm font-medium text-ink-soft mb-1.5">Type de problème</label>
            <div className="space-y-2">
              {CATEGORY_OPTIONS.map((o) => (
                <label key={o.value} className="flex items-center gap-3 p-3 rounded-lg border border-line hover:border-ink-muted cursor-pointer transition-colors">
                  <input type="radio" name="category" value={o.value} defaultChecked={o.value === 'panne'} className="accent-red-600" />
                  <span className="text-sm text-ink-soft">{o.label}</span>
                </label>
              ))}
            </div>
          </div>

          {/* Priorité */}
          <div>
            <label className="block text-sm font-medium text-ink-soft mb-1.5">Urgence</label>
            <div className="space-y-2">
              {PRIORITY_OPTIONS.map((o) => (
                <label key={o.value} className="flex items-center gap-3 p-3 rounded-lg border border-line hover:border-ink-muted cursor-pointer transition-colors">
                  <input type="radio" name="priority" value={o.value} defaultChecked={o.value === 'normale'} className="accent-red-600" />
                  <span className="text-sm text-ink-soft">{o.label}</span>
                </label>
              ))}
            </div>
          </div>
        </Card>

        <div className="flex items-center justify-end gap-3 mt-6">
          <Link href="/portal/incidents" className="px-4 py-2.5 rounded-lg border border-line text-sm font-medium text-ink bg-card hover:bg-neutral-soft transition-colors">
            Annuler
          </Link>
          <button
            type="submit"
            disabled={pending || contracts.length === 0}
            className="flex items-center gap-2 px-5 py-2.5 rounded-lg text-sm font-medium text-white bg-accent disabled:opacity-60 transition-opacity hover:opacity-90"
          >
            {pending && <Loader2 size={15} className="animate-spin" />}
            Envoyer le signalement
          </button>
        </div>
      </form>
    </div>
  )
}
