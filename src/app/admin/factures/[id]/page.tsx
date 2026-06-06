import { requireAdmin } from '@/lib/auth'
import { createAdminClient } from '@/lib/supabase/admin'
import { notFound } from 'next/navigation'
import Link from 'next/link'
import { Card } from '@/components/ui/Card'
import { formatPrice } from '@/lib/billing'
import { annulInvoiceAction, emailInvoiceAction } from './actions'

export const dynamic = 'force-dynamic'

type InvoiceLine = {
  id: string
  numero_contrat: string
  machine_label: string
  plan_name: string
  delta_bw: number
  delta_color: number
  is_estimated: boolean
  amount_total: number
}

export default async function FactureDetailPage({
  params, searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<{ sent?: string }>
}) {
  await requireAdmin()
  const { id } = await params
  const { sent } = await searchParams
  const admin = createAdminClient()

  const { data: inv } = await admin.from('invoices').select('*').eq('id', id).single()
  if (!inv) notFound()
  const { data: lines } = await admin.from('invoice_lines').select('*').eq('invoice_id', id).order('numero_contrat')

  const monthLabel = new Date(inv.period_year, inv.period_month - 1)
    .toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' })
  const isAnnulee = inv.status === 'annulee'
  const boundAnnul = annulInvoiceAction.bind(null, id)
  const boundEmail = emailInvoiceAction.bind(null, id)

  return (
    <div className="p-6 max-w-3xl mx-auto space-y-6">
      <div className="flex items-center gap-3">
        <Link href="/admin/factures" className="text-sm text-ink-muted hover:text-ink">← Retour</Link>
        <h1 className="text-xl font-bold text-ink font-mono">{inv.numero_facture}</h1>
        {isAnnulee && <span className="text-xs font-medium text-ink-muted bg-neutral-soft rounded-full px-2 py-0.5">Annulée</span>}
        {inv.has_estimated && <span className="text-xs font-medium text-warning bg-warning-soft rounded-full px-2 py-0.5">Lignes estimées</span>}
      </div>

      {sent && (
        <div className="px-4 py-3 rounded-lg bg-success-soft border border-success/20 text-sm text-success">
          Tableur envoyé par email.
        </div>
      )}

      <Card className="p-6 space-y-1">
        <div className="flex justify-between text-sm"><span className="text-ink-muted">Client</span><span className="text-ink font-medium">{inv.client_name}</span></div>
        <div className="flex justify-between text-sm"><span className="text-ink-muted">Période</span><span className="text-ink font-medium">{monthLabel}</span></div>
        <div className="flex justify-between text-sm"><span className="text-ink-muted">Émise le</span><span className="text-ink font-medium">{new Date(inv.issued_at).toLocaleDateString('fr-FR')}</span></div>
        <div className="flex justify-between text-base pt-2 border-t border-line-subtle mt-2"><span className="font-semibold text-ink">Total</span><span className={`font-bold ${isAnnulee ? 'line-through text-ink-muted' : 'text-ink'}`}>{formatPrice(inv.total_amount)}</span></div>
        {isAnnulee && inv.annulation_reason && (
          <p className="text-xs text-ink-muted pt-2">Motif d&apos;annulation : {inv.annulation_reason}</p>
        )}
      </Card>

      <Card className="overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead><tr className="border-b border-line text-xs text-ink-muted">
              <th className="text-left px-5 py-2">Machine</th><th className="text-left px-4 py-2">Contrat</th>
              <th className="text-left px-4 py-2">Plan</th><th className="text-right px-4 py-2">ΔB&N</th>
              <th className="text-right px-4 py-2">ΔCoul.</th><th className="text-right px-5 py-2">Total</th>
            </tr></thead>
            <tbody className="divide-y divide-line-subtle">
              {(lines ?? []).map((l: InvoiceLine) => (
                <tr key={l.id}>
                  <td className="px-5 py-3 font-mono text-xs">{l.machine_label}{l.is_estimated && <span className="ml-2 text-[10px] font-medium text-warning bg-warning-soft rounded-full px-2 py-0.5">Estimée</span>}</td>
                  <td className="px-4 py-3 text-xs text-ink-soft">{l.numero_contrat}</td>
                  <td className="px-4 py-3 text-xs text-ink-soft">{l.plan_name}</td>
                  <td className="px-4 py-3 text-right">{l.delta_bw.toLocaleString('fr-FR')}</td>
                  <td className="px-4 py-3 text-right">{l.delta_color.toLocaleString('fr-FR')}</td>
                  <td className="px-5 py-3 text-right font-semibold">{formatPrice(l.amount_total)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      <div className="flex flex-wrap items-center gap-3">
        <a href={`/admin/factures/${id}/xlsx`}
          className="rounded-input border border-line px-4 py-2 text-sm font-medium text-ink hover:bg-neutral-soft transition-colors">
          Télécharger le tableur
        </a>
        <form action={boundEmail}>
          <button type="submit" className="rounded-input border border-line px-4 py-2 text-sm font-medium text-ink hover:bg-neutral-soft transition-colors">
            Envoyer par email
          </button>
        </form>
        {!isAnnulee && (
          <form action={boundAnnul} className="flex items-center gap-2 ml-auto">
            <input name="reason" type="text" placeholder="Motif d'annulation…"
              className="rounded-input border border-line bg-card px-3 py-2 text-sm text-ink" />
            <button type="submit" className="rounded-input border border-accent/20 bg-accent-soft px-4 py-2 text-sm font-medium text-accent hover:bg-accent/10 transition-colors">
              Annuler la facture
            </button>
          </form>
        )}
      </div>
    </div>
  )
}
