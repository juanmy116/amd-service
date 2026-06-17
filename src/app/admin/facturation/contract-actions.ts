'use server'

// Emisión de factura por CONTRATO y MES facturado (Forma B: periodo real entre relevés). Vía ÚNICA
// de emisión desde WP-3 (la vía legacy por cliente/mes — actions.ts/emitInvoiceAction — fue eliminada).
// Usa la RPC emit_contract_invoice (validación de coherencia + dedup por mes en BD). El draft lo calcula el servidor.

import { requireAdmin } from '@/lib/auth'
import { createAdminClient } from '@/lib/supabase/admin'
import type { Json } from '@/lib/supabase/types'
import { buildContractInvoiceDraft } from '@/lib/invoicing'
import { redirect } from 'next/navigation'

const EMIT_ERROR_LABEL: Record<string, string> = {
  already_issued:          'Une facture existe déjà pour ce contrat et ce mois.',
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
  // PR-D.1 — endurecimiento de la emisión (validaciones server-side).
  billing_sequence_mismatch: 'Mois hors séquence : facturez d’abord le mois précédent.',
  line_without_cm:           'Ligne sans poste (cm_id) : données incohérentes.',
  cm_id_not_in_contract:     'Une ligne ne correspond pas à ce contrat.',
  opening_counter_not_in_line: 'Relevé d’ouverture invalide pour ce poste.',
  closing_counter_not_in_line: 'Relevé de clôture invalide pour ce poste.',
  closing_counter_already_used: 'Relevé de clôture déjà facturé.',
}

// Estado del formulario de emisión (patrón useActionState). En éxito la acción hace redirect()
// (no devuelve estado). En error devuelve { error } para que la UI lo muestre — los `throw` en
// una Server Action invocada por <form> quedan ENMASCARADOS por Next.js en producción (P1-2).
export type EmitState = { error: string } | null

export async function emitContractInvoiceAction(_prev: EmitState, fd: FormData): Promise<EmitState> {
  const { user } = await requireAdmin()
  const contract_id = ((fd.get('contract_id') as string) ?? '').trim()
  const year  = Number(fd.get('year'))
  const month = Number(fd.get('month'))
  const confirmEstimated = fd.get('confirm_estimated') === 'true'

  // P2-3: validar enteros y rango antes de calcular/emitir.
  if (!contract_id) return { error: 'Contrat invalide.' }
  if (!Number.isInteger(year) || year < 2020 || year > 2100) return { error: 'Année invalide.' }
  if (!Number.isInteger(month) || month < 1 || month > 12) return { error: 'Mois invalide.' }

  // P1: no emitir un mes FUTURO. listReadyToBill ya lo bloquea, pero la acción recibe year/month del
  // formulario → se revalida aquí. «Mes actual» en hora de NEGOCIO (Africa/Dakar = UTC, sin DST; A4).
  const now = new Date()
  if (year * 12 + (month - 1) > now.getUTCFullYear() * 12 + now.getUTCMonth()) {
    return { error: 'Mois futur : facturation impossible.' }
  }

  let draft
  try {
    draft = await buildContractInvoiceDraft(contract_id, year, month)
  } catch (e) {
    // BillingDataError u otro fallo técnico de lectura → bloquear con mensaje claro (nunca facturar 0).
    console.error('[emitContractInvoice] draft', e)
    return { error: 'Blocage technique : impossible de lire les données de facturation. Réessayez.' }
  }
  if (!draft || draft.lines.length === 0) return { error: 'Aucune ligne à facturer.' }
  if (draft.has_estimated && !confirmEstimated) return { error: 'Relevés manquants non confirmés.' }

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
      // p_payload es jsonb (tipado Json por el generador). El draft es un objeto nominal
      // serializable; TS no lo acepta como Json sin index signature → cast explícito.
    } as unknown as Json,
  })

  if (error || !invoiceId) {
    console.error('[emitContractInvoice]', error)
    const msg = error?.message ?? ''
    const key = Object.keys(EMIT_ERROR_LABEL).find(k => msg.includes(k))
    return { error: key ? EMIT_ERROR_LABEL[key] : 'Émission impossible.' }
  }

  // Éxito: redirect() lanza la señal NEXT_REDIRECT (fuera de cualquier try/catch) — Next la maneja.
  redirect(`/admin/factures/${invoiceId}`)
}
