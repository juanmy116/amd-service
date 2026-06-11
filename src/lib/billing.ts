// src/lib/billing.ts

export type BillingType = 'per_copy' | 'hybrid' | 'hybrid_tiered' | 'tiered_total'

/**
 * Los dos tipos que usan la tabla de tramos `tiers` (estructura idéntica), pero con
 * aritmética distinta:
 *  - `hybrid_tiered`  → tramos MARGINALES: cada bloque de copias a su propio precio (escalonado).
 *  - `tiered_total`   → precio ÚNICO según el VOLUMEN TOTAL del canal: se busca el tramo donde
 *                       cae el total de copias del mes y TODAS se cobran a ese precio. Es la
 *                       tarifa real de AMD ("fixe + copie dégressive au volume").
 */
export const TIERED_TYPES: BillingType[] = ['hybrid_tiered', 'tiered_total']
const usesTiers = (type: BillingType): boolean => TIERED_TYPES.includes(type)
const usesFixed = (type: BillingType): boolean => type !== 'per_copy'
const usesFlat  = (type: BillingType): boolean => type === 'per_copy' || type === 'hybrid'

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

  return {
    type:        plan.type,
    fixed_fee:   usesFixed(plan.type) ? (ovFixed ?? planFixed ?? 0) : 0,
    price_bw:    usesFlat(plan.type)  ? (ovBw    ?? planBw)          : null,
    price_color: usesFlat(plan.type)  ? (ovColor ?? planColor)       : null,
    tiers:       usesTiers(plan.type) ? (plan.tiers ?? null)         : null,
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// P1-5 — Vigencia temporal de tarifas. Una versión = snapshot de los precios de un plan
// (o de los overrides de una línea) con la fecha desde la que rigen. La facturación de un
// ciclo pasado debe usar los precios que regían en ese ciclo, no los actuales.
// ─────────────────────────────────────────────────────────────────────────────

/** Versión de precios de un plan, vigente desde `effective_from` (fecha ISO YYYY-MM-DD). */
export type TariffVersion = {
  effective_from: string
  type: BillingType
  fixed_fee: number | string | null
  price_bw: number | string | null
  price_color: number | string | null
  tiers: BillingTier[] | null
}

/** Versión de los overrides de una línea, vigente desde `effective_from`. */
export type OverrideVersion = {
  effective_from: string
  price_bw_override: number | string | null
  price_color_override: number | string | null
  fixed_fee_override: number | string | null
}

/**
 * Elige la versión vigente en `asOf`: la de mayor `effective_from` que sea <= asOf.
 * Comparación lexicográfica de fechas ISO (correcta para YYYY-MM-DD).
 *
 * `fallbackToEarliest` (default true): si ninguna versión es <= asOf, devuelve la más antigua.
 *  - PLANES → true: el precio del plan siempre existió en alguna forma (el backfill lo data en
 *    created_at; un ciclo anterior a esa fecha usa con seguridad el precio más antiguo conocido).
 *  - OVERRIDES → false: antes de que se creara un override, la línea NO tenía override (usaba el
 *    precio del plan). Un override futuro NO debe aplicarse a un ciclo anterior → devolver null.
 */
export function pickVersionAsOf<T extends { effective_from: string }>(
  versions: T[],
  asOf: string,
  fallbackToEarliest = true,
): T | null {
  if (!versions.length) return null
  let best: T | null = null
  for (const v of versions) {
    if (v.effective_from <= asOf && (best === null || v.effective_from > best.effective_from)) best = v
  }
  if (best) return best
  if (!fallbackToEarliest) return null
  return versions.reduce((a, b) => (b.effective_from < a.effective_from ? b : a))
}

/**
 * P1-5 — tarifa efectiva VIGENTE en `asOf`, combinando el historial de versiones del plan y de
 * los overrides de la línea. Reproduce exactamente la política de `resolveEffectiveTariff`
 * (override → plan base, según el tipo) pero con los valores que regían en `asOf`.
 * Devuelve null si no hay ninguna versión de plan (el caller decide el fallback).
 */
export function resolveEffectiveTariffAsOf(
  planVersions: TariffVersion[],
  overrideVersions: OverrideVersion[],
  asOf: string,
): EffectiveTariff | null {
  const plan = pickVersionAsOf(planVersions, asOf)
  if (!plan) return null
  // Override en modo ESTRICTO: si no había override vigente en asOf, no se aplica uno futuro.
  const ov = pickVersionAsOf(overrideVersions, asOf, false)

  const planFixed = num(plan.fixed_fee)
  const planBw    = num(plan.price_bw)
  const planColor = num(plan.price_color)
  const ovFixed   = ov ? num(ov.fixed_fee_override) : null
  const ovBw      = ov ? num(ov.price_bw_override) : null
  const ovColor   = ov ? num(ov.price_color_override) : null

  return {
    type:        plan.type,
    fixed_fee:   usesFixed(plan.type) ? (ovFixed ?? planFixed ?? 0) : 0,
    price_bw:    usesFlat(plan.type)  ? (ovBw    ?? planBw)          : null,
    price_color: usesFlat(plan.type)  ? (ovColor ?? planColor)       : null,
    tiers:       usesTiers(plan.type) ? (plan.tiers ?? null)         : null,
  }
}

/**
 * Redondea un importe a entero FCFA (sin céntimos). Los precios son numeric(10,6)
 * y se multiplican por deltas en coma flotante, por lo que `Math.round` directo
 * sufre el error binario clásico (`Math.round(1.005 * 100) === 100`, no 101).
 * `toFixed(6)` colapsa el ruido binario hasta los 6 decimales reales del precio
 * antes de redondear a entero, dejando el `.5` exacto para que suba correctamente.
 */
export function roundFcfa(x: number): number {
  return Math.round(Number(x.toFixed(6)))
}

/** Calcula el importe mensual. Redondea cada componente a entero (FCFA sin decimales). */
export function calculateMonthlyAmount(
  tariff: EffectiveTariff,
  delta_bw: number,
  delta_color: number,
): MonthlyAmounts {
  const amount_fixed = roundFcfa(tariff.fixed_fee)

  let amount_bw = 0
  let amount_color = 0

  if (tariff.type === 'per_copy' || tariff.type === 'hybrid') {
    amount_bw    = roundFcfa((tariff.price_bw    ?? 0) * delta_bw)
    amount_color = roundFcfa((tariff.price_color ?? 0) * delta_color)
  }

  if (tariff.type === 'hybrid_tiered' && tariff.tiers) {
    amount_bw    = roundFcfa(applyTiers(tariff.tiers, delta_bw,    'bw'))
    amount_color = roundFcfa(applyTiers(tariff.tiers, delta_color, 'color'))
  }

  if (tariff.type === 'tiered_total' && tariff.tiers) {
    amount_bw    = roundFcfa(applyTiersTotal(tariff.tiers, delta_bw,    'bw'))
    amount_color = roundFcfa(applyTiersTotal(tariff.tiers, delta_color, 'color'))
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
 * Tarifa "precio único al volumen total" (tipo `tiered_total`, la real de AMD): a diferencia de
 * `applyTiers` (escalonado), aquí el VOLUMEN TOTAL del mes determina UN único precio por copia,
 * que se aplica a TODAS las copias. Busca el primer tramo cuyo `up_to` cubre el total (umbral
 * superior INCLUSIVO; ej. "0 a 2.500" = `up_to: 2500`) y multiplica todas las copias por su precio.
 * El último tramo (`up_to: null`) es el ilimitado. Devuelve 0 si no hay copias.
 *
 * Consecuencia conocida y querida (gancho comercial): como los precios bajan al subir de tramo,
 * cruzar un umbral puede abaratar el total (20.000×8 = 160.000 vs 20.001×7 = 140.007).
 */
function applyTiersTotal(
  tiers: BillingTier[],
  copies: number,
  channel: 'bw' | 'color',
): number {
  if (copies <= 0) return 0
  for (const tier of tiers) {
    if (tier.up_to === null || copies <= tier.up_to) {
      return copies * (channel === 'bw' ? tier.price_bw : tier.price_color)
    }
  }
  // Salvaguarda: si ningún tramo es ilimitado (validateTiers lo impide), usa el último.
  const last = tiers[tiers.length - 1]
  return copies * (channel === 'bw' ? last.price_bw : last.price_color)
}

/**
 * Valida un array de tramos: ≥2 tramos, último ilimitado (up_to null),
 * up_to enteros estrictamente crecientes, precios numéricos finitos no negativos.
 * Acepta `unknown` porque la entrada viene de JSON.parse de datos no confiables
 * (P2-2): valida la existencia, el tipo y la finitud de cada campo antes de usarlo.
 * Devuelve null si OK, o un mensaje de error.
 */
export function validateTiers(tiers: unknown): string | null {
  if (!Array.isArray(tiers) || tiers.length < 2) return 'Au moins 2 tranches requises.'
  let prev = 0
  for (let i = 0; i < tiers.length; i++) {
    const t = tiers[i]
    const isLast = i === tiers.length - 1

    if (t === null || typeof t !== 'object') return 'Tranche invalide.'
    const { up_to, price_bw, price_color } = t as Record<string, unknown>

    // Precios: deben existir, ser números finitos y no negativos.
    if (typeof price_bw !== 'number' || !Number.isFinite(price_bw)) return 'Prix B&N invalide.'
    if (typeof price_color !== 'number' || !Number.isFinite(price_color)) return 'Prix couleur invalide.'
    if (price_bw < 0 || price_color < 0) return 'Les prix ne peuvent pas être négatifs.'

    if (isLast) {
      if (up_to !== null) return 'La dernière tranche doit être illimitée.'
    } else {
      // Seuils intermedios: entero finito > 0, estrictamente creciente.
      if (typeof up_to !== 'number' || !Number.isInteger(up_to)) return 'Seuil de tranche invalide.'
      if (up_to <= prev) return 'Les seuils des tranches doivent être strictement croissants.'
      prev = up_to
    }
  }
  return null
}

export function formatPrice(amount: number): string {
  return (
    new Intl.NumberFormat('fr-FR', {
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(roundFcfa(amount)) + ' FCFA'
  )
}

export const BILLING_TYPE_LABEL: Record<BillingType, string> = {
  per_copy:      'Coût par copie',
  hybrid:        'Forfait + copie',
  hybrid_tiered: 'Forfait + copie dégressive (par tranche)',
  tiered_total:  'Forfait + copie dégressive (au volume total)',
}
