/**
 * Validación del email del formulario público del QR.
 *
 * El email es OBLIGATORIO desde 2026-09-17: es el único destinatario posible de la encuesta de
 * satisfacción para una avería abierta por QR (esas incidencias no tienen cuenta de portal
 * detrás). Decisión y riesgo asumido en
 * `docs/superpowers/specs/2026-09-17-csat-qr-et-avis-clients-design.md`.
 *
 * Devuelve el mensaje de error en francés, o null si el email es válido.
 */
export function validateContactEmail(email: string): string | null {
  const value = email.trim()
  if (!value) return "L'adresse email est obligatoire."
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) return "L'adresse email n'est pas valide."
  return null
}
