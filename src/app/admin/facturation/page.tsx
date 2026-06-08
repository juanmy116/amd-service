import { requireAdmin } from '@/lib/auth'
import { createAdminClient } from '@/lib/supabase/admin'
import { buildClientInvoiceDraft, listBillableClients, BillingDataError, type ClientDraft } from '@/lib/invoicing'
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

  // P0-7: un fallo TÉCNICO de lectura bloquea preview y emisión; nunca se factura "0 estimado".
  let clients: { id: number; nom_client: string }[] = []
  let clientId: number | null = null
  let draft: ClientDraft | null = null
  let technicalError = false
  try {
    clients = await listBillableClients(year, month)
    clientId = sp.client ? Number(sp.client) : (clients[0]?.id ?? null)
    draft = clientId != null ? await buildClientInvoiceDraft(clientId, year, month) : null
  } catch (e) {
    if (e instanceof BillingDataError) technicalError = true
    else throw e
  }

  let alreadyIssued: string | null = null
  if (!technicalError && clientId != null) {
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
      <FacturationPreview clients={clients} selectedClient={clientId} year={year} month={month} draft={draft} alreadyIssued={alreadyIssued} technicalError={technicalError} />
    </div>
  )
}
