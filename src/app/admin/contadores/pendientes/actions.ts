'use server'
import { requireAdmin } from '@/lib/auth'
import { createAdminClient } from '@/lib/supabase/admin'
import { revalidatePath } from 'next/cache'
import { validateCounterUpload, extensionForType } from '@/lib/counterUpload'

type ActionState = { error: string } | { ok: true } | null
type UploadState = { error: string } | { ok: true } | { duplicate: true } | null

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
      counter_exists_for_day: 'Un relevé existe déjà pour ce jour. Annulez-le d’abord pour le corriger.',
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

// Subida MANUAL de un documento de contadores (PDF de varias máquinas o 1 imagen) desde la app.
// El documento ENTERO se envía al motor `parse-counter-document`, que lo trocea y se lo da a la IA
// (en 2-3 trozos), extrae TODAS las lecturas y las inserta en la cola. Resuelve los formatos que el
// método foto-a-foto no podía (Pantum a 2 págs, HP) y evita el límite por minuto de la IA.
//
// El archivo NO pasa por la Server Action (Vercel topa el body a 4,5 MB y el PDF de 2AS pesa ~5 MB):
// el navegador lo sube DIRECTO a Supabase Storage con una URL firmada que genera el servidor. La app
// solo intercambia datos pequeños (hash, ruta, token).
type PrepareState =
  | { ok: true; path: string; token: string }
  | { duplicate: true }
  | { error: string }

// Paso 1: validar + dedup de documento + devolver una URL firmada para subir directo al bucket.
export async function prepareCounterUploadAction(hash: string, type: string, size: number): Promise<PrepareState> {
  await requireAdmin()
  const valid = validateCounterUpload({ type, size })
  if (!valid.ok) {
    const map = {
      type: 'Format non supporté. Utilisez JPG, PNG, WEBP ou PDF.',
      empty: 'Fichier vide.',
      too_large: 'Fichier trop volumineux (max 10 Mo).',
    } as const
    return { error: map[valid.error] }
  }

  const ext = extensionForType(type)
  const now = new Date()
  // Path determinista por hash: el MISMO documento → la MISMA ruta.
  const path = `manual/${now.getUTCFullYear()}/${String(now.getUTCMonth() + 1).padStart(2, '0')}/${hash}.${ext}`

  const admin = createAdminClient()
  // Dedup a nivel de DOCUMENTO: si ya hay filas de este mismo PDF, no rehacer nada (no re-paga la IA).
  const { count } = await admin.from('pending_counter_imports')
    .select('id', { count: 'exact', head: true }).eq('image_path', path)
  if (count && count > 0) return { duplicate: true }

  const { data, error } = await admin.storage.from('counter-images').createSignedUploadUrl(path, { upsert: true })
  if (error || !data) { console.error('[prepareCounterUpload]', error); return { error: 'Erreur lors de la préparation de l’envoi.' } }
  return { ok: true, path, token: data.token }
}

// Paso 2 (tras subir el archivo a la URL firmada): disparar el motor. Solo datos pequeños.
export async function triggerCounterDocumentAction(path: string, type: string, hash: string): Promise<UploadState> {
  const { user } = await requireAdmin()
  try {
    const res = await fetch(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/parse-counter-document`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${process.env.SUPABASE_SECRET_KEY}` },
      body: JSON.stringify({ document_path: path, content_type: type, doc_hash: hash, uploaded_by: user.email ?? null }),
    })
    if (!res.ok) { console.error('[triggerCounterDoc] trigger', res.status, await res.text().catch(() => '')); return { error: 'Erreur lors du lancement de l’analyse.' } }
  } catch (e) { console.error('[triggerCounterDoc] trigger', e); return { error: 'Erreur lors du lancement de l’analyse.' } }
  return { ok: true }
}
