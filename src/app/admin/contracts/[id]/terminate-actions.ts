'use server'

import { requireAdmin } from '@/lib/auth'
import { createAdminClient } from '@/lib/supabase/admin'
import { revalidatePath } from 'next/cache'

export type TerminateState = { error: string } | { success: true } | null

type LineReading = { cm_id: string; end_counter_bw: number; end_counter_color: number }

export async function terminateContractAction(
  contractId: string,
  _prev: TerminateState,
  formData: FormData,
): Promise<TerminateState> {
  await requireAdmin()

  const date = ((formData.get('date') as string) ?? '').trim()
  if (!date) return { error: 'La date de fin est obligatoire.' }

  let lines: LineReading[]
  try {
    lines = JSON.parse((formData.get('lines') as string) ?? '[]')
  } catch {
    return { error: 'Données de relevés invalides.' }
  }
  if (!Array.isArray(lines) || lines.length === 0) {
    return { error: 'Aucune machine à clôturer.' }
  }
  for (const l of lines) {
    if (
      !l.cm_id ||
      !Number.isFinite(l.end_counter_bw) || !Number.isFinite(l.end_counter_color) ||
      l.end_counter_bw < 0 || l.end_counter_color < 0
    ) {
      return { error: 'Renseignez un relevé final valide pour chaque machine.' }
    }
  }

  const admin = createAdminClient()
  const { error } = await admin.rpc('terminate_contract', {
    p_payload: { contract_id: contractId, date, lines },
  })
  if (error) {
    console.error('[terminateContract.rpc]', error)
    return { error: mapTerminateError(error.message) }
  }

  revalidatePath(`/admin/contracts/${contractId}`)
  return { success: true }
}

function mapTerminateError(msg: string): string {
  if (msg.includes('lines_mismatch'))         return 'Renseignez le relevé final de toutes les machines du contrat.'
  if (msg.includes('end_counter_required'))   return 'Le relevé final est obligatoire pour chaque machine.'
  if (msg.includes('closing_counter_too_low')) return 'Un relevé final est inférieur au dernier relevé enregistré.'
  if (msg.includes('date_before_debut'))      return "La date de fin est antérieure au début d'une ligne."
  if (msg.includes('line_invalid'))           return 'Une ligne du contrat est invalide ou déjà clôturée.'
  if (msg.includes('contract_not_found'))     return 'Contrat introuvable.'
  if (msg.includes('invalid_payload'))        return 'Données invalides.'
  if (msg.includes('forbidden'))              return 'Action non autorisée.'
  return 'Une erreur est survenue lors de la clôture du contrat.'
}
