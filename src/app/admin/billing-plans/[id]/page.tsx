import { requireAdmin } from '@/lib/auth'
import { createAdminClient } from '@/lib/supabase/admin'
import { notFound } from 'next/navigation'
import Link from 'next/link'
import { Card } from '@/components/ui/Card'
import BillingPlanForm from '@/components/admin/BillingPlanForm'
import { updateBillingPlanAction } from './actions'
import type { BillingPlan } from '@/lib/billing'

export default async function EditBillingPlanPage({ params }: { params: Promise<{ id: string }> }) {
  await requireAdmin()
  const { id } = await params
  const admin = createAdminClient()
  const { data: plan } = await admin.from('billing_plans').select('*').eq('id', id).single()
  if (!plan) notFound()
  const boundAction = updateBillingPlanAction.bind(null, id)
  return (
    <div className="p-6 max-w-xl mx-auto space-y-6">
      <div className="flex items-center gap-3">
        <Link href="/admin/billing-plans" className="text-sm text-ink-muted hover:text-ink">← Retour</Link>
        <h1 className="text-xl font-bold text-ink">Modifier le plan</h1>
      </div>
      <Card className="p-6"><BillingPlanForm action={boundAction} defaultValues={plan as BillingPlan} submitLabel="Enregistrer" /></Card>
    </div>
  )
}
