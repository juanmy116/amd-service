'use server'

import { requireAdmin } from '@/lib/auth'
import { revalidatePath } from 'next/cache'

const VALID_STATUSES = ['nouveau', 'traité', 'archivé']

export async function updateLeadStatusAction(
  id: string,
  status: string
): Promise<{ error?: string }> {
  const { supabase } = await requireAdmin()
  if (!VALID_STATUSES.includes(status)) return { error: 'Statut invalide.' }

  const { error } = await supabase.from('leads').update({ status }).eq('id', id)
  if (error) {
    console.error('[updateLeadStatus]', error)
    return { error: 'Erreur lors de la mise à jour.' }
  }

  revalidatePath('/admin/leads')
  return {}
}
