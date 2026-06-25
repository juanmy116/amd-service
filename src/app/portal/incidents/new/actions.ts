'use server'

import { createClient } from '@/lib/supabase/server'
import { INCIDENT_CATEGORIES, INCIDENT_PRIORITIES, parseEnum } from '@/lib/enums'
import { createIncidentPhotoUploadUrl, incidentPhotoExists, type PrepareUploadResult } from '@/lib/incidentPhotoUpload'
import { redirect } from 'next/navigation'

type FormState = { error: string } | null

// Paso previo (opcional): el navegador pide una URL firmada para subir la foto DIRECTO a
// Storage, sin pasar por la Server Action (Vercel topa el body a 4,5 MB). Ruta namespaced por
// usuario (`incidents/<user.id>/…`) para que dos clientes con la misma imagen no colisionen.
export async function prepareIncidentPhotoUploadAction(
  hash: string,
  type: string,
  size: number,
): Promise<PrepareUploadResult> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Session expirée.' }

  return createIncidentPhotoUploadUrl(user.id, hash, type, size)
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
  // Exigimos que la ruta esté namespaced bajo el propio usuario (`incidents/<user.id>/…`) —
  // la RLS de incident_photos no valida storage_path, así que sin esto un cliente podría asociar
  // a su incidencia la foto de otro (IDOR) — y que el objeto exista (evita filas rotas si el cron
  // de huérfanas lo borró). Si falla, NO bloqueamos: la incidencia ya está creada.
  const photoPath = ((formData.get('photo_path') as string) ?? '').trim()
  if (photoPath.startsWith(`incidents/${user!.id}/`) && await incidentPhotoExists(photoPath)) {
    const { error: photoErr } = await supabase.from('incident_photos').insert({
      incident_id: incident.id,
      uploaded_by: user!.id,
      storage_path: photoPath,
    })
    if (photoErr) console.error('[createPortalIncident] photo', photoErr)
  }

  redirect('/portal/incidents')
}
