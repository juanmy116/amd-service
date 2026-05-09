'use server'

import { createAdminClient } from '@/lib/supabase/admin'

export async function submitCsatAction(
  token: string,
  _prev: { error?: string; success?: boolean } | null,
  formData: FormData
): Promise<{ error?: string; success?: boolean }> {
  const rating = Number(formData.get('rating'))
  const comment = (formData.get('comment') as string)?.trim() || null

  if (!rating || rating < 1 || rating > 5) {
    return { error: 'Veuillez sélectionner une note.' }
  }

  const admin = createAdminClient()

  const { data: csat } = await admin
    .from('csat_responses')
    .select('id, responded_at, expires_at')
    .eq('token', token)
    .maybeSingle()

  if (!csat) return { error: 'Lien invalide.' }
  if (csat.responded_at) return { error: 'Vous avez déjà répondu à cette enquête.' }
  if (new Date(csat.expires_at) < new Date()) return { error: 'Ce lien a expiré.' }

  const { error } = await admin
    .from('csat_responses')
    .update({ rating, comment, responded_at: new Date().toISOString() })
    .eq('id', csat.id)

  if (error) return { error: 'Une erreur est survenue. Veuillez réessayer.' }

  return { success: true }
}
