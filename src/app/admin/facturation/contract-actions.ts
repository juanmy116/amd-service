'use server'

// BLOQUE E2 — emisión de factura por CONTRATO y CICLO de aniversario (regla 9).
// Archivo NUEVO y paralelo a actions.ts (emitInvoiceAction por cliente, legacy) para no
// colisionar con el PR #39 de soporte, que también edita actions.ts. Usa la RPC
// emit_contract_invoice (validación de coherencia en BD). El draft lo calcula el servidor.

import { requireAdmin } from '@/lib/auth'
import { createAdminClient } from '@/lib/supabase/admin'
import { buildContractInvoiceDraft } from '@/lib/invoicing'
import { redirect } from 'next/navigation'

const EMIT_ERROR_LABEL: Record<string, string> = {
  already_issued:          'Une facture existe déjà pour ce contrat et ce cycle.',
  estimated_not_confirmed: 'Relevés manquants non confirmés.',
  contract_not_found:      'Contrat introuvable.',
  client_mismatch:         'Incohérence client/contrat.',
  header_total_mismatch:   'Le total ne correspond pas à la somme des lignes.',
  line_total_mismatch:     'Une ligne a un total incohérent.',
  negative_delta:          'Consommation négative détectée.',
  negative_amount:         'Montant négatif détecté.',
  no_lines:                'Aucune ligne à facturer.',
  invalid_period:          'Période invalide.',
  invalid_payload:         'Données invalides.',
  forbidden:               'Action non autorisée.',
}

export async function emitContractInvoiceAction(fd: FormData): Promise<void> {
  const { user } = await requireAdmin()
  const contract_id = ((fd.get('contract_id') as string) ?? '').trim()
  const year  = Number(fd.get('year'))
  const month = Number(fd.get('month'))
  const confirmEstimated = fd.get('confirm_estimated') === 'true'

  // P2-3: validar enteros y rango antes de calcular/emitir.
  if (!contract_id) throw new Error('Contrat invalide.')
  if (!Number.isInteger(year) || year < 2020 || year > 2100) throw new Error('Année invalide.')
  if (!Number.isInteger(month) || month < 1 || month > 12) throw new Error('Mois invalide.')

  const draft = await buildContractInvoiceDraft(contract_id, year, month)
  if (!draft || draft.lines.length === 0) throw new Error('Aucune ligne à facturer.')
  if (draft.has_estimated && !confirmEstimated) throw new Error('Relevés manquants non confirmés.')

  const admin = createAdminClient()
  const { data: invoiceId, error } = await admin.rpc('emit_contract_invoice', {
    p_payload: {
      contract_id:    draft.contract_id,
      client_id:      draft.client_id,
      client_name:    draft.client_name,
      numero_contrat: draft.numero_contrat,
      period_start:   draft.period_start,
      period_end:     draft.period_end,
      period_year:    draft.period_year,
      period_month:   draft.period_month,
      has_estimated:  draft.has_estimated,
      has_replacement: draft.has_replacement,
      confirm_estimated: confirmEstimated,
      total_amount:   draft.total_amount,
      issued_by:      user.id,
      lines:          draft.lines,
    },
  })

  if (error || !invoiceId) {
    console.error('[emitContractInvoice]', error)
    const msg = error?.message ?? ''
    const key = Object.keys(EMIT_ERROR_LABEL).find(k => msg.includes(k))
    throw new Error(key ? EMIT_ERROR_LABEL[key] : 'Émission impossible.')
  }

  redirect(`/admin/factures/${invoiceId}`)
}
