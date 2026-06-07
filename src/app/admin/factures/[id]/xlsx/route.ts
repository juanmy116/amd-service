import { requireAdmin } from '@/lib/auth'
import { createAdminClient } from '@/lib/supabase/admin'
import { buildInvoiceWorkbook, type InvoiceHeader, type InvoiceLineRow } from '@/lib/invoice-xlsx'

export const runtime = 'nodejs'   // N5: ExcelJS y Buffer son Node-only

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  await requireAdmin()
  const { id } = await params
  const admin = createAdminClient()
  const { data: inv } = await admin.from('invoices').select('*').eq('id', id).single()
  if (!inv) return new Response('Not found', { status: 404 })
  const { data: lines } = await admin.from('invoice_lines').select('*').eq('invoice_id', id).order('numero_contrat')

  const buf = await buildInvoiceWorkbook(inv as InvoiceHeader, (lines ?? []) as InvoiceLineRow[])
  return new Response(new Uint8Array(buf), {
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="${inv.numero_facture}.xlsx"`,
    },
  })
}
