import { requireAdmin } from '@/lib/auth'
import { createAdminClient } from '@/lib/supabase/admin'
import { buildInvoiceWorkbook, type InvoiceHeader, type InvoiceLineRow } from '@/lib/invoice-xlsx'

export const runtime = 'nodejs'   // N5: ExcelJS y Buffer son Node-only

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  await requireAdmin()
  const { id } = await params
  const admin = createAdminClient()
  const { data: inv, error: invErr } = await admin.from('invoices').select('*').eq('id', id).single()
  // PGRST116 = sin filas (factura inexistente) → 404; el resto = fallo técnico → 503.
  if (invErr && invErr.code !== 'PGRST116') { console.error('[invoice xlsx] invoices', invErr); return new Response('Erreur technique', { status: 503 }) }
  if (!inv) return new Response('Not found', { status: 404 })

  const { data: lines, error: linesErr } = await admin.from('invoice_lines').select('*').eq('invoice_id', id).order('numero_contrat')
  // P2-1: un fallo técnico de lectura NO debe producir un XLSX sin líneas — devolver error.
  if (linesErr) { console.error('[invoice xlsx] invoice_lines', linesErr); return new Response('Erreur technique', { status: 503 }) }
  if (!lines || lines.length === 0) return new Response('Facture sans lignes (état incohérent)', { status: 500 })

  const buf = await buildInvoiceWorkbook(inv as InvoiceHeader, lines as InvoiceLineRow[])
  return new Response(new Uint8Array(buf), {
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="${inv.numero_facture}.xlsx"`,
    },
  })
}
