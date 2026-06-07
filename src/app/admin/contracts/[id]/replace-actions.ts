'use server'

import { requireAdmin } from '@/lib/auth'
import { createAdminClient } from '@/lib/supabase/admin'
import { revalidatePath } from 'next/cache'

export type ReplaceState = { error: string } | { success: true } | null

export async function replaceMachineAction(
  contractId: string,
  _prev: ReplaceState,
  formData: FormData
): Promise<ReplaceState> {
  await requireAdmin()

  const out_cm_id = (formData.get('out_cm_id') as string ?? '').trim()
  const in_machine_id = (formData.get('in_machine_id') as string ?? '').trim()
  const date = (formData.get('date') as string ?? '').trim()
  const out_counter_bw = Number(formData.get('out_counter_bw') ?? 0)
  const out_counter_color = Number(formData.get('out_counter_color') ?? 0)
  const in_counter_bw = Number(formData.get('in_counter_bw') ?? 0)
  const in_counter_color = Number(formData.get('in_counter_color') ?? 0)

  if (!out_cm_id || !in_machine_id || !date) {
    return { error: 'Données manquantes. Veuillez remplir tous les champs obligatoires.' }
  }
  if (!Number.isFinite(out_counter_bw) || !Number.isFinite(out_counter_color) ||
      !Number.isFinite(in_counter_bw)  || !Number.isFinite(in_counter_color)) {
    return { error: 'Les valeurs de compteur doivent être des nombres valides.' }
  }
  if (out_counter_bw < 0 || out_counter_color < 0 || in_counter_bw < 0 || in_counter_color < 0) {
    return { error: 'Les compteurs ne peuvent pas être négatifs.' }
  }

  const admin = createAdminClient()
  const { error } = await admin.rpc('replace_contract_machine', {
    p_payload: {
      out_cm_id,
      in_machine_id,
      date,
      out_counter_bw,
      out_counter_color,
      in_counter_bw,
      in_counter_color,
    },
  })

  if (error) {
    console.error('[replaceMachine.rpc]', error)
    return { error: mapReplaceError(error.message) }
  }

  revalidatePath(`/admin/contracts/${contractId}`)
  return { success: true }
}

function mapReplaceError(msg: string): string {
  if (msg.includes('out_line_invalid'))       return 'La ligne sortante est invalide ou déjà fermée.'
  if (msg.includes('in_machine_busy'))        return 'La machine entrante est déjà utilisée dans un contrat actif.'
  if (msg.includes('closing_counter_too_low')) return 'Le relevé de clôture est inférieur au dernier relevé enregistré.'
  if (msg.includes('date_before_debut'))      return 'La date de remplacement ne peut pas être antérieure à la date de début de la ligne.'
  if (msg.includes('invalid_payload'))        return 'Données invalides.'
  if (msg.includes('forbidden'))              return 'Permission refusée.'
  return 'Une erreur est survenue lors du remplacement.'
}
