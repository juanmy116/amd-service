// src/lib/incidentPhotos.ts
//
// Lógica pura (sin I/O) de validación de la foto que el cliente adjunta al abrir una
// incidencia SAV. Solo imágenes (sin PDF). Se aísla aquí para testearla sin tocar Supabase.
// Reutiliza sha256Hex/extensionForType de counterUpload (son genéricos).

export { sha256Hex, extensionForType } from './counterUpload'

/** Tipos admitidos: solo imágenes (la foto se hace con el móvil o se sube desde el equipo). */
export const ALLOWED_PHOTO_TYPES = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
])

/** Tope de tamaño. La subida va DIRECTA a Storage (no toca el límite de 4,5 MB de Vercel). */
export const MAX_PHOTO_BYTES = 10 * 1024 * 1024

export type PhotoValidationError = 'type' | 'empty' | 'too_large'

export type PhotoValidation =
  | { ok: true }
  | { ok: false; error: PhotoValidationError }

/** Mensajes (FR) por código de validación. Compartidos por el cliente (PhotoUpload)
 *  y el servidor (Server Action) para no divergir. */
export const PHOTO_ERROR_MESSAGES: Record<PhotoValidationError, string> = {
  type: 'Format non supporté. Utilisez une image (JPG, PNG ou WEBP).',
  empty: 'Fichier vide.',
  too_large: 'Image trop volumineuse (max 10 Mo).',
}

/** El hash que el cliente envía nombra el objeto en el bucket. Validar que sea un SHA-256 hex
 *  (64 chars) evita path traversal (`../`) en la ruta de subida. */
export function isSha256Hex(s: string): boolean {
  return /^[0-9a-f]{64}$/.test(s)
}

/** Formas de ruta que ha generado el servidor al preparar la subida (createIncidentPhotoUploadUrl):
 *  `incidents/<user.id>/<año>/<mes>/<sha256>.<ext>` (portal) e `incidents/public/<uuid>/…` (QR),
 *  más las dos del primer día, sin UUID (`incidents/<año>/…` e `incidents/public/<año>/…`). */
const INCIDENT_PHOTO_PATH =
  /^incidents\/(?:public\/)?(?:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\/)?\d{4}\/\d{2}\/[0-9a-f]{64}\.(?:jpeg|png|webp)$/

/** `storage_path` sale de una fila de incident_photos, que el cliente puede escribir: antes de
 *  firmarlo con service_role hay que comprobar que tiene una de las formas de arriba. Así nunca
 *  se firma una ruta con `../`, `?`, `#` o `%` que saque la petición de firma del bucket. */
export function isIncidentPhotoPath(path: string): boolean {
  return INCIDENT_PHOTO_PATH.test(path)
}

/** ¿Es `path` EXACTAMENTE la ruta que createIncidentPhotoUploadUrl genera para `prefix`
 *  (`incidents/<prefix>/<año>/<mes>/<sha256>.<ext>`)? Un simple startsWith del prefijo dejaba
 *  pasar `incidents/<prefix>/../../…`. */
export function isIncidentPhotoPathFor(prefix: string, path: string): boolean {
  const base = `incidents/${prefix}/`
  return path.startsWith(base)
    && /^\d{4}\/\d{2}\/[0-9a-f]{64}\.(?:jpeg|png|webp)$/.test(path.slice(base.length))
}

/** Valida tipo MIME y tamaño de la foto antes de subirla. */
export function validateIncidentPhoto(file: { type: string; size: number }): PhotoValidation {
  if (!ALLOWED_PHOTO_TYPES.has(file.type)) return { ok: false, error: 'type' }
  if (file.size <= 0) return { ok: false, error: 'empty' }
  if (file.size > MAX_PHOTO_BYTES) return { ok: false, error: 'too_large' }
  return { ok: true }
}
