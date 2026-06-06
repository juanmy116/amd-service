import { requireAdmin } from '@/lib/auth'
import { createAdminClient } from '@/lib/supabase/admin'
import Link from 'next/link'
import { formatPrice } from '@/lib/billing'
import { Card } from '@/components/ui/Card'

export const dynamic = 'force-dynamic'

type InvoiceRow = {
  id: string
  numero_facture: string
  client_name: string
  period_year: number
  period_month: number
  status: 'emise' | 'annulee'
  total_amount: number
  has_estimated: boolean
}

export default async function FacturesPage() {
  await requireAdmin()
  const admin = createAdminClient()
  const { data: invoices } = await admin
    .from('invoices')
    .select('id, numero_facture, client_name, period_year, period_month, status, total_amount, has_estimated')
    .order('issued_at', { ascending: false })

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-ink">Factures émises</h1>
          <p className="text-sm text-ink-muted mt-0.5">Historique des factures</p>
        </div>
        <Link href="/admin/facturation" className="rounded-input bg-accent px-4 py-2 text-sm font-semibold text-white hover:bg-accent/90">
          Nouvelle facture →
        </Link>
      </div>

      <Card className="divide-y divide-line">
        {(!invoices || invoices.length === 0) && (
          <p className="px-6 py-8 text-sm text-center text-ink-muted">Aucune facture émise.</p>
        )}
        {(invoices ?? []).map((inv: InvoiceRow) => {
          const monthLabel = new Date(inv.period_year, inv.period_month - 1)
            .toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' })
          return (
            <Link key={inv.id} href={`/admin/factures/${inv.id}`}
              className="flex items-center justify-between px-6 py-4 gap-4 hover:bg-neutral-soft/50 transition-colors">
              <div className="min-w-0">
                <p className="text-sm font-semibold text-ink font-mono">{inv.numero_facture}</p>
                <p className="text-xs text-ink-muted mt-0.5">{inv.client_name} · {monthLabel}</p>
              </div>
              <div className="flex items-center gap-3 shrink-0">
                {inv.has_estimated && <span className="text-[10px] font-medium text-warning bg-warning-soft rounded-full px-2 py-0.5">Estimée</span>}
                {inv.status === 'annulee' && <span className="text-[10px] font-medium text-ink-muted bg-neutral-soft rounded-full px-2 py-0.5">Annulée</span>}
                <span className={`text-sm font-bold ${inv.status === 'annulee' ? 'text-ink-muted line-through' : 'text-ink'}`}>
                  {formatPrice(inv.total_amount)}
                </span>
              </div>
            </Link>
          )
        })}
      </Card>
    </div>
  )
}
