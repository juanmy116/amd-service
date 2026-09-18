/**
 * Verrou de résolution: las reglas para dar una avería por RESUELTA.
 *
 * Lógica pura, sin Supabase, para poder probarla con vitest (mismo patrón que
 * `csat.ts` / `csat.server.ts`).
 *
 * Existe un único sitio con estas reglas porque hay CINCO puntos del código que
 * escriben `status = 'résolu'` (el formulario del técnico, los dos kanbans, la ficha
 * del kiosko y la ficha de admin). El proyecto ya pagó el precio de duplicarlas: el
 * envío del CSAT se implementó en dos de las tres puertas de entonces y se olvidó en
 * la tercera — ver el comentario en `admin/incidents/[id]/actions.ts`. Cada puerta
 * llama aquí; ninguna decide por su cuenta.
 *
 * Plan: docs/plan-cierre-averias-2026-09-18.md
 */

import type { ResolutionReason, ResolvedVia } from './enums'

/**
 * Mínimo de la explicación de oficina.
 *
 * No busca calidad literaria: busca que «ok» no cuele. Pedir un párrafo solo
 * conseguiría que rellenen «aaaaaaaa» — la barrera real contra el atajo es que el
 * motivo quede registrado y que la avería salga marcada como resuelta en oficina.
 */
export const MIN_NOTE_LENGTH = 10

/** Lo que aporta cada vía para resolver. */
export type ResolutionInput =
  /** El técnico, con la máquina delante: describe lo que hizo. */
  | { via: 'intervention'; rapport: string | null | undefined }
  /**
   * Oficina (tablero o ficha): no hubo intervención registrada, así que hace falta
   * decir por qué. `technicianId` permite acreditar al técnico que sí fue pero no lo
   * apuntó, para que su trabajo cuente en sus estadísticas.
   */
  | {
      via: 'bureau'
      reason: ResolutionReason | null
      note: string | null | undefined
      technicianId?: string | null
    }

/** Columnas de `incidents` que escribe una resolución. */
export type ResolutionFields = {
  resolved_via: ResolvedVia
  resolution_reason: ResolutionReason | null
  resolution_note: string
  rapport_intervention?: string
  assigned_to?: string
}

export type ResolutionResult =
  | { ok: true; fields: ResolutionFields }
  | { ok: false; error: string }

/**
 * Valida una transición a `résolu` y devuelve las columnas a escribir.
 *
 * Los mensajes de error van tal cual a la interfaz, de ahí que estén en francés.
 */
export function buildResolution(input: ResolutionInput): ResolutionResult {
  if (input.via === 'intervention') {
    const rapport = input.rapport?.trim()
    if (!rapport) {
      return { ok: false, error: "Le rapport d'intervention est obligatoire pour résoudre." }
    }
    return {
      ok: true,
      fields: {
        resolved_via: 'intervention',
        // El motivo es exclusivo de la vía «bureau» (lo exige un CHECK en la BD): quien
        // interviene describe lo que hizo, no elige de una lista.
        resolution_reason: null,
        resolution_note: rapport,
        rapport_intervention: rapport,
      },
    }
  }

  if (!input.reason) {
    return { ok: false, error: 'Le motif est obligatoire pour résoudre sans intervention.' }
  }

  const note = input.note?.trim()
  if (!note) {
    return { ok: false, error: "L'explication est obligatoire." }
  }
  if (note.length < MIN_NOTE_LENGTH) {
    return { ok: false, error: `L'explication doit faire au moins ${MIN_NOTE_LENGTH} caractères.` }
  }

  const fields: ResolutionFields = {
    resolved_via: 'bureau',
    resolution_reason: input.reason,
    resolution_note: note,
  }
  // Acreditar al técnico que intervino sin registrarlo: sin esto su trabajo no
  // aparece en el recuento por técnico del panel de admin.
  if (input.technicianId) fields.assigned_to = input.technicianId

  return { ok: true, fields }
}

/**
 * Estados en los que la avería está ABIERTA. Volver a uno de ellos es reabrirla.
 *
 * `fermé` no está aquí a propósito: cerrar es el final normal del camino y conserva el
 * rastro, que es justamente el archivo de lo que pasó.
 */
const OPEN_STATUSES: readonly string[] = ['nouveau', 'assigné', 'en_cours']

/**
 * ¿Este cambio de estado REABRE la avería?
 *
 * Hacen falta los dos estados, no solo el nuevo: guardar una avería que ya estaba `en_cours`
 * como `en_cours` no es reabrirla, y tratarlo como tal borraría el escaneo que el técnico
 * acaba de hacer. Solo cuenta venir de `résolu` o de `fermé`.
 */
export function reopens(oldStatus: string, newStatus: string): boolean {
  return OPEN_STATUSES.includes(newStatus) && !OPEN_STATUSES.includes(oldStatus)
}

/**
 * Columnas a escribir cuando una avería se REABRE.
 *
 * Sin esto la segunda resolución heredaría el rastro de la primera: informe viejo, vía
 * vieja y escaneo viejo, y la marca diría «intervención» aunque la segunda vez nadie
 * fuese — exactamente el blanqueo que el verrou pretende impedir. El escaneo también se
 * borra: haber tenido la máquina delante en marzo no prueba nada sobre la visita de mayo.
 *
 * `resolved_at` sí se conserva: hay recuentos que lo usan (`atelier/data.ts`).
 */
export function clearResolution(): {
  resolved_via: null
  resolution_reason: null
  resolution_note: null
  qr_verified: false
  qr_scanned_by: null
} {
  return {
    resolved_via: null,
    resolution_reason: null,
    resolution_note: null,
    qr_verified: false,
    qr_scanned_by: null,
  }
}
