/**
 * Encuesta de satisfacción (CSAT): decisión de a quién se le envía.
 *
 * Lógica pura, separada de `csat.server.ts` a propósito: así se puede probar sin Supabase
 * (mismo patrón que `quartiers.ts` / `quartiers.server.ts`).
 */

export type CsatRecipient = { email: string; source: 'contact' | 'portal' } | null

/**
 * Elige a quién se le envía la encuesta.
 *
 * El email del formulario público va PRIMERO a propósito: es quien reportó la avería y quien
 * vivió la intervención. La cuenta del portal queda como respaldo para las incidencias internas.
 */
export function resolveCsatRecipient(
  contactEmail: string | null | undefined,
  portalEmail: string | null | undefined,
): CsatRecipient {
  const contact = contactEmail?.trim()
  if (contact) return { email: contact, source: 'contact' }

  const portal = portalEmail?.trim()
  if (portal) return { email: portal, source: 'portal' }

  return null
}

/** Días que el email promete al cliente («Ce lien est valable 7 jours») y que aplica la BD por defecto. */
export const CSAT_VALIDITY_DAYS = 7

/**
 * ¿Hay ya una encuesta enviada que el cliente todavía puede responder?
 *
 * Si la respuesta es «sí», reenviar sobra: duplicaría el email y pisaría `sent_to`/`sent_at`.
 * Si es «no» (nunca se envió, o el enlace ya caducó) hay que enviar y refrescar la caducidad:
 * mandar un token vencido cuenta la encuesta como enviada y el cliente solo ve «Ce lien a expiré».
 *
 * Una fecha ausente o ilegible se trata como NO vigente a propósito: es el lado seguro
 * (a lo sumo se reenvía de más, nunca se da por buena una encuesta que nadie puede responder).
 */
export function isSurveyStillValid(
  sentAt: string | null | undefined,
  expiresAt: string | null | undefined,
  now: Date = new Date(),
): boolean {
  if (!sentAt || !expiresAt) return false

  const expires = new Date(expiresAt).getTime()
  if (Number.isNaN(expires)) return false

  return expires > now.getTime()
}

/** Fecha de caducidad de un enlace que sale AHORA: `now` + 7 días, en ISO para Supabase. */
export function csatExpiresAt(now: Date = new Date()): string {
  const expires = new Date(now)
  expires.setDate(expires.getDate() + CSAT_VALIDITY_DAYS)
  return expires.toISOString()
}
