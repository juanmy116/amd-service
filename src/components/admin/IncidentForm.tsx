'use client'

import { useActionState, useState } from 'react'
import Link from 'next/link'
import { Loader2, ArrowLeft, Trash2, AlertTriangle } from 'lucide-react'
import { Card } from '@/components/ui/Card'

type FormState = { error: string } | null

type IncidentData = {
  title?: string
  description?: string | null
  category?: string
  priority?: string
  status?: string
  assigned_to?: string | null
}

type ContractOption    = { id: string; numero_contrat: string; client_name: string }
type TechnicianOption  = { id: string; full_name: string | null }
type ContextInfo       = { clientName: string | null; machineName: string | null; contractNumber: string | null }

type Props = {
  action: (prev: FormState, data: FormData) => Promise<FormState>
  defaultValues?: IncidentData
  contracts?: ContractOption[]
  technicians: TechnicianOption[]
  title: string
  isEdit?: boolean
  incidentId?: string
  deleteAction?: (formData: FormData) => Promise<void>
  contextInfo?: ContextInfo
}

const CATEGORY_OPTIONS = [
  { value: 'panne',       label: 'Panne' },
  { value: 'maintenance', label: 'Maintenance' },
  { value: 'consommable', label: 'Consommable' },
  { value: 'autre',       label: 'Autre' },
]

const PRIORITY_OPTIONS = [
  { value: 'basse',   label: 'Basse' },
  { value: 'normale', label: 'Normale' },
  { value: 'haute',   label: 'Haute' },
  { value: 'urgente', label: 'Urgente' },
]

const STATUS_OPTIONS = [
  { value: 'nouveau',  label: 'Nouveau' },
  { value: 'assigné',  label: 'Assigné' },
  { value: 'en_cours', label: 'En cours' },
  { value: 'résolu',   label: 'Résolu' },
  { value: 'fermé',    label: 'Fermé' },
]

const inputClass =
  'w-full px-3.5 py-2.5 rounded-lg border border-line text-ink text-sm placeholder-ink-muted bg-card focus:outline-none focus:ring-2 focus:ring-accent/30 focus:border-accent'

const selectClass =
  'w-full px-3.5 py-2.5 rounded-lg border border-line text-ink text-sm bg-card focus:outline-none focus:ring-2 focus:ring-accent/30 focus:border-accent'

export default function IncidentForm({
  action, defaultValues, contracts, technicians, title,
  isEdit, incidentId, deleteAction, contextInfo,
}: Props) {
  const [state, formAction, pending] = useActionState(action, null)
  const [confirming, setConfirming] = useState(false)

  return (
    <div className="p-8 max-w-3xl">

      {/* Header */}
      <div className="flex items-center gap-4 mb-8">
        <Link
          href="/admin/incidents"
          className="flex items-center justify-center w-9 h-9 rounded-lg border border-line bg-card hover:bg-neutral-soft transition-colors"
        >
          <ArrowLeft size={16} className="text-ink-soft" />
        </Link>
        <h1 className="flex-1 text-2xl font-semibold text-ink font-display truncate">
          {title}
        </h1>

        {deleteAction && incidentId && (
          confirming ? (
            <div className="flex items-center gap-2 shrink-0">
              <span className="text-sm text-ink-soft flex items-center gap-1.5">
                <AlertTriangle size={14} className="text-accent" />
                Confirmer ?
              </span>
              <form action={deleteAction} className="contents">
                <input type="hidden" name="id" value={incidentId} />
                <button type="submit" className="px-3 py-2 rounded-lg text-sm font-medium text-white bg-accent">
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
              className="flex items-center gap-2 px-3.5 py-2.5 rounded-lg border border-accent/20 text-sm font-medium text-accent bg-card hover:bg-accent-soft transition-colors shrink-0"
            >
              <Trash2 size={15} />
              Supprimer
            </button>
          )
        )}
      </div>

      <form action={formAction}>
        <Card className="p-6 space-y-5">

          {state?.error && (
            <div className="px-4 py-3 rounded-lg bg-accent-soft border border-accent/20 text-sm text-accent">
              {state.error}
            </div>
          )}

          {isEdit && (
            <input type="hidden" name="old_status" value={defaultValues?.status ?? 'nouveau'} />
          )}

          {/* Titre */}
          <div>
            <label className="block text-sm font-medium text-ink-soft mb-1.5">
              Titre <span className="text-accent">*</span>
            </label>
            <input
              name="title"
              type="text"
              required
              defaultValue={defaultValues?.title}
              placeholder="Bourrage papier récurrent"
              className={inputClass}
            />
          </div>

          {/* Description */}
          <div>
            <label className="block text-sm font-medium text-ink-soft mb-1.5">Description</label>
            <textarea
              name="description"
              rows={3}
              defaultValue={defaultValues?.description ?? ''}
              placeholder="Décrivez le problème en détail..."
              className={`${inputClass} resize-none`}
            />
          </div>

          {/* Contrat — create only */}
          {!isEdit && contracts && (
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
                {contracts.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.numero_contrat} — {c.client_name}
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* Context — edit only */}
          {isEdit && contextInfo && (
            <div className="grid grid-cols-3 gap-3 py-3 px-4 bg-neutral-soft rounded-lg border border-line">
              {[
                { label: 'Client',  value: contextInfo.clientName },
                { label: 'Machine', value: contextInfo.machineName },
                { label: 'Contrat', value: contextInfo.contractNumber },
              ].map(({ label, value }) => (
                <div key={label}>
                  <p className="text-xs font-medium text-ink-muted mb-0.5">{label}</p>
                  <p className="text-sm text-ink-soft truncate">{value ?? '—'}</p>
                </div>
              ))}
            </div>
          )}

          {/* Catégorie + Priorité */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-ink-soft mb-1.5">Catégorie</label>
              <select
                name="category"
                defaultValue={defaultValues?.category ?? 'panne'}
                className={selectClass}
              >
                {CATEGORY_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-ink-soft mb-1.5">Priorité</label>
              <select
                name="priority"
                defaultValue={defaultValues?.priority ?? 'normale'}
                className={selectClass}
              >
                {PRIORITY_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            </div>
          </div>

          {/* Statut + Assigné à */}
          <div className={`grid gap-4 ${isEdit ? 'grid-cols-2' : 'grid-cols-1'}`}>
            {isEdit && (
              <div>
                <label className="block text-sm font-medium text-ink-soft mb-1.5">Statut</label>
                <select
                  name="status"
                  defaultValue={defaultValues?.status ?? 'nouveau'}
                  className={selectClass}
                >
                  {STATUS_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
              </div>
            )}
            <div>
              <label className="block text-sm font-medium text-ink-soft mb-1.5">Assigné à</label>
              <select
                name="assigned_to"
                defaultValue={defaultValues?.assigned_to ?? ''}
                className={selectClass}
              >
                <option value="">Non assigné</option>
                {technicians.map((t) => (
                  <option key={t.id} value={t.id}>{t.full_name ?? t.id}</option>
                ))}
              </select>
            </div>
          </div>

          {/* Commentaire — edit only */}
          {isEdit && (
            <div>
              <label className="block text-sm font-medium text-ink-soft mb-1.5">
                Commentaire
                <span className="ml-2 text-xs font-normal text-ink-muted">ajouté à l&apos;historique si le statut change</span>
              </label>
              <textarea
                name="comment"
                rows={2}
                placeholder="Ex : Technicien en déplacement, intervention prévue demain"
                className={`${inputClass} resize-none`}
              />
            </div>
          )}
        </Card>

        {/* Actions */}
        <div className="flex items-center justify-end gap-3 mt-6">
          <Link
            href="/admin/incidents"
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
