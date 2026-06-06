'use server'
import { requireAdmin } from '@/lib/auth'
import { redirect } from 'next/navigation'
import { buildInvoiceWorkbook, type InvoiceHeader, type InvoiceLineRow } from '@/lib/invoice-xlsx'

export async function annulInvoiceAction(id: string, fd: FormData): Promise<void> {
  const { user, supabase } = await requireAdmin()
  const reason = (fd.get('reason') as string)?.trim() || null
  const { error } = await supabase.from('invoices')
    .update({ status: 'annulee', annulled_by: user.id, annulled_at: new Date().toISOString(), annulation_reason: reason })
    .eq('id', id).eq('status', 'emise')
  if (error) { console.error('[annul]', error); throw new Error('Annulation impossible.') }
  redirect(`/admin/factures/${id}`)
}

export async function emailInvoiceAction(id: string): Promise<void> {
  const { supabase } = await requireAdmin()
  const recipients = (process.env.BILLING_NOTIFY_EMAILS ?? '').split(',').map(s => s.trim()).filter(Boolean)
  if (recipients.length === 0) throw new Error('BILLING_NOTIFY_EMAILS non configurée.')

  const { data: inv } = await supabase.from('invoices').select('*').eq('id', id).single()
  if (!inv) throw new Error('Facture introuvable.')
  const { data: lines } = await supabase.from('invoice_lines').select('*').eq('invoice_id', id).order('numero_contrat')

  const buf = await buildInvoiceWorkbook(inv as InvoiceHeader, (lines ?? []) as InvoiceLineRow[])
  const base64 = buf.toString('base64')

  const res = await fetch(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/send-email`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${process.env.SUPABASE_SECRET_KEY}` },
    body: JSON.stringify({
      template: 'raw', to: recipients,
      data: {
        subject: `Facture ${inv.numero_facture} — ${inv.client_name}`,
        html: `<p>Ci-joint la facture <strong>${inv.numero_facture}</strong> (${inv.client_name}).</p>`,
      },
      attachments: [{ filename: `${inv.numero_facture}.xlsx`, content: base64 }],
    }),
  })
  if (!res.ok) { console.error('[emailInvoice]', await res.text()); throw new Error('Envoi email impossible.') }
  redirect(`/admin/factures/${id}?sent=1`)
}
