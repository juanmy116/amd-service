import { requireAdmin } from '@/lib/auth'
import { createAdminClient } from '@/lib/supabase/admin'
import { buildClientInvoiceDraft, listBillableClients } from '@/lib/invoicing'
import FacturationPreview from '@/components/admin/FacturationPreview'

export const dynamic = 'force-dynamic'

export default async function FacturationPage({
  searchParams,
}: { searchParams: Promise<{ client?: string; year?: string; month?: string }> }) {
  await requireAdmin()
  const sp = await searchParams
  const now = new Date()
  const year  = sp.year  ? Number(sp.year)  : now.getFullYear()
  const month = sp.month ? Number(sp.month) : now.getMonth() + 1

  const clients = await listBillableClients(year, month)
  const clientId = sp.client ? Number(sp.client) : (clients[0]?.id ?? null)
  const draft = clientId != null ? await buildClientInvoiceDraft(clientId, year, month) : null

  let alreadyIssued: string | null = null
  if (clientId != null) {
    const admin = createAdminClient()
    const { data } = await admin.from('invoices')
      .select('numero_facture')
      .eq('client_id', clientId).eq('period_year', year).eq('period_month', month).eq('status', 'emise')
      .maybeSingle()
    alreadyIssued = data?.numero_facture ?? null
  }

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-6">
      <div>
        <h1 className="text-xl font-bold text-ink">Rapport de facturation</h1>
        <p className="text-sm text-ink-muted mt-0.5">Aperçu calculé à partir des relevés. Émettez pour figer la facture.</p>
      </div>
      <FacturationPreview clients={clients} selectedClient={clientId} year={year} month={month} draft={draft} alreadyIssued={alreadyIssued} />
    </div>
  )
}
