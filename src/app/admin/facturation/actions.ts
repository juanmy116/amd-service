'use server'
import { requireAdmin } from '@/lib/auth'
import { createAdminClient } from '@/lib/supabase/admin'
import { buildClientInvoiceDraft } from '@/lib/invoicing'
import { redirect } from 'next/navigation'

const EMIT_ERROR_LABEL: Record<string, string> = {
  already_issued:          'Une facture existe déjà pour ce client et ce mois.',
  estimated_not_confirmed: 'Relevés manquants non confirmés.',
  forbidden:               'Action non autorisée.',
}

export async function emitInvoiceAction(fd: FormData): Promise<void> {
  const { user } = await requireAdmin()
  const client_id = Number(fd.get('client_id'))   // clients.id es BIGINT → number
  const year  = Number(fd.get('year'))
  const month = Number(fd.get('month'))
  const confirmEstimated = fd.get('confirm_estimated') === 'true'

  // P2-3: validar enteros y rango antes de calcular/emitir. Evita periodos absurdos
  // o IDs no válidos vía solicitudes manipuladas. La BD también lo refuerza (CHECK).
  if (!Number.isInteger(client_id) || client_id <= 0) throw new Error('Client invalide.')
  if (!Number.isInteger(year) || year < 2020 || year > 2100) throw new Error('Année invalide.')
  if (!Number.isInteger(month) || month < 1 || month > 12) throw new Error('Mois invalide.')

  const draft = await buildClientInvoiceDraft(client_id, year, month)
  if (!draft || draft.lines.length === 0) throw new Error('Aucune ligne à facturer.')
  if (draft.has_estimated && !confirmEstimated) throw new Error('Relevés manquants non confirmés.')

  // Emisión atómica vía RPC (numeración + cabecera + líneas en una transacción).
  // Las RPC se invocan SIEMPRE con admin.rpc (service_role); next_invoice_number/emit_invoice
  // revocan EXECUTE de authenticated (N9).
  const admin = createAdminClient()
  const { data: invoiceId, error } = await admin.rpc('emit_invoice', {
    p_payload: {
      client_id,
      client_name: draft.client_name,
      period_year: year,
      period_month: month,
      has_estimated: draft.has_estimated,
      has_replacement: draft.has_replacement,
      confirm_estimated: confirmEstimated,
      total_amount: draft.total_amount,
      issued_by: user.id,
      lines: draft.lines,
    },
  })

  if (error || !invoiceId) {
    console.error('[emit]', error)
    const msg = error?.message ?? ''
    const key = Object.keys(EMIT_ERROR_LABEL).find(k => msg.includes(k))
    throw new Error(key ? EMIT_ERROR_LABEL[key] : 'Émission impossible.')
  }

  redirect(`/admin/factures/${invoiceId}`)
}
