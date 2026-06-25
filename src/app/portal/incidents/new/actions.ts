'use server'

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { INCIDENT_CATEGORIES, INCIDENT_PRIORITIES, parseEnum } from '@/lib/enums'
import { validateIncidentPhoto, extensionForType, PHOTO_ERROR_MESSAGES } from '@/lib/incidentPhotos'
import { redirect } from 'next/navigation'

type FormState = { error: string } | null

// Paso previo (opcional): el navegador pide una URL firmada para subir la foto DIRECTO a
// Storage, sin pasar por la Server Action (Vercel topa el body a 4,5 MB). Devuelve la ruta
// determinista por hash + el token de subida. Mismo patrón que prepareCounterUploadAction.
type PrepareState = { ok: true; path: string; token: string } | { error: string }

export async function prepareIncidentPhotoUploadAction(
  hash: string,
  type: string,
  size: number,
): Promise<PrepareState> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Session expirée.' }

  const valid = validateIncidentPhoto({ type, size })
  if (!valid.ok) return { error: PHOTO_ERROR_MESSAGES[valid.error] }

  const ext = extensionForType(type)
  const now = new Date()
  // Ruta determinista por hash: el MISMO fichero → la MISMA ruta.
  const path = `incidents/${now.getUTCFullYear()}/${String(now.getUTCMonth() + 1).padStart(2, '0')}/${hash}.${ext}`

  const admin = createAdminClient()
  const { data, error } = await admin.storage
    .from('incident-photos')
    .createSignedUploadUrl(path, { upsert: true })
  if (error || !data) {
    console.error('[prepareIncidentPhotoUpload]', error)
    return { error: "Erreur lors de la préparation de l'envoi." }
  }
  return { ok: true, path, token: data.token }
}

export async function createPortalIncidentAction(
  _prev: FormState,
  formData: FormData
): Promise<FormState> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const title = ((formData.get('title') as string) ?? '').trim()
  const contract_machine_id = ((formData.get('contract_machine_id') as string) ?? '').trim()

  if (!title) return { error: 'Le titre est obligatoire.' }
  if (!contract_machine_id) return { error: 'Veuillez sélectionner une machine.' }

  const category = parseEnum(formData.get('category'), INCIDENT_CATEGORIES)
  const priority = parseEnum(formData.get('priority'), INCIDENT_PRIORITIES)
  if (!category) return { error: 'Catégorie invalide.' }
  if (!priority) return { error: 'Priorité invalide.' }

  // La RLS bloquea SELECT sobre líneas no propias → si no encuentra, error claro
  const { data: line } = await supabase
    .from('contract_machines')
    .select('id')
    .eq('id', contract_machine_id)
    .maybeSingle()

  if (!line) return { error: "Cette machine n'est pas accessible." }

  const { data: incident, error } = await supabase.from('incidents').insert({
    contract_machine_id,
    machine_id: null,
    source: null,                     // incidencia interna
    title,
    description: ((formData.get('description') as string) ?? '').trim() || null,
    category,
    priority,
    status: 'nouveau',
    opened_by: user!.id,
  } as any).select('id').single()

  if (error || !incident) {
    console.error('[createPortalIncident]', error)
    return { error: 'Une erreur est survenue. Veuillez réessayer.' }
  }

  // Foto adjunta (opcional): el navegador ya la subió a Storage y nos pasa su ruta.
  // Si falla la asociación, NO bloqueamos: la incidencia ya está creada.
  const photoPath = ((formData.get('photo_path') as string) ?? '').trim()
  if (photoPath) {
    const { error: photoErr } = await supabase.from('incident_photos').insert({
      incident_id: incident.id,
      uploaded_by: user!.id,
      storage_path: photoPath,
    })
    if (photoErr) console.error('[createPortalIncident] photo', photoErr)
  }

  redirect('/portal/incidents')
}
