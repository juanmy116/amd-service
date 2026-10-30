/**
 * Averías creadas por el personal de AMD fuera de `/admin`: el técnico con permiso desde la ficha
 * de máquina del escáner, y el kiosko del taller desde la burbuja «+» (tanda 6 del pulido,
 * `docs/superpowers/plans/2026-10-29-tecnicos-atelier-crean-averias.md`).
 *
 * Aquí va solo lo puro (títulos, motivos, validación), testeado con vitest. La inserción vive en
 * `staffIncident.server.ts`.
 */

/** Lo que se puede crear desde el kiosko. El técnico de campo solo crea `panne`. */
export const STAFF_INCIDENT_KINDS = ['panne', 'recuperation'] as const
export type StaffIncidentKind = typeof STAFF_INCIDENT_KINDS[number]

/**
 * Para qué se recoge la máquina. No tiene columna propia: va en el título, que es lo que ven el
 * kiosko, el Kanban y el técnico. La recogida NO saca la máquina del contrato (eso sigue siendo
 * «Remplacer» / «Hors service» en su ficha).
 */
export const PICKUP_REASONS = ['atelier', 'fin_contrat', 'remplacement'] as const
export type PickupReason = typeof PICKUP_REASONS[number]

export const PICKUP_REASON_LABEL: Record<PickupReason, string> = {
  atelier:      "Réparation à l'atelier",
  fin_contrat:  'Fin de contrat',
  remplacement: 'Remplacement',
}

export const STAFF_DESCRIPTION_MAX = 1000

type MachineLabel = { marque: string; modele: string; numero_serie: string }

export function staffIncidentTitle(
  kind: StaffIncidentKind,
  machine: MachineLabel,
  reason: PickupReason | null,
): string {
  const label = `${machine.marque} ${machine.modele} (${machine.numero_serie})`
  if (kind === 'recuperation' && reason) {
    return `Récupération (${PICKUP_REASON_LABEL[reason]}) — ${label}`
  }
  return `Panne — ${label}`
}

/** Recorta y limpia el texto libre. Conserva los saltos de línea (es un textarea). */
export function cleanStaffDescription(raw: unknown): string {
  if (typeof raw !== 'string') return ''
  return raw
    .slice(0, STAFF_DESCRIPTION_MAX * 2)
    .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '')
    .trim()
    .slice(0, STAFF_DESCRIPTION_MAX)
}

/**
 * Comprueba lo que llega del navegador. Devuelve el mensaje de error en francés, o null.
 * La panne exige una descripción (es lo único que el técnico tendrá para ir preparado); la
 * recogida exige el motivo y la descripción es opcional.
 */
export function validateStaffIncident(input: {
  kind: StaffIncidentKind
  reason: PickupReason | null
  description: string
}): string | null {
  if (input.kind === 'recuperation') {
    if (!input.reason) return 'Choisissez le motif de la récupération.'
    return null
  }
  if (!input.description) return 'Décrivez la panne.'
  return null
}
