'use client'

import { useActionState, useState } from 'react'
import Link from 'next/link'
import { Loader2, ArrowLeft, Trash2, AlertTriangle, Plus, X, Pencil } from 'lucide-react'
import { Card } from '@/components/ui/Card'
import ContractLineDialog, {
  emptyLine, type BillingPlanOption, type LineInput, type MachineOption,
} from '@/components/admin/ContractLineDialog'
import { useSubmitKeepingValues } from '@/lib/useSubmitKeepingValues'

export type { BillingPlanOption }

type FormState = { error: string } | null

type ContractData = {
  numero_contrat?: string
  client_id?: number
  date_debut?: string
  date_renouvellement?: string | null
  statut?: 'actif' | 'suspendu' | 'terminé'
  billing_day?: number | null
  // Valor inicial del <select>; en BD es text (CHECK mensuel/trimestriel).
  maintenance_frequency?: string | null
}

type RetiredLine = {
  id: string
  machine_id: string
  date_debut: string
  date_fin: string
  billing_day_override: number | null
  maintenance_frequency_override: 'mensuel' | 'trimestriel' | null
  notes: string | null
  billing_plan_id: string | null
  price_bw_override: number | null
  price_color_override: number | null
  fixed_fee_override: number | null
}

type ClientOption = { id: number; nom_client: string; princity_company_id?: string | null }

type Props = {
  action: (prev: FormState, data: FormData) => Promise<FormState>
  defaultValues?: ContractData
  initialLines?: LineInput[]
  clients: ClientOption[]
  availableMachines: MachineOption[]
  billingPlans: BillingPlanOption[]
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

export default function ContractForm({
  action, defaultValues, initialLines, clients, availableMachines, billingPlans, title, isEdit, contractId, deleteAction,
}: Props) {
  const [state, formAction, pending] = useActionState(action, null)
  const submitKeepingValues = useSubmitKeepingValues(formAction)
  const noopDelete = async (_prev: FormState, _fd: FormData): Promise<FormState> => null
  const [deleteState, deleteFormAction, deletePending] = useActionState(
    deleteAction ?? noopDelete,
    null
  )
  const [confirming, setConfirming] = useState(false)
  const [lines, setLines] = useState<LineInput[]>(initialLines ?? [])
  const [retired, setRetired] = useState<RetiredLine[]>([])
  // Ventana de máquina: `index` null = máquina nueva. `line` y `key` se conservan al cerrar
  // (fundido de salida) y cambian en cada apertura.
  const [dialog, setDialog] = useState<{ open: boolean; index: number | null; line: LineInput; key: number }>(
    { open: false, index: null, line: emptyLine(), key: 0 }
  )
  const [selectedClientId, setSelectedClientId] = useState<number | null>(defaultValues?.client_id ?? null)

  const selectedClient = clients.find((c) => c.id === selectedClientId) ?? null
  const princityId = selectedClient?.princity_company_id ?? null
  const princityPadded = princityId ? String(princityId).padStart(3, '0') : null

  const today = new Date().toISOString().slice(0, 10)

  function openNewLine() {
    setDialog((d) => ({ open: true, index: null, line: emptyLine(), key: d.key + 1 }))
  }

  function openEditLine(idx: number) {
    setDialog((d) => ({ open: true, index: idx, line: lines[idx], key: d.key + 1 }))
  }

  function closeDialog() {
    setDialog((d) => ({ ...d, open: false }))
  }

  function saveLine(line: LineInput) {
    const idx = dialog.index
    setLines((prev) => idx === null ? [...prev, line] : prev.map((l, i) => i === idx ? line : l))
    closeDialog()
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
          billing_plan_id: line.billing_plan_id,
          price_bw_override: line.price_bw_override,
          price_color_override: line.price_color_override,
          fixed_fee_override: line.fixed_fee_override,
        }])
      }
      return prev.filter((_, i) => i !== idx)
    })
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
          billing_plan_id: item.billing_plan_id,
          price_bw_override: item.price_bw_override,
          price_color_override: item.price_color_override,
          fixed_fee_override: item.fixed_fee_override,
        }])
      }
      return prev.filter((r) => r.id !== id)
    })
  }

  // Máquinas ya usadas en OTRAS líneas (la que se edita sigue disponible para sí misma)
  const usedMachineIds = new Set(
    lines.filter((_, i) => i !== dialog.index).map((l) => l.machine_id).filter(Boolean)
  )
  const selectableMachines = availableMachines.filter((m) => !usedMachineIds.has(m.numero_serie))
  const machineBySerie = new Map(availableMachines.map((m) => [m.numero_serie, m]))
  const planById = new Map(billingPlans.map((p) => [p.id, p]))

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
      <form onSubmit={submitKeepingValues}>
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
              onChange={(e) => setSelectedClientId(e.target.value ? Number(e.target.value) : null)}
              className={selectClass}
            >
              <option value="" disabled>Sélectionner...</option>
              {clients.map((c) => (
                <option key={c.id} value={c.id}>{c.nom_client}</option>
              ))}
            </select>
            {princityPadded ? (
              <p className="mt-1.5 flex items-center gap-1.5 text-xs text-ink-muted">
                <span>→ ID Princity&nbsp;:</span>
                <span className="font-mono font-semibold text-ink">{princityId}</span>
                <span className="text-line">·</span>
                <span>Suffixe contrat suggéré&nbsp;:</span>
                <span className="font-mono font-semibold text-accent">-{princityPadded}</span>
              </p>
            ) : selectedClient && !princityId ? (
              <p className="mt-1.5 text-xs text-ink-muted">
                → Ce client n&apos;a pas d&apos;ID Princity enregistré.
              </p>
            ) : null}
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
              {lines.length > 0 && <span className="ml-2 font-normal normal-case text-ink-muted">({lines.length})</span>}
            </h2>
            <button
              type="button"
              onClick={openNewLine}
              disabled={selectableMachines.length === 0}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-line text-sm font-medium text-ink-soft hover:bg-neutral-soft transition-colors disabled:opacity-50 disabled:hover:bg-transparent"
            >
              <Plus size={14} />
              Ajouter une machine
            </button>
          </div>

          {lines.length === 0 && (
            <p className="text-sm text-ink-muted">
              {availableMachines.length === 0
                ? 'Aucune machine disponible (toutes sont déjà assignées à un contrat actif).'
                : 'Aucune machine pour l\'instant. Cliquez sur « Ajouter une machine ».'}
            </p>
          )}

          {lines.length > 0 && (
            <ul className="divide-y divide-line rounded-lg border border-line">
              {lines.map((line, idx) => {
                const machine = machineBySerie.get(line.machine_id)
                const plan = line.billing_plan_id ? planById.get(line.billing_plan_id) : undefined
                const hasOverride = line.fixed_fee_override !== null || line.price_bw_override !== null
                  || line.price_color_override !== null || line.billing_day_override !== null
                  || line.maintenance_frequency_override !== null
                return (
                  <li key={line.id ?? `new-${idx}`} className="flex items-center gap-4 px-4 py-3">
                    <div className="min-w-0 flex-1">
                      <p className="text-sm text-ink truncate">
                        <span className="font-mono font-medium">{line.machine_id}</span>
                        {machine && <span className="text-ink-soft"> · {machine.marque} {machine.modele}</span>}
                        {!line.id && <span className="ml-2 text-[11px] font-medium text-accent">Nouvelle</span>}
                      </p>
                      <p className="text-xs text-ink-muted truncate mt-0.5">
                        {plan ? plan.name : 'Sans plan'}
                        {hasOverride && ' · conditions particulières'}
                        {' · depuis le '}{new Date(`${line.date_debut}T00:00:00`).toLocaleDateString('fr-FR')}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => openEditLine(idx)}
                      className="flex items-center gap-1 text-xs font-medium text-ink-soft hover:text-ink transition-colors"
                    >
                      <Pencil size={12} />
                      Modifier
                    </button>
                    {lines.length > 1 && (
                      <button
                        type="button"
                        onClick={() => removeLine(idx)}
                        className="flex items-center gap-1 text-xs font-medium text-accent hover:text-accent/80 transition-colors"
                      >
                        <X size={13} />
                        Retirer
                      </button>
                    )}
                  </li>
                )
              })}
            </ul>
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
                    <label className="block text-[10px] font-medium text-ink-soft mb-1">Date de fin</label>
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

        <ContractLineDialog
          open={dialog.open}
          line={dialog.line}
          editorKey={dialog.key}
          selectableMachines={selectableMachines}
          billingPlans={billingPlans}
          onSave={saveLine}
          onClose={closeDialog}
        />

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
