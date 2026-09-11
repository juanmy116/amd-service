import { requireAdmin } from '@/lib/auth'
import { createAdminClient } from '@/lib/supabase/admin'
import { buildContractInvoiceDraft, listReadyToBill, BillingDataError, type ContractDraft, type ReadyToBillEntry } from '@/lib/invoicing'
import { isBillingEnabled } from '@/lib/billing-lock'
import ContractInvoicePreview from '@/components/admin/ContractInvoicePreview'

export const dynamic = 'force-dynamic'

export default async function FacturationPage({
  searchParams,
}: { searchParams: Promise<{ contract?: string; year?: string; month?: string }> }) {
  await requireAdmin()
  const sp = await searchParams
  const billingEnabled = await isBillingEnabled()

  // FORMA B: la pantalla lista las TANDAS listas para facturar (contrato + mes con lecturas, no
  // facturado aún). El periodo real (fechas de lectura) y el total los calcula el draft.
  // P0-7: un fallo TÉCNICO de lectura bloquea preview y emisión; nunca se factura "0 estimado".
  let entries: ReadyToBillEntry[] = []
  let selected: ReadyToBillEntry | null = null
  let draft: ContractDraft | null = null
  let technicalError = false
  try {
    entries = await listReadyToBill()
    const wantedY = sp.year ? Number(sp.year) : null
    const wantedM = sp.month ? Number(sp.month) : null
    selected =
      entries.find(e => e.contract_id === sp.contract && e.period_year === wantedY && e.period_month === wantedM)
      ?? entries[0] ?? null
    draft = selected ? await buildContractInvoiceDraft(selected.contract_id, selected.period_year, selected.period_month) : null
  } catch (e) {
    if (e instanceof BillingDataError) technicalError = true
    else throw e
  }

  // Defensa ante carrera (emisión simultánea en otra pestaña): la lista solo muestra pendientes,
  // pero revalidamos por (contrato, mes facturado) antes de ofrecer el botón emitir.
  let alreadyIssued: string | null = null
  if (!technicalError && draft) {
    const admin = createAdminClient()
    const { data } = await admin.from('invoices')
      .select('numero_facture')
      .eq('contract_id', draft.contract_id)
      .eq('period_year', draft.period_year).eq('period_month', draft.period_month)
      .eq('status', 'emise')
      .maybeSingle()
    alreadyIssued = data?.numero_facture ?? null
  }

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-6">
      <div>
        <h1 className="text-xl font-bold text-ink">Rapport de facturation</h1>
        <p className="text-sm text-ink-muted mt-0.5">Une facture par contrat et par mois, sur la période réelle entre relevés. Émettez pour figer la facture.</p>
      </div>
      <ContractInvoicePreview entries={entries} selected={selected} draft={draft} alreadyIssued={alreadyIssued} technicalError={technicalError} billingEnabled={billingEnabled} />
    </div>
  )
}
