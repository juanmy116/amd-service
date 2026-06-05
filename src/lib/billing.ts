// src/lib/billing.ts

export type BillingType = 'per_copy' | 'hybrid' | 'hybrid_tiered'

export type BillingTier = {
  up_to: number | null
  price_bw: number
  price_color: number
}

export type BillingPlan = {
  id: string
  name: string
  type: BillingType
  fixed_fee: number | null
  price_bw: number | null
  price_color: number | null
  tiers: BillingTier[] | null
  active: boolean
}

export type ContractMachineWithBilling = {
  billing_plan_id: string | null
  billing_plans: BillingPlan | null
  price_bw_override: number | string | null
  price_color_override: number | string | null
  fixed_fee_override: number | string | null
}

export type EffectiveTariff = {
  type: BillingType
  fixed_fee: number
  price_bw: number | null
  price_color: number | null
  tiers: BillingTier[] | null
}

export type MonthlyAmounts = {
  amount_fixed: number
  amount_bw: number
  amount_color: number
  amount_total: number
}

/** supabase-js devuelve columnas `numeric` como string → coerción segura (fix revisor #2) */
const num = (v: number | string | null | undefined): number | null =>
  v === null || v === undefined || v === '' ? null : Number(v)

/**
 * Tarifa efectiva aplicando override → plan base. Devuelve null si no hay plan.
 * Los overrides solo aplican si el tipo de plan los contempla (fix #3 de la reflexión).
 */
export function resolveEffectiveTariff(
  line: ContractMachineWithBilling
): EffectiveTariff | null {
  const plan = line.billing_plans
  if (!plan) return null

  const planFixed = num(plan.fixed_fee)
  const planBw    = num(plan.price_bw)
  const planColor = num(plan.price_color)
  const ovFixed   = num(line.fixed_fee_override)
  const ovBw      = num(line.price_bw_override)
  const ovColor   = num(line.price_color_override)

  const hasFixed = plan.type === 'hybrid' || plan.type === 'hybrid_tiered'
  const hasFlat  = plan.type === 'per_copy' || plan.type === 'hybrid'

  return {
    type:        plan.type,
    fixed_fee:   hasFixed ? (ovFixed ?? planFixed ?? 0) : 0,
    price_bw:    hasFlat  ? (ovBw    ?? planBw)          : null,
    price_color: hasFlat  ? (ovColor ?? planColor)       : null,
    tiers:       plan.type === 'hybrid_tiered' ? (plan.tiers ?? null) : null,
  }
}

/** Calcula el importe mensual. Redondea cada componente a entero (FCFA sin decimales). */
export function calculateMonthlyAmount(
  tariff: EffectiveTariff,
  delta_bw: number,
  delta_color: number,
): MonthlyAmounts {
  const amount_fixed = Math.round(tariff.fixed_fee)

  let amount_bw = 0
  let amount_color = 0

  if (tariff.type === 'per_copy' || tariff.type === 'hybrid') {
    amount_bw    = Math.round((tariff.price_bw    ?? 0) * delta_bw)
    amount_color = Math.round((tariff.price_color ?? 0) * delta_color)
  }

  if (tariff.type === 'hybrid_tiered' && tariff.tiers) {
    amount_bw    = Math.round(applyTiers(tariff.tiers, delta_bw,    'bw'))
    amount_color = Math.round(applyTiers(tariff.tiers, delta_color, 'color'))
  }

  return {
    amount_fixed,
    amount_bw,
    amount_color,
    amount_total: amount_fixed + amount_bw + amount_color,
  }
}

function applyTiers(
  tiers: BillingTier[],
  copies: number,
  channel: 'bw' | 'color',
): number {
  let remaining = copies
  let total = 0
  let from = 0

  for (const tier of tiers) {
    if (remaining <= 0) break
    const capacity = tier.up_to !== null ? tier.up_to - from : Infinity
    const inTier   = Math.min(remaining, capacity)
    const price    = channel === 'bw' ? tier.price_bw : tier.price_color
    total     += inTier * price
    remaining -= inTier
    if (tier.up_to !== null) from = tier.up_to
  }

  return total
}

/**
 * Valida un array de tramos: ≥2 tramos, último ilimitado (up_to null),
 * up_to estrictamente crecientes, precios no negativos (fix #4 de la reflexión).
 * Devuelve null si OK, o un mensaje de error.
 */
export function validateTiers(tiers: BillingTier[]): string | null {
  if (!Array.isArray(tiers) || tiers.length < 2) return 'Au moins 2 tranches requises.'
  let prev = 0
  for (let i = 0; i < tiers.length; i++) {
    const t = tiers[i]
    const isLast = i === tiers.length - 1
    if (t.price_bw < 0 || t.price_color < 0) return 'Les prix ne peuvent pas être négatifs.'
    if (isLast) {
      if (t.up_to !== null) return 'La dernière tranche doit être illimitée.'
    } else {
      if (t.up_to === null) return 'Seule la dernière tranche peut être illimitée.'
      if (t.up_to <= prev) return 'Les seuils des tranches doivent être strictement croissants.'
      prev = t.up_to
    }
  }
  return null
}

export function formatPrice(amount: number): string {
  return (
    new Intl.NumberFormat('fr-FR', {
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(Math.round(amount)) + ' FCFA'
  )
}

export const BILLING_TYPE_LABEL: Record<BillingType, string> = {
  per_copy:      'Coût par copie',
  hybrid:        'Forfait + copie',
  hybrid_tiered: 'Forfait + copie dégressive',
}
