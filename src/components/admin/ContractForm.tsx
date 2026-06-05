'use client'

import { useActionState, useState } from 'react'
import Link from 'next/link'
import { Loader2, ArrowLeft, Trash2, AlertTriangle, Plus, X, RefreshCw } from 'lucide-react'
import { Card } from '@/components/ui/Card'
import MachineCombobox from '@/components/admin/MachineCombobox'

type FormState = { error: string } | null

type ContractData = {
  numero_contrat?: string
  client_id?: number
  date_debut?: string
  date_renouvellement?: string | null
  statut?: 'actif' | 'suspendu' | 'terminé'
  billing_day?: number | null
  maintenance_frequency?: 'mensuel' | 'trimestriel' | null
}

type LineInput = {
  id?: string                                               // present for existing lines
  machine_id: string
  date_debut: string
  billing_day_override: number | null
  maintenance_frequency_override: 'mensuel' | 'trimestriel' | null
  notes: string | null
}

type RetiredLine = {
  id: string
  machine_id: string
  date_debut: string
  date_fin: string
  billing_day_override: number | null
  maintenance_frequency_override: 'mensuel' | 'trimestriel' | null
  notes: string | null
}

type ClientOption = { id: number; nom_client: string }
type MachineOption = { numero_serie: string; marque: string; modele: string }

type Props = {
  action: (prev: FormState, data: FormData) => Promise<FormState>
  defaultValues?: ContractData
  initialLines?: LineInput[]
  clients: ClientOption[]
  availableMachines: MachineOption[]
  title: string
  isEdit?: boolean
  contractId?: string
  deleteAction?: (prev: FormState, data: FormData) => Promise<FormState>
}

const inputClass =
  'w-full px-3.5 py-2.5 rounded-lg border border-line text-ink text-sm placeholder-ink-muted bg-card focus:outline-none focus:ring-2 focus:ring-accent/30 focus:border-accent'

const selectClass =
  'w-full px-3.5 py-2.5 rounded-lg border border-line text-ink text-sm bg-card focus:outline-none focus:ring-2 focus:ring-accent/30 focus:border-accent'

const inputSmClass =
  'w-full px-3 py-2 rounded-lg border border-line text-ink text-sm placeholder-ink-muted bg-card focus:outline-none focus:ring-2 focus:ring-accent/30 focus:border-accent'

const selectSmClass =
  'w-full px-3 py-2 rounded-lg border border-line text-ink text-sm bg-card focus:outline-none focus:ring-2 focus:ring-accent/30 focus:border-accent'

function emptyLine(): LineInput {
  return {
    machine_id: '',
    date_debut: new Date().toISOString().slice(0, 10),
    billing_day_override: null,
    maintenance_frequency_override: null,
    notes: null,
  }
}

export default function ContractForm({
  action, defaultValues, initialLines, clients, availableMachines, title, isEdit, contractId, deleteAction,
}: Props) {
  const [state, formAction, pending] = useActionState(action, null)
  const noopDelete = async (_prev: FormState, _fd: FormData): Promise<FormState> => null
  const [deleteState, deleteFormAction, deletePending] = useActionState(
    deleteAction ?? noopDelete,
    null
  )
  const [confirming, setConfirming] = useState(false)
  const [lines, setLines] = useState<LineInput[]>(initialLines ?? [emptyLine()])
  const [retired, setRetired] = useState<RetiredLine[]>([])
  const [submitted, setSubmitted] = useState(false)

  const today = new Date().toISOString().slice(0, 10)

  function addLine() {
    setLines((prev) => [...prev, emptyLine()])
  }

  // Retirar una línea. Si es existente (tiene id) se mueve a "retired" con date_fin
  // por defecto = hoy (editable). Si es nueva (sin id) se elimina sin más.
  function removeLine(idx: number) {
    setLines((prev) => {
      const line = prev[idx]
      if (line.id) {
        setRetired((r) => [...r, {
          id: line.id!,
          machine_id: line.machine_id,
          date_debut: line.date_debut,
          date_fin: today,
          billing_day_override: line.billing_day_override,
          maintenance_frequency_override: line.maintenance_frequency_override,
          notes: line.notes,
        }])
      }
      return prev.filter((_, i) => i !== idx)
    })
  }

  // "Remplacer": retira la línea existente (con fecha) y añade una nueva vacía.
  function replaceLine(idx: number) {
    removeLine(idx)
    addLine()
  }

  function updateLine<K extends keyof LineInput>(idx: number, key: K, value: LineInput[K]) {
    setLines((prev) => prev.map((l, i) => i === idx ? { ...l, [key]: value } : l))
  }

  function updateRetiredDate(id: string, date_fin: string) {
    setRetired((prev) => prev.map((r) => r.id === id ? { ...r, date_fin } : r))
  }

  function undoRetire(id: string) {
    setRetired((prev) => {
      const item = prev.find((r) => r.id === id)
      if (item) {
        setLines((l) => [...l, {
          id: item.id,
          machine_id: item.machine_id,
          date_debut: item.date_debut,
          billing_day_override: item.billing_day_override,
          maintenance_frequency_override: item.maintenance_frequency_override,
          notes: item.notes,
        }])
      }
      return prev.filter((r) => r.id !== id)
    })
  }

  // Machine IDs already used in other lines (to avoid duplicates)
  const usedMachineIds = new Set(lines.map((l) => l.machine_id).filter(Boolean))

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
              <form action={deleteFormAction} className="contents">
                <input type="hidden" name="id" value={contractId} />
                <button
                  type="submit"
                  disabled={deletePending}
                  className="px-3 py-2 rounded-lg text-sm font-medium text-white bg-accent disabled:opacity-60"
                >
                  {deletePending ? '…' : 'Oui, supprimer'}
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

      {deleteState?.error && (
        <div className="mb-4 px-4 py-3 rounded-lg bg-accent-soft border border-accent/20 text-sm text-accent">
          {deleteState.error}
        </div>
      )}

      {/* Form */}
      <form action={formAction} onSubmit={() => setSubmitted(true)}>
        {/* Hidden field: serialised lines */}
        <input type="hidden" name="lines" value={JSON.stringify(lines)} />
        <input type="hidden" name="retire" value={JSON.stringify(retired)} />

        {/* ── Section 1: Contrat ── */}
        <Card className="p-6 space-y-5 mb-6">

          <h2 className="text-sm font-semibold text-ink-soft uppercase tracking-wide">
            Informations du contrat
          </h2>

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

          {/* Client */}
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

          {/* Statut + Billing day + Maintenance frequency */}
          <div className="grid grid-cols-3 gap-4">
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
            <div>
              <label className="block text-sm font-medium text-ink-soft mb-1.5">
                Jour de facturation
                <span className="ml-1 text-xs font-normal text-ink-muted">(défaut contrat)</span>
              </label>
              <input
                name="billing_day"
                type="number"
                min={1}
                max={31}
                defaultValue={defaultValues?.billing_day ?? ''}
                placeholder="1–31"
                className={inputClass}
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-ink-soft mb-1.5">
                Fréquence maintenance
                <span className="ml-1 text-xs font-normal text-ink-muted">(défaut)</span>
              </label>
              <select
                name="maintenance_frequency"
                defaultValue={defaultValues?.maintenance_frequency ?? ''}
                className={selectClass}
              >
                <option value="">—</option>
                <option value="mensuel">Mensuel</option>
                <option value="trimestriel">Trimestriel</option>
              </select>
            </div>
          </div>
        </Card>

        {/* ── Section 2: Machines du contrat ── */}
        <Card className="p-6 mb-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-semibold text-ink-soft uppercase tracking-wide">
              Machines du contrat
            </h2>
            <button
              type="button"
              onClick={addLine}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-line text-sm font-medium text-ink-soft hover:bg-neutral-soft transition-colors"
            >
              <Plus size={14} />
              Ajouter une machine
            </button>
          </div>

          {availableMachines.length === 0 && lines.length === 0 && (
            <p className="text-sm text-ink-muted">
              Aucune machine disponible (toutes sont déjà assignées à un contrat actif).
            </p>
          )}

          <div className="space-y-4">
            {lines.map((line, idx) => {
              // This line's machine is always available to itself even if "used"
              const selectableMachines = availableMachines.filter(
                (m) => !usedMachineIds.has(m.numero_serie) || m.numero_serie === line.machine_id
              )

              return (
                <div
                  key={idx}
                  className="p-4 rounded-lg border border-line bg-neutral-soft space-y-3"
                >
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold text-ink-muted uppercase tracking-wide">
                      Machine {idx + 1}
                    </span>
                    {lines.length > 1 && (
                      <button
                        type="button"
                        onClick={() => removeLine(idx)}
                        className="flex items-center gap-1 text-xs text-accent hover:text-accent/80 transition-colors"
                      >
                        <X size={13} />
                        Retirer
                      </button>
                    )}
                  </div>

                  {/* Machine selector + date_debut */}
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-medium text-ink-muted mb-1">
                        Numéro de série <span className="text-accent">*</span>
                      </label>
                      {line.id ? (
                        <div className="flex items-center gap-2">
                          <div className="flex-1 px-3 py-2 rounded-lg border border-line bg-neutral-soft text-sm text-ink-soft font-mono">
                            {line.machine_id}
                          </div>
                          <button
                            type="button"
                            onClick={() => replaceLine(idx)}
                            title="Remplacer la machine (clôture cette ligne et en ouvre une nouvelle)"
                            className="flex items-center gap-1 px-2.5 py-2 rounded-lg border border-line text-xs text-ink-soft hover:bg-neutral-soft transition-colors shrink-0"
                          >
                            <RefreshCw size={13} />
                            Remplacer
                          </button>
                        </div>
                      ) : (
                        <MachineCombobox
                          options={selectableMachines}
                          value={line.machine_id}
                          onChange={(id) => updateLine(idx, 'machine_id', id)}
                          invalid={submitted && !line.machine_id}
                        />
                      )}
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-ink-muted mb-1">
                        Date de début <span className="text-accent">*</span>
                      </label>
                      <input
                        type="date"
                        value={line.date_debut}
                        onChange={(e) => updateLine(idx, 'date_debut', e.target.value)}
                        required
                        className={inputSmClass}
                      />
                    </div>
                  </div>

                  {/* Overrides */}
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-medium text-ink-muted mb-1">
                        Jour facturation (override)
                      </label>
                      <input
                        type="number"
                        min={1}
                        max={31}
                        value={line.billing_day_override ?? ''}
                        onChange={(e) => {
                          const v = e.target.value === '' ? null : Number(e.target.value)
                          updateLine(idx, 'billing_day_override', v)
                        }}
                        placeholder="1–31"
                        className={inputSmClass}
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-ink-muted mb-1">
                        Fréquence maintenance (override)
                      </label>
                      <select
                        value={line.maintenance_frequency_override ?? ''}
                        onChange={(e) => {
                          const v = e.target.value as 'mensuel' | 'trimestriel' | ''
                          updateLine(idx, 'maintenance_frequency_override', v === '' ? null : v)
                        }}
                        className={selectSmClass}
                      >
                        <option value="">— (défaut contrat)</option>
                        <option value="mensuel">Mensuel</option>
                        <option value="trimestriel">Trimestriel</option>
                      </select>
                    </div>
                  </div>

                  {/* Notes */}
                  <div>
                    <label className="block text-xs font-medium text-ink-muted mb-1">Notes</label>
                    <input
                      type="text"
                      value={line.notes ?? ''}
                      onChange={(e) => updateLine(idx, 'notes', e.target.value || null)}
                      placeholder="Consignes particulières pour cette machine…"
                      className={inputSmClass}
                    />
                  </div>
                </div>
              )
            })}
          </div>

          {lines.length === 0 && availableMachines.length > 0 && (
            <button
              type="button"
              onClick={addLine}
              className="mt-3 text-sm text-ink-soft hover:text-ink transition-colors"
            >
              + Ajouter une première machine
            </button>
          )}

          {retired.length > 0 && (
            <div className="mt-5 pt-5 border-t border-line-subtle space-y-3">
              <h3 className="text-xs font-semibold text-ink-muted uppercase tracking-wide">
                Machines retirées
              </h3>
              {retired.map((r) => (
                <div key={r.id} className="flex items-center gap-3 p-3 rounded-lg border border-dashed border-line bg-neutral-soft">
                  <span className="flex-1 text-sm font-mono text-ink-soft line-through">{r.machine_id}</span>
                  <div>
                    <label className="block text-[10px] font-medium text-ink-muted mb-1">Date de fin</label>
                    <input
                      type="date"
                      value={r.date_fin}
                      min={r.date_debut}
                      onChange={(e) => updateRetiredDate(r.id, e.target.value)}
                      className={inputSmClass}
                    />
                  </div>
                  <button
                    type="button"
                    onClick={() => undoRetire(r.id)}
                    className="text-xs text-ink-soft hover:text-ink transition-colors shrink-0 self-end pb-2"
                  >
                    Annuler
                  </button>
                </div>
              ))}
            </div>
          )}
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
