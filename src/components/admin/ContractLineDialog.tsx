'use client'

import { useState } from 'react'
import { Dialog, DialogBackdrop, DialogPanel, DialogTitle } from '@headlessui/react'
import MachineCombobox from '@/components/admin/MachineCombobox'
import { DIALOG_BACKDROP_TRANSITION, DIALOG_PANEL_TRANSITION } from '@/components/ui/dialogTransitions'
import { TIERED_TYPES, formatNumber, formatTiers, type BillingPlan } from '@/lib/billing'

export type BillingPlanOption = Pick<BillingPlan, 'id' | 'name' | 'type' | 'fixed_fee' | 'price_bw' | 'price_color' | 'tiers'>

export type MachineOption = { numero_serie: string; marque: string; modele: string }

export type LineInput = {
  id?: string                                               // present for existing lines
  machine_id: string
  date_debut: string
  billing_day_override: number | null
  maintenance_frequency_override: 'mensuel' | 'trimestriel' | null
  notes: string | null
  billing_plan_id: string | null
  price_bw_override: number | null
  price_color_override: number | null
  fixed_fee_override: number | null
}

export function emptyLine(): LineInput {
  return {
    machine_id: '',
    date_debut: new Date().toISOString().slice(0, 10),
    billing_day_override: null,
    maintenance_frequency_override: null,
    notes: null,
    billing_plan_id: null,
    price_bw_override: null,
    price_color_override: null,
    fixed_fee_override: null,
  }
}

const inputSmClass =
  'w-full px-3 py-2 rounded-lg border border-line text-ink text-sm placeholder-ink-muted bg-card focus:outline-none focus:ring-2 focus:ring-accent/30 focus:border-accent'

const selectSmClass =
  'w-full px-3 py-2 rounded-lg border border-line text-ink text-sm bg-card focus:outline-none focus:ring-2 focus:ring-accent/30 focus:border-accent'

const labelClass = 'block text-xs font-medium text-ink-muted mb-1'

/** Precio que se aplica de verdad: el de la línea si se ha escrito, si no el del plan. */
function AppliedPrice({ override, planValue, unit }: { override: number | null; planValue: number | null; unit: string }) {
  return (
    <p className="text-[11px] text-ink-muted mt-1">
      {override !== null
        ? <>Appliqué : <span className="font-medium text-ink-soft">{formatNumber(override)} {unit}</span> (plan : {formatNumber(planValue)})</>
        : <>Du plan : <span className="font-medium text-ink-soft">{formatNumber(planValue)} {unit}</span></>}
    </p>
  )
}

type Props = {
  open: boolean
  /** Línea a editar. Una línea sin `machine_id` es una máquina nueva. Se mantiene al cerrar para
      que el contenido no desaparezca durante el fundido de salida. */
  line: LineInput
  /** Cambia en cada apertura: el editor arranca con una copia limpia de `line`. */
  editorKey: number
  /** Máquinas que se pueden elegir (sin las que ya están en otras líneas). */
  selectableMachines: MachineOption[]
  billingPlans: BillingPlanOption[]
  onSave: (line: LineInput) => void
  onClose: () => void
}

/**
 * Ventana para añadir o modificar una máquina del contrato. Solo edita el estado local de
 * ContractForm: nada se guarda en la BD hasta pulsar «Enregistrer» en el formulario.
 */
export default function ContractLineDialog({ open, line, editorKey, selectableMachines, billingPlans, onSave, onClose }: Props) {
  return (
    <Dialog open={open} onClose={onClose} className="relative z-50">
      <DialogBackdrop transition className={`fixed inset-0 bg-black/30 backdrop-blur-sm ${DIALOG_BACKDROP_TRANSITION}`} />
      {/* El scroll va en el contenedor y no en el panel: así la lista del buscador de máquinas
          puede salirse del panel sin quedar recortada. */}
      <div className="fixed inset-0 overflow-y-auto">
        <div className="flex min-h-full items-center justify-center p-4">
          <DialogPanel transition className={`w-full max-w-xl rounded-xl bg-card border border-line shadow-xl p-6 ${DIALOG_PANEL_TRANSITION}`}>
            <LineEditor
              key={editorKey}
              initial={line}
              selectableMachines={selectableMachines}
              billingPlans={billingPlans}
              onSave={onSave}
              onClose={onClose}
            />
          </DialogPanel>
        </div>
      </div>
    </Dialog>
  )
}

function LineEditor({ initial, selectableMachines, billingPlans, onSave, onClose }: {
  initial: LineInput
  selectableMachines: MachineOption[]
  billingPlans: BillingPlanOption[]
  onSave: (line: LineInput) => void
  onClose: () => void
}) {
  const [draft, setDraft] = useState<LineInput>(initial)
  const [attempted, setAttempted] = useState(false)
  const isNew = !initial.machine_id

  function set<K extends keyof LineInput>(key: K, value: LineInput[K]) {
    setDraft((d) => ({ ...d, [key]: value }))
  }

  function save() {
    setAttempted(true)
    if (!draft.machine_id || !draft.date_debut) return
    onSave(draft)
  }

  const plan = billingPlans.find((p) => p.id === draft.billing_plan_id)
  const showFixed = plan ? plan.type !== 'per_copy' : false
  const showFlat  = plan ? plan.type === 'per_copy' || plan.type === 'hybrid' : false

  return (
    <>
      <DialogTitle className="text-base font-semibold text-ink mb-5">
        {isNew ? 'Ajouter une machine' : 'Modifier la machine'}
      </DialogTitle>

      <div className="space-y-4">
        {/* Machine + date_debut */}
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className={labelClass}>
              Numéro de série <span className="text-accent">*</span>
            </label>
            {/* Una línea ya guardada no cambia de máquina (la RPC lo prohíbe: machine_id_immutable) */}
            {initial.id ? (
              <div className="px-3 py-2 rounded-lg border border-line bg-neutral-soft text-sm text-ink-soft font-mono">
                {draft.machine_id}
              </div>
            ) : (
              <MachineCombobox
                options={selectableMachines}
                value={draft.machine_id}
                onChange={(id) => set('machine_id', id)}
                invalid={attempted && !draft.machine_id}
              />
            )}
          </div>
          <div>
            <label className={labelClass}>
              Date de début <span className="text-accent">*</span>
            </label>
            <input
              type="date"
              value={draft.date_debut}
              onChange={(e) => set('date_debut', e.target.value)}
              className={`${inputSmClass} ${attempted && !draft.date_debut ? 'border-accent ring-2 ring-accent/30' : ''}`}
            />
          </div>
        </div>

        {/* Overrides */}
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className={labelClass}>Jour facturation (override)</label>
            <input
              type="number"
              min={1}
              max={31}
              value={draft.billing_day_override ?? ''}
              onChange={(e) => set('billing_day_override', e.target.value === '' ? null : Number(e.target.value))}
              placeholder="1–31"
              className={inputSmClass}
            />
          </div>
          <div>
            <label className={labelClass}>Fréquence maintenance (override)</label>
            <select
              value={draft.maintenance_frequency_override ?? ''}
              onChange={(e) => {
                const v = e.target.value as 'mensuel' | 'trimestriel' | ''
                set('maintenance_frequency_override', v === '' ? null : v)
              }}
              className={selectSmClass}
            >
              <option value="">— (défaut contrat)</option>
              <option value="mensuel">Mensuel</option>
              <option value="trimestriel">Trimestriel</option>
            </select>
          </div>
        </div>

        {/* Facturation: plan + overrides (filtrados por tipo de plan) */}
        <div className="pt-4 border-t border-line-subtle space-y-3">
          <div>
            <label className={labelClass}>Plan de facturation</label>
            <select
              value={draft.billing_plan_id ?? ''}
              onChange={(e) => set('billing_plan_id', e.target.value || null)}
              className={selectSmClass}
            >
              <option value="">Sans plan</option>
              {billingPlans.map((p) => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>
          </div>

          {plan && (
            <div className="grid grid-cols-3 gap-3">
              {showFixed && (
                <div>
                  <label className={labelClass}>Forfait (override)</label>
                  <input
                    type="number" min={0} step="1"
                    value={draft.fixed_fee_override ?? ''}
                    onChange={(e) => set('fixed_fee_override', e.target.value === '' ? null : Number(e.target.value))}
                    placeholder={formatNumber(plan.fixed_fee)}
                    className={inputSmClass}
                  />
                  <AppliedPrice override={draft.fixed_fee_override} planValue={plan.fixed_fee} unit="FCFA" />
                </div>
              )}
              {showFlat && (
                <>
                  <div>
                    <label className={labelClass}>Prix B&N (override)</label>
                    <input
                      type="number" min={0} step="0.000001"
                      value={draft.price_bw_override ?? ''}
                      onChange={(e) => set('price_bw_override', e.target.value === '' ? null : Number(e.target.value))}
                      placeholder={formatNumber(plan.price_bw)}
                      className={inputSmClass}
                    />
                    <AppliedPrice override={draft.price_bw_override} planValue={plan.price_bw} unit="FCFA/copie" />
                  </div>
                  <div>
                    <label className={labelClass}>Prix couleur (override)</label>
                    <input
                      type="number" min={0} step="0.000001"
                      value={draft.price_color_override ?? ''}
                      onChange={(e) => set('price_color_override', e.target.value === '' ? null : Number(e.target.value))}
                      placeholder={formatNumber(plan.price_color)}
                      className={inputSmClass}
                    />
                    <AppliedPrice override={draft.price_color_override} planValue={plan.price_color} unit="FCFA/copie" />
                  </div>
                </>
              )}
              {TIERED_TYPES.includes(plan.type) && (
                <div className={showFixed ? 'col-span-2' : 'col-span-3'}>
                  <p className={labelClass}>Tranches du plan</p>
                  <ul className="space-y-0.5">
                    {formatTiers(plan.tiers).map((tierLine) => (
                      <li key={tierLine} className="text-[11px] text-ink-soft">{tierLine}</li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Notes */}
        <div>
          <label className={labelClass}>Notes</label>
          <input
            type="text"
            value={draft.notes ?? ''}
            onChange={(e) => set('notes', e.target.value || null)}
            placeholder="Consignes particulières pour cette machine…"
            className={inputSmClass}
          />
        </div>
      </div>

      <div className="flex justify-end gap-3 pt-6">
        <button
          type="button"
          onClick={onClose}
          className="px-4 py-2 rounded-lg border border-line text-sm font-medium text-ink bg-card hover:bg-neutral-soft transition-colors"
        >
          Annuler
        </button>
        <button
          type="button"
          onClick={save}
          className="px-4 py-2 rounded-lg text-sm font-medium text-white bg-accent hover:opacity-90 transition-opacity"
        >
          {isNew ? 'Ajouter' : 'Valider'}
        </button>
      </div>
    </>
  )
}
