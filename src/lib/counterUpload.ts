// src/lib/counterUpload.ts
//
// Lógica pura (sin I/O) de validación de la subida MANUAL de documentos de contadores desde la app
// (tipos admitidos, tamaño, hash del documento). El documento entero lo procesa la Edge Function
// `parse-counter-document`. Se aísla aquí para testearla sin tocar Supabase ni el runtime de servidor.

/** Tipos admitidos: imágenes + PDF. */
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

/** SHA-256 de los bytes, en hex. Identifica el documento para nombrar el objeto en el bucket. */
export async function sha256Hex(bytes: BufferSource): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', bytes)
  return Array.from(new Uint8Array(digest)).map(b => b.toString(16).padStart(2, '0')).join('')
}
