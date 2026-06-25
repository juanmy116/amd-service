import 'server-only'

import { createAdminClient } from '@/lib/supabase/admin'
import {
  validateIncidentPhoto, extensionForType, PHOTO_ERROR_MESSAGES, isSha256Hex,
} from './incidentPhotos'

// Lógica común a las dos Server Actions que preparan la subida de una foto de incidencia
// (portal autenticado y formulario público del QR): valida hash/tipo/tamaño, construye la ruta
// determinista y genera la URL firmada de subida. Cada action aporta solo su control de acceso
// (sesión vs. rate limit) y el `prefix` de la ruta (`<user.id>` o `public`).
// Vive aparte de incidentPhotos.ts (que es puro y lo importa el cliente) porque usa el admin client.

export type PrepareUploadResult = { ok: true; path: string; token: string } | { error: string }

export async function createIncidentPhotoUploadUrl(
  prefix: string, hash: string, type: string, size: number,
): Promise<PrepareUploadResult> {
  if (!isSha256Hex(hash)) return { error: 'Requête invalide.' }

  const valid = validateIncidentPhoto({ type, size })
  if (!valid.ok) return { error: PHOTO_ERROR_MESSAGES[valid.error] }

  const ext = extensionForType(type)
  const now = new Date()
  // Ruta determinista: `incidents/<prefix>/<año>/<mes>/<hash>.<ext>`.
  const path = `incidents/${prefix}/${now.getUTCFullYear()}/${String(now.getUTCMonth() + 1).padStart(2, '0')}/${hash}.${ext}`

  const admin = createAdminClient()
  const { data, error } = await admin.storage
    .from('incident-photos')
    .createSignedUploadUrl(path, { upsert: true })
  if (error || !data) {
    console.error('[incidentPhotoUpload]', error)
    return { error: "Erreur lors de la préparation de l'envoi." }
  }
  return { ok: true, path, token: data.token }
}

// ¿Existe el objeto en el bucket? Se usa antes de asociar una foto a una incidencia: evita
// crear una fila incident_photos que apunte a un objeto inexistente (p.ej. el cron de huérfanas
// lo borró tras 24 h con el formulario abandonado, o una ruta manipulada que nunca se subió).
export async function incidentPhotoExists(path: string): Promise<boolean> {
  try {
    const admin = createAdminClient()
    const { error } = await admin.storage.from('incident-photos').createSignedUrl(path, 60)
    return !error
  } catch (e) {
    // Un fallo transitorio (red) no debe romper el alta de la incidencia (que ya está creada):
    // ante la duda, no asociar la foto.
    console.error('[incidentPhotoExists]', e)
    return false
  }
}
