'use server'
import { requireAdmin } from '@/lib/auth'
import { createAdminClient } from '@/lib/supabase/admin'
import { revalidatePath } from 'next/cache'

type ActionState = { error: string } | { ok: true } | null

export async function confirmPendingAction(_p: ActionState, fd: FormData): Promise<ActionState> {
  const { user } = await requireAdmin()
  const id = fd.get('id') as string
  const overrides: Record<string, string> = {}
  for (const k of ['machine_id', 'counter_bw', 'counter_color', 'date_iso']) {
    const v = (fd.get(k) as string | null)?.trim()
    if (v) overrides[k] = v
  }
  const admin = createAdminClient()
  const { error } = await admin.rpc('import_counter_from_pending', {
    p_pending_id: id, p_reviewed_by: user.id, p_overrides: overrides,
  })
  if (error) {
    console.error('[confirmPending]', error)
    const map: Record<string, string> = {
      no_machine: 'Aucune machine associée. Choisissez-en une.',
      no_active_line: 'Aucun contrat actif pour cette machine. Activez le contrat avant import.',
      counter_exists_for_month: 'Un relevé existe déjà pour ce mois.',
      already_processed: 'Déjà traité.',
      missing_counters: 'Compteurs manquants.',
    }
    return { error: map[error.message] ?? 'Erreur lors de la confirmation.' }
  }
  revalidatePath('/admin/contadores/pendientes')
  return { ok: true }
}

export async function rejectPendingAction(_p: ActionState, fd: FormData): Promise<ActionState> {
  const { user } = await requireAdmin()
  const id = fd.get('id') as string
  const reason = ((fd.get('reason') as string) ?? '').trim()
  if (!reason) return { error: 'Motif obligatoire.' }
  const admin = createAdminClient()
  const { error } = await admin.from('pending_counter_imports')
    .update({ status: 'rejected', rejection_reason: reason, reviewed_by: user.id, reviewed_at: new Date().toISOString() })
    .eq('id', id).eq('status', 'pending_review')
  if (error) { console.error('[rejectPending]', error); return { error: 'Erreur lors du rejet.' } }
  revalidatePath('/admin/contadores/pendientes')
  return { ok: true }
}
