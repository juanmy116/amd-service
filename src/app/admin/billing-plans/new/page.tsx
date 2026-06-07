import { requireAdmin } from '@/lib/auth'
import Link from 'next/link'
import { Card } from '@/components/ui/Card'
import BillingPlanForm from '@/components/admin/BillingPlanForm'
import { createBillingPlanAction } from './actions'

export default async function NewBillingPlanPage() {
  await requireAdmin()
  return (
    <div className="p-6 max-w-xl mx-auto space-y-6">
      <div className="flex items-center gap-3">
        <Link href="/admin/billing-plans" className="text-sm text-ink-muted hover:text-ink">← Retour</Link>
        <h1 className="text-xl font-bold text-ink">Nouveau plan</h1>
      </div>
      <Card className="p-6"><BillingPlanForm action={createBillingPlanAction} submitLabel="Créer le plan" /></Card>
    </div>
  )
}
