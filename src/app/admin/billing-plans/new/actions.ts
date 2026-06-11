'use server'
import { requireAdmin } from '@/lib/auth'
import { redirect } from 'next/navigation'
import { validateTiers, TIERED_TYPES, type BillingType, type BillingTier } from '@/lib/billing'

type FormState = { error: string } | null
const VALID: BillingType[] = ['per_copy', 'hybrid', 'hybrid_tiered', 'tiered_total']

export async function createBillingPlanAction(_p: FormState, fd: FormData): Promise<FormState> {
  const { supabase } = await requireAdmin()
  const name = (fd.get('name') as string).trim()
  const type = fd.get('type') as BillingType
  if (!name) return { error: 'Le nom est obligatoire.' }
  if (!VALID.includes(type)) return { error: 'Type invalide.' }

  const tiered = TIERED_TYPES.includes(type)   // hybrid_tiered | tiered_total: precios en los tramos, no planos
  const fixed_fee   = type !== 'per_copy' ? Number(fd.get('fixed_fee'))   : null
  const price_bw    = !tiered             ? Number(fd.get('price_bw'))    : null
  const price_color = !tiered             ? Number(fd.get('price_color')) : null

  // H7: validación numérica server-side
  if (fixed_fee   !== null && !Number.isFinite(fixed_fee))   return { error: 'Forfait invalide.' }
  if (price_bw    !== null && !Number.isFinite(price_bw))    return { error: 'Prix B&N invalide.' }
  if (price_color !== null && !Number.isFinite(price_color)) return { error: 'Prix couleur invalide.' }

  let tiers: BillingTier[] | null = null
  if (tiered) {
    try { tiers = JSON.parse(fd.get('tiers') as string) } catch { return { error: 'Format des tranches invalide.' } }
    const err = validateTiers(tiers!); if (err) return { error: err }
  }

  const { error } = await supabase.from('billing_plans').insert({ name, type, fixed_fee, price_bw, price_color, tiers })
  if (error) {
    if (error.code === '23505') return { error: 'Un plan avec ce nom existe déjà.' }
    console.error('[createBillingPlan]', error); return { error: 'Une erreur est survenue.' }
  }
  redirect('/admin/billing-plans')
}
