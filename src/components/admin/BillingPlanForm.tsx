'use client'

import { useActionState, useState } from 'react'
import {
  BILLING_TYPE_LABEL, validateTiers, TIERED_TYPES,
  type BillingPlan, type BillingTier, type BillingType,
} from '@/lib/billing'

type FormState = { error: string } | null

type Props = {
  action: (prev: FormState, formData: FormData) => Promise<FormState>
  defaultValues?: Partial<BillingPlan>
  submitLabel?: string
}

const inputClass =
  'w-full rounded-lg border border-line bg-card px-3.5 py-2.5 text-sm text-ink ' +
  'placeholder:text-ink-muted focus:outline-none focus:ring-2 focus:ring-accent/40'

export default function BillingPlanForm({ action, defaultValues, submitLabel = 'Enregistrer' }: Props) {
  const [state, formAction, pending] = useActionState(action, null)
  const [type, setType] = useState<BillingType>(defaultValues?.type ?? 'per_copy')
  const [tiers, setTiers] = useState<BillingTier[]>(
    defaultValues?.tiers ?? [
      { up_to: 10000, price_bw: 0, price_color: 0 },
      { up_to: null,  price_bw: 0, price_color: 0 },
    ]
  )

  const isTiered = TIERED_TYPES.includes(type)
  const tiersError = isTiered ? validateTiers(tiers) : null

  function addTier() {
    setTiers(prev => {
      const last = prev[prev.length - 1]
      const newCap = (prev[prev.length - 2]?.up_to ?? 0) + 5000
      return [...prev.slice(0, -1),
        { up_to: newCap, price_bw: last.price_bw, price_color: last.price_color },
        { up_to: null,   price_bw: last.price_bw, price_color: last.price_color }]
    })
  }
  function removeTier(i: number) { if (tiers.length > 2) setTiers(prev => prev.filter((_, idx) => idx !== i)) }
  function updateTier(i: number, field: keyof BillingTier, raw: string) {
    setTiers(prev => prev.map((t, idx) => idx !== i ? t : {
      ...t, [field]: field === 'up_to' ? (raw === '' ? null : Number(raw)) : Number(raw),
    }))
  }

  return (
    <form action={formAction} className="space-y-5">
      {state?.error && (
        <div className="px-4 py-3 rounded-lg bg-accent-soft border border-accent/20 text-sm text-accent">
          {state.error}
        </div>
      )}

      <div>
        <label className="block text-sm font-medium text-ink-soft mb-1.5">Nom du plan <span className="text-accent">*</span></label>
        <input name="name" type="text" required defaultValue={defaultValues?.name} placeholder="Plan Standard B&N" className={inputClass} />
      </div>

      <div>
        <label className="block text-sm font-medium text-ink-soft mb-1.5">Type <span className="text-accent">*</span></label>
        <select name="type" value={type} onChange={e => setType(e.target.value as BillingType)} className={inputClass}>
          {(Object.entries(BILLING_TYPE_LABEL) as [BillingType, string][]).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
        </select>
      </div>

      {type !== 'per_copy' && (
        <div>
          <label className="block text-sm font-medium text-ink-soft mb-1.5">Forfait mensuel (FCFA) <span className="text-accent">*</span></label>
          <input name="fixed_fee" type="number" min="0" step="1" required defaultValue={defaultValues?.fixed_fee ?? ''} className={inputClass} />
        </div>
      )}

      {(type === 'per_copy' || type === 'hybrid') && (
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-ink-soft mb-1.5">Prix copie B&N (FCFA) <span className="text-accent">*</span></label>
            <input name="price_bw" type="number" min="0" step="0.000001" required defaultValue={defaultValues?.price_bw ?? ''} className={inputClass} />
          </div>
          <div>
            <label className="block text-sm font-medium text-ink-soft mb-1.5">Prix copie couleur (FCFA) <span className="text-accent">*</span></label>
            <input name="price_color" type="number" min="0" step="0.000001" required defaultValue={defaultValues?.price_color ?? ''} className={inputClass} />
          </div>
        </div>
      )}

      {isTiered && (
        <div>
          <input type="hidden" name="tiers" value={JSON.stringify(tiers)} />
          <div className="flex items-center justify-between mb-2">
            <label className="text-sm font-medium text-ink-soft">Tranches de volume</label>
            <button type="button" onClick={addTier} className="text-xs font-medium text-accent hover:underline">+ Ajouter une tranche</button>
          </div>
          <div className="space-y-2">
            {tiers.map((tier, i) => (
              <div key={i} className="grid grid-cols-[1fr_1fr_1fr_auto] gap-2 items-end">
                <div>
                  {i === 0 && <p className="text-xs text-ink-muted mb-1">Jusqu&apos;à (copies)</p>}
                  {tier.up_to === null
                    ? <input disabled value="Illimité" className={`${inputClass} opacity-50`} />
                    : <input type="number" min="1" value={tier.up_to ?? ''} onChange={e => updateTier(i, 'up_to', e.target.value)} className={inputClass} />}
                </div>
                <div>
                  {i === 0 && <p className="text-xs text-ink-muted mb-1">Prix B&N (FCFA)</p>}
                  <input type="number" min="0" step="0.000001" value={tier.price_bw} onChange={e => updateTier(i, 'price_bw', e.target.value)} className={inputClass} />
                </div>
                <div>
                  {i === 0 && <p className="text-xs text-ink-muted mb-1">Prix couleur (FCFA)</p>}
                  <input type="number" min="0" step="0.000001" value={tier.price_color} onChange={e => updateTier(i, 'price_color', e.target.value)} className={inputClass} />
                </div>
                <button type="button" onClick={() => removeTier(i)} disabled={tiers.length <= 2}
                  className="text-ink-muted hover:text-accent disabled:opacity-30 pb-2.5" aria-label="Supprimer">✕</button>
              </div>
            ))}
          </div>
          {tiersError && <p className="text-xs text-accent mt-2">{tiersError}</p>}
          <p className="text-xs text-ink-muted mt-2">La dernière tranche est toujours illimitée. Minimum 2 tranches.</p>
          <p className="text-xs text-ink-muted mt-1">
            {type === 'tiered_total'
              ? 'Au volume total : le volume total du mois détermine UN seul prix, appliqué à toutes les copies.'
              : 'Par tranche : chaque palier de copies est facturé à son propre prix (cumulatif).'}
          </p>
        </div>
      )}

      <button type="submit" disabled={pending || !!tiersError}
        className="w-full rounded-lg bg-accent px-4 py-2.5 text-sm font-semibold text-white hover:bg-accent/90 disabled:opacity-60 transition-colors">
        {pending ? 'Enregistrement…' : submitLabel}
      </button>
    </form>
  )
}
