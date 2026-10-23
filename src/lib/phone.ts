/** Prefijo de Senegal con el que arrancan las casillas de teléfono del cliente. */
export const SENEGAL_PREFIX = '+221 '

/**
 * Limpia un teléfono del formulario del cliente: deja cifras, espacios y `+-().` (mismo criterio
 * que el formulario público del QR) y lo corta a 30 caracteres. Un `+221` solo —el prefijo que la
 * casilla trae escrito y nadie completó— cuenta como vacío: devuelve null.
 */
export function normalizeClientPhone(raw: FormDataEntryValue | null): string | null {
  if (typeof raw !== 'string') return null
  const clean = raw.replace(/[^\d\s+\-().]/g, '').replace(/\s+/g, ' ').trim().slice(0, 30)
  const digits = clean.replace(/\D/g, '').replace(/^(00)?221/, '')
  return digits === '' ? null : clean
}
