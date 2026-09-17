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
