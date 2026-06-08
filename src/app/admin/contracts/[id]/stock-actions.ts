'use server'

// BLOQUE A — Server Actions del ciclo de vida parque/stock.
// Envuelven las RPC atómicas return_machine_to_stock / assign_machine_from_stock.
// La GARANTÍA de integridad (lectura obligatoria, máquina en stock, no encadenar) vive en la
// RPC; aquí solo validamos la entrada y traducimos el error. Mismo patrón que replace-actions.ts.

import { requireAdmin } from '@/lib/auth'
import { createAdminClient } from '@/lib/supabase/admin'
import { revalidatePath } from 'next/cache'

export type StockState = { error: string } | { success: true } | null

/**
 * Motivo (a) resiliación: el cliente da de baja la máquina → vuelve al stock.
 * Cierra la línea con su end_counter REAL (lectura al retirar). NO encadena.
 */
export async function returnMachineToStockAction(
  contractId: string,
  _prev: StockState,
  formData: FormData
): Promise<StockState> {
  await requireAdmin()

  const cm_id = ((formData.get('cm_id') as string) ?? '').trim()
  const date = ((formData.get('date') as string) ?? '').trim()
  const end_counter_bw = Number(formData.get('end_counter_bw'))
  const end_counter_color = Number(formData.get('end_counter_color'))

  if (!cm_id || !date) {
    return { error: 'Données manquantes. Veuillez remplir tous les champs obligatoires.' }
  }
  if (!Number.isFinite(end_counter_bw) || !Number.isFinite(end_counter_color)) {
    return { error: 'Le relevé du compteur est obligatoire pour retirer une machine.' }
  }
  if (end_counter_bw < 0 || end_counter_color < 0) {
    return { error: 'Les compteurs ne peuvent pas être négatifs.' }
  }

  const admin = createAdminClient()
  const { error } = await admin.rpc('return_machine_to_stock', {
    p_payload: { cm_id, date, end_counter_bw, end_counter_color },
  })

  if (error) {
    console.error('[returnMachineToStock.rpc]', error)
    return { error: mapStockError(error.message) }
  }

  revalidatePath(`/admin/contracts/${contractId}`)
  return { success: true }
}

/**
 * Rotación de parque: una máquina en stock se asigna a un contrato (cliente nuevo).
 * EXIGE la lectura real del contador como start_counter (regla 3). NO encadena.
 */
export async function assignMachineFromStockAction(
  contractId: string,
  _prev: StockState,
  formData: FormData
): Promise<StockState> {
  await requireAdmin()

  const machine_id = ((formData.get('machine_id') as string) ?? '').trim()
  const date_debut = ((formData.get('date_debut') as string) ?? '').trim()
  const start_counter_bw = Number(formData.get('start_counter_bw'))
  const start_counter_color = Number(formData.get('start_counter_color'))
  const billing_plan_id = ((formData.get('billing_plan_id') as string) ?? '').trim() || null

  if (!machine_id || !date_debut) {
    return { error: 'Données manquantes. Veuillez remplir tous les champs obligatoires.' }
  }
  if (!Number.isFinite(start_counter_bw) || !Number.isFinite(start_counter_color)) {
    return { error: 'Le relevé du compteur est obligatoire pour assigner une machine depuis le stock.' }
  }
  if (start_counter_bw < 0 || start_counter_color < 0) {
    return { error: 'Les compteurs ne peuvent pas être négatifs.' }
  }

  const admin = createAdminClient()
  const { error } = await admin.rpc('assign_machine_from_stock', {
    p_payload: {
      contract_id: contractId,
      machine_id,
      date_debut,
      start_counter_bw,
      start_counter_color,
      billing_plan_id,
    },
  })

  if (error) {
    console.error('[assignMachineFromStock.rpc]', error)
    return { error: mapStockError(error.message) }
  }

  revalidatePath(`/admin/contracts/${contractId}`)
  return { success: true }
}

function mapStockError(msg: string): string {
  if (msg.includes('end_counter_required'))    return 'Le relevé de clôture est obligatoire pour retirer la machine vers le stock.'
  if (msg.includes('start_counter_required'))  return 'Le relevé du compteur est obligatoire pour assigner une machine depuis le stock.'
  if (msg.includes('machine_busy'))            return 'Cette machine est déjà affectée à un contrat actif (elle n\'est pas en stock).'
  if (msg.includes('machine_not_found'))       return 'Machine introuvable.'
  if (msg.includes('contract_not_found'))      return 'Contrat introuvable.'
  if (msg.includes('line_invalid'))            return 'La ligne est invalide ou déjà fermée.'
  if (msg.includes('closing_counter_too_low')) return 'Le relevé de clôture est inférieur au dernier relevé enregistré.'
  if (msg.includes('date_before_debut'))       return 'La date ne peut pas être antérieure à la date de début de la ligne.'
  if (msg.includes('invalid_billing_day'))     return 'Le jour de facturation doit être entre 1 et 31.'
  if (msg.includes('invalid_payload'))         return 'Données invalides.'
  if (msg.includes('forbidden'))               return 'Permission refusée.'
  return 'Une erreur est survenue.'
}
