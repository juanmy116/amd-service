import { requireAdmin } from '@/lib/auth'
import { createAdminClient } from '@/lib/supabase/admin'
import { buildContractInvoiceDraft, listBillableContracts, BillingDataError, type ContractDraft } from '@/lib/invoicing'
import ContractInvoicePreview from '@/components/admin/ContractInvoicePreview'

export const dynamic = 'force-dynamic'

export default async function FacturationPage({
  searchParams,
}: { searchParams: Promise<{ contract?: string; year?: string; month?: string }> }) {
  await requireAdmin()
  const sp = await searchParams
  const now = new Date()
  const year  = sp.year  ? Number(sp.year)  : now.getFullYear()
  const month = sp.month ? Number(sp.month) : now.getMonth() + 1

  // BLOQUE E: facturación por CONTRATO/ciclo de aniversario (regla 9).
  // P0-7: un fallo TÉCNICO de lectura bloquea preview y emisión; nunca se factura "0 estimado".
  let contracts: { id: string; numero_contrat: string; client_name: string }[] = []
  let contractId: string | null = null
  let draft: ContractDraft | null = null
  let technicalError = false
  try {
    contracts = await listBillableContracts(year, month)
    contractId = sp.contract ?? (contracts[0]?.id ?? null)
    draft = contractId != null ? await buildContractInvoiceDraft(contractId, year, month) : null
  } catch (e) {
    if (e instanceof BillingDataError) technicalError = true
    else throw e
  }

  let alreadyIssued: string | null = null
  if (!technicalError && draft) {
    const admin = createAdminClient()
    // P0 dedup (Forma B): «déjà émise» se detecta por MES FACTURADO (period_year/period_month),
    // identidad estable. period_start es una fecha real variable y ya no sirve de clave.
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
        <p className="text-sm text-ink-muted mt-0.5">Une facture par contrat et par cycle d&apos;anniversaire (jour de facturation). Émettez pour figer la facture.</p>
      </div>
      <ContractInvoicePreview contracts={contracts} selectedContract={contractId} year={year} month={month} draft={draft} alreadyIssued={alreadyIssued} technicalError={technicalError} />
    </div>
  )
}
