import { requireAdmin } from '@/lib/auth'
import { createAdminClient } from '@/lib/supabase/admin'
import Link from 'next/link'
import { BILLING_TYPE_LABEL, type BillingPlan } from '@/lib/billing'
import { toggleBillingPlanAction } from './[id]/actions'
import { Card } from '@/components/ui/Card'

export default async function BillingPlansPage() {
  await requireAdmin()
  const admin = createAdminClient()
  const { data: plans, error } = await admin.from('billing_plans').select('*').order('name')
  if (error) { console.error('[billing-plans]', error); throw new Error('DATA_FETCH_ERROR') }

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-ink">Plans de facturation</h1>
          <p className="text-sm text-ink-muted mt-0.5">Catalogue des types de facturation AMD</p>
        </div>
        <Link href="/admin/billing-plans/new" className="rounded-input bg-accent px-4 py-2 text-sm font-semibold text-white hover:bg-accent/90">+ Nouveau plan</Link>
      </div>
      <Card className="divide-y divide-line">
        {(!plans || plans.length === 0) && (
          <p className="px-6 py-8 text-sm text-center text-ink-muted">Aucun plan créé. <Link href="/admin/billing-plans/new" className="text-accent hover:underline">Créer le premier →</Link></p>
        )}
        {((plans ?? []) as BillingPlan[]).map((plan) => (
          <div key={plan.id} className="flex items-center justify-between px-6 py-4 gap-4">
            <div className="min-w-0">
              <p className="text-sm font-semibold text-ink">{plan.name}</p>
              <p className="text-xs text-ink-muted mt-0.5">{BILLING_TYPE_LABEL[plan.type]}</p>
              <p className="text-xs text-ink-soft mt-1">
                {plan.type === 'per_copy'      && `B&N: ${Number(plan.price_bw)} · Couleur: ${Number(plan.price_color)} FCFA/copie`}
                {plan.type === 'hybrid'        && `Forfait: ${Number(plan.fixed_fee)} FCFA · B&N: ${Number(plan.price_bw)} · Couleur: ${Number(plan.price_color)}`}
                {plan.type === 'hybrid_tiered' && `Forfait: ${Number(plan.fixed_fee)} FCFA · ${plan.tiers?.length ?? 0} tranches`}
              </p>
            </div>
            <div className="flex items-center gap-3 shrink-0">
              {!plan.active && <span className="text-xs font-medium text-ink-muted bg-neutral-soft rounded-full px-2 py-0.5">Inactif</span>}
              <Link href={`/admin/billing-plans/${plan.id}`} className="text-sm text-ink-muted hover:text-ink">Modifier</Link>
              <form action={toggleBillingPlanAction}>
                <input type="hidden" name="id" value={plan.id} />
                <input type="hidden" name="active" value={String(plan.active)} />
                <button type="submit" className="text-xs text-ink-muted hover:text-accent">{plan.active ? 'Désactiver' : 'Activer'}</button>
              </form>
            </div>
          </div>
        ))}
      </Card>
    </div>
  )
}
