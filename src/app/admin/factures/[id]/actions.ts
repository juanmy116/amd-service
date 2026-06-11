'use server'
import { requireAdmin } from '@/lib/auth'
import { redirect } from 'next/navigation'
import { buildInvoiceWorkbook, type InvoiceHeader, type InvoiceLineRow } from '@/lib/invoice-xlsx'

// WP-5c: estas acciones se invocan desde <form> sin useActionState; un `throw` queda
// ENMASCARADO por Next.js en producción (el admin no ve por qué falló). En su lugar
// redirigimos de vuelta al detalle con ?error=… y la página lo muestra en un banner
// (mismo patrón que el ?sent=1 del éxito).
function failRedirect(id: string, message: string): never {
  redirect(`/admin/factures/${id}?error=${encodeURIComponent(message)}`)
}

export async function annulInvoiceAction(id: string, fd: FormData): Promise<void> {
  const { user, supabase } = await requireAdmin()
  const reason = (fd.get('reason') as string)?.trim() || null
  const { data, error } = await supabase.from('invoices')
    .update({ status: 'annulee', annulled_by: user.id, annulled_at: new Date().toISOString(), annulation_reason: reason })
    .eq('id', id).eq('status', 'emise')
    .select('id')
  if (error) { console.error('[annul]', error); failRedirect(id, 'Annulation impossible.') }
  if (!data || data.length === 0) failRedirect(id, 'Facture déjà annulée ou introuvable.')
  redirect(`/admin/factures/${id}`)
}

export async function emailInvoiceAction(id: string): Promise<void> {
  const { supabase } = await requireAdmin()
  const recipients = (process.env.BILLING_NOTIFY_EMAILS ?? '').split(',').map(s => s.trim()).filter(Boolean)
  if (recipients.length === 0) failRedirect(id, 'BILLING_NOTIFY_EMAILS non configurée.')

  const { data: inv, error: invErr } = await supabase.from('invoices').select('*').eq('id', id).single()
  // PGRST116 = sin filas (factura inexistente) → mensaje claro; el resto = fallo técnico.
  if (invErr && invErr.code !== 'PGRST116') { console.error('[emailInvoice] invoices', invErr); failRedirect(id, 'Erreur technique : envoi annulé.') }
  if (!inv) failRedirect(id, 'Facture introuvable.')
  if (inv.status !== 'emise') failRedirect(id, 'Facture annulée : envoi impossible.')

  const { data: lines, error: linesErr } = await supabase.from('invoice_lines').select('*').eq('invoice_id', id).order('numero_contrat')
  // P2-1: un fallo técnico de lectura NO debe degradar a "factura sin líneas" — abortar el envío.
  if (linesErr) { console.error('[emailInvoice] invoice_lines', linesErr); failRedirect(id, 'Erreur technique : envoi annulé.') }
  if (!lines || lines.length === 0) failRedirect(id, 'Facture sans lignes : envoi annulé.')

  const buf = await buildInvoiceWorkbook(inv as InvoiceHeader, lines as InvoiceLineRow[])
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
  if (!res.ok) { console.error('[emailInvoice]', await res.text()); failRedirect(id, 'Envoi email impossible.') }
  redirect(`/admin/factures/${id}?sent=1`)
}
