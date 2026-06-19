'use server'
import { requireAdmin } from '@/lib/auth'
import { createAdminClient } from '@/lib/supabase/admin'
import { revalidatePath } from 'next/cache'
import {
  validateCounterUpload, extensionForType, sha256Hex, buildImagePath,
} from '@/lib/counterUpload'

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

// Subida MANUAL de una foto/PDF de contador desde la app. Resuelve el tope de 512KB de
// CloudMailin (free): el archivo va directo al bucket (hasta 10MB) y desemboca en la MISMA
// cola y el MISMO OCR que el email. Reutiliza la dedup por hash (register_counter_duplicate)
// para que reenviar/resubir el mismo fichero no se procese dos veces.
export async function uploadCounterImageAction(_p: UploadState, fd: FormData): Promise<UploadState> {
  const { user } = await requireAdmin()
  const file = fd.get('file')
  if (!(file instanceof File)) return { error: 'Aucun fichier.' }

  const valid = validateCounterUpload({ type: file.type, size: file.size })
  if (!valid.ok) {
    const map = {
      type: 'Format non supporté. Utilisez JPG, PNG, WEBP ou PDF.',
      empty: 'Fichier vide.',
      too_large: 'Fichier trop volumineux (max 10 Mo).',
    } as const
    return { error: map[valid.error] }
  }

  const bytes = new Uint8Array(await file.arrayBuffer())
  const hash = await sha256Hex(bytes)
  const admin = createAdminClient()

  // Dedup: si el hash ya existe, incrementa el contador en la fila original y avisa (no reprocesa).
  const { data: dup } = await admin.rpc('register_counter_duplicate', { p_hash: hash })
  if (dup) return { duplicate: true }

  const ext = extensionForType(file.type)
  const now = new Date()
  const path = buildImagePath(hash, ext, now.getUTCFullYear(), now.getUTCMonth() + 1)

  // Insertar la fila ANTES de subir, para no dejar objetos huérfanos si el insert falla.
  // El UNIQUE(image_hash_sha256) cierra cualquier carrera con un email idéntico simultáneo.
  const { data: pending, error: insErr } = await admin.from('pending_counter_imports').insert({
    image_path: path, image_size_bytes: bytes.length, image_hash_sha256: hash,
    source: 'manual', email_from: user.email ?? null, email_subject: 'Import manuel',
  }).select('id').single()
  if (insErr) { console.error('[uploadCounter] insert', insErr); return { error: 'Erreur lors de l’enregistrement.' } }

  const up = await admin.storage.from('counter-images').upload(path, bytes, { contentType: file.type, upsert: true })
  if (up.error) {
    // Si la subida falla, la fila quedaría reservando el hash → un reintento del MISMO fichero
    // chocaría con la dedup y nunca se procesaría. Liberamos la fila y pedimos reintentar.
    console.error('[uploadCounter] upload', up.error)
    await admin.from('pending_counter_imports').delete().eq('id', pending.id)
    return { error: 'Erreur lors de l’envoi du fichier. Réessayez.' }
  }

  // Disparar el OCR y ESPERARLO, con LÍMITE DE TIEMPO (AbortController) para que NUNCA se cuelgue:
  // si Claude tarda demasiado o la conexión se queda pendiente, abortamos en vez de esperar para
  // siempre (eso era lo que paraba el lote entero). El cliente sube de 1 en 1 y espaciado, así no
  // saturamos el servicio de IA. 2 intentos: cubren un 500/timeout transitorio sin pasarnos de
  // maxDuration (page.tsx = 60s).
  const ocrUrl = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/parse-counter-image`
  const ocrHeaders = { 'Content-Type': 'application/json', Authorization: `Bearer ${process.env.SUPABASE_SECRET_KEY}` }
  const ocrBody = JSON.stringify({ pending_id: pending.id, image_path: path, content_type: file.type })
  const OCR_TIMEOUT_MS = 25000
  for (let attempt = 1; attempt <= 2; attempt++) {
    const ctrl = new AbortController()
    const timer = setTimeout(() => ctrl.abort(), OCR_TIMEOUT_MS)
    try {
      const res = await fetch(ocrUrl, { method: 'POST', headers: ocrHeaders, body: ocrBody, signal: ctrl.signal })
      if (res.ok) { clearTimeout(timer); break }
      console.error('[uploadCounter] OCR status', res.status, 'attempt', attempt)
    } catch (e) { console.error('[uploadCounter] OCR fetch', e, 'attempt', attempt) }
    finally { clearTimeout(timer) }
    if (attempt < 2) await new Promise(r => setTimeout(r, 1500))
  }
  // La fila ya está encolada: devolvemos ok aunque el OCR no haya corrido (quedaría en rojo, visible
  // para revisión). NO devolvemos error para no provocar un reintento que choque con la dedup (doublon).
  return { ok: true }
}
