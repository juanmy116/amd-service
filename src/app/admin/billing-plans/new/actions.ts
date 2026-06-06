'use server'
import { requireAdmin } from '@/lib/auth'
import { redirect } from 'next/navigation'
import { validateTiers, type BillingType, type BillingTier } from '@/lib/billing'

type FormState = { error: string } | null
const VALID: BillingType[] = ['per_copy', 'hybrid', 'hybrid_tiered']

export async function createBillingPlanAction(_p: FormState, fd: FormData): Promise<FormState> {
  const { supabase } = await requireAdmin()
  const name = (fd.get('name') as string).trim()
  const type = fd.get('type') as BillingType
  if (!name) return { error: 'Le nom est obligatoire.' }
  if (!VALID.includes(type)) return { error: 'Type invalide.' }

  const fixed_fee   = type !== 'per_copy'      ? Number(fd.get('fixed_fee'))   : null
  const price_bw    = type !== 'hybrid_tiered' ? Number(fd.get('price_bw'))    : null
  const price_color = type !== 'hybrid_tiered' ? Number(fd.get('price_color')) : null

  let tiers: BillingTier[] | null = null
  if (type === 'hybrid_tiered') {
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
