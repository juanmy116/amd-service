// src/lib/counterUpload.ts
//
// Lógica pura (sin I/O) de la subida MANUAL de fotos/PDF de contadores desde la app.
// Replica las mismas reglas que la Edge Function `receive-counter-email` (tipos
// admitidos, tamaño, hash de bytes y ruta en el bucket) para que la subida directa
// desemboque en EXACTAMENTE la misma cola que el email. Se aísla aquí para poder
// testearla sin tocar Supabase ni el runtime de servidor.

/** Tipos admitidos por el OCR (`parse-counter-image`): imágenes + PDF. */
export const ALLOWED_UPLOAD_TYPES = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'application/pdf',
])

/** Tope del bucket. Es el límite real; sube muy por encima de los 512KB de CloudMailin. */
export const MAX_UPLOAD_BYTES = 10 * 1024 * 1024

export type UploadValidation =
  | { ok: true }
  | { ok: false; error: 'type' | 'empty' | 'too_large' }

/** Valida tipo MIME y tamaño de un archivo antes de procesarlo. */
export function validateCounterUpload(file: { type: string; size: number }): UploadValidation {
  if (!ALLOWED_UPLOAD_TYPES.has(file.type)) return { ok: false, error: 'type' }
  if (file.size <= 0) return { ok: false, error: 'empty' }
  if (file.size > MAX_UPLOAD_BYTES) return { ok: false, error: 'too_large' }
  return { ok: true }
}

/** Extensión de fichero a partir del content-type: 'pdf' explícito; el resto = subtipo MIME
 *  (image/jpeg→'jpeg', image/png→'png'…). Solo afecta al nombre del objeto en el bucket. */
export function extensionForType(contentType: string): string {
  return contentType === 'application/pdf' ? 'pdf' : contentType.split('/')[1]
}

/** SHA-256 de los bytes, en hex. Misma huella que el email → la dedup funciona entre ambos canales. */
export async function sha256Hex(bytes: BufferSource): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', bytes)
  return Array.from(new Uint8Array(digest)).map(b => b.toString(16).padStart(2, '0')).join('')
}

/** Ruta en el bucket: `AAAA/MM/<hash>.<ext>` — idéntica al esquema del email. */
export function buildImagePath(hash: string, ext: string, year: number, month: number): string {
  const mo = String(month).padStart(2, '0')
  return `${year}/${mo}/${hash}.${ext}`
}
