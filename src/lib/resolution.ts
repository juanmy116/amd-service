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

import type { IncidentStatus, ResolutionReason, ResolvedVia } from './enums'

/**
 * Lo que la oficina tiene que aportar para cerrar una avería sin intervención registrada.
 *
 * Viaja del navegador a la Server Action, así que allí se vuelve a validar: aquí es solo
 * la forma del dato.
 */
export type OfficeResolution = {
  reason: ResolutionReason
  note: string
  /** Técnico que sí fue pero no lo registró, para que su trabajo cuente. */
  technicianId: string | null
}

/**
 * Motivos, en el idioma de la interfaz. Se muestran en el desplegable de la ventana y, desde
 * el PR-3, en el listado de averías.
 *
 * El desplegable es la mitad del valor de la ventana: un clic, sin teclear —que en la TV del
 * taller es la diferencia entre que se use y que no— y, de paso, la estadística que hoy no
 * existe («¿cuántas de las que cerramos en oficina son falsas alarmas de Princity?»).
 */
export const RESOLUTION_REASON_LABELS: Record<ResolutionReason, string> = {
  fausse_alerte:             'Fausse alerte (Princity)',
  telephone:                 'Résolu par téléphone',
  client:                    'Résolu par le client',
  technicien_non_enregistre: 'Un technicien est passé sans le saisir',
  doublon:                   'Doublon d\'une autre panne',
  autre:                     'Autre',
}

/**
 * Cómo se llama cada vía en la interfaz.
 *
 * La pareja intervención/oficina es la que da sentido a todo el verrou: sin ella el listado
 * vuelve a mostrar un «Résolu» que no distingue entre «un técnico fue» y «alguien limpió el
 * tablero».
 */
export const RESOLVED_VIA_LABELS: Record<ResolvedVia, string> = {
  intervention: 'Intervention',
  bureau:       'Bureau',
}

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
 * Estado en el que termina una resolución de OFICINA.
 *
 * Quien cierra una avería resuelta es el envío de la encuesta (`csat.server.ts`). Como en una
 * resolución de oficina no hay encuesta que mandar, dejarla en `résolu` la condenaría a una
 * sala de espera de la que nadie la sacaría nunca: el listado se llenaría de resueltas
 * eternas. Se archiva en el acto.
 */
export const OFFICE_RESOLUTION_STATUS = 'fermé' as const

/**
 * ¿Se le manda la encuesta de satisfacción al cliente por esta resolución?
 *
 * Solo por una intervención de verdad. Preguntar «¿qué tal le atendió el técnico?» por una
 * avería que se cerró por teléfono, o porque era una falsa alarma de Princity, es pedirle al
 * cliente que puntúe una visita que nunca ocurrió.
 *
 * `null` (histórico anterior al verrou, o una puerta futura que se olvide de marcar) tampoco
 * recibe encuesta: sin saber qué pasó, no se molesta al cliente.
 */
export function sendsSurvey(resolvedVia: string | null | undefined): boolean {
  return resolvedVia === 'intervention'
}

/**
 * Estado que se escribe de verdad cuando alguien pide «Résolu».
 *
 * `résolu` es una sala de espera: de ella solo saca el envío de la encuesta
 * (`csat.server.ts`), que cierra la avería al terminar. Si por esa resolución no va a salir
 * ninguna encuesta, dejarla ahí la condena a quedarse para siempre — que es justo lo que el
 * PR-3 vino a eliminar, y volvía por la puerta de atrás en cuanto alguien arrastraba otra vez
 * a «Résolu» una avería ya archivada desde la oficina.
 *
 * Solo aplica a transiciones reales: guardar una avería sin tocarle el estado no la archiva.
 */
export function finalResolutionStatus(
  requestedStatus: IncidentStatus,
  resolvedViaAfter: string | null,
): IncidentStatus {
  if (requestedStatus !== 'résolu') return requestedStatus
  return sendsSurvey(resolvedViaAfter) ? 'résolu' : OFFICE_RESOLUTION_STATUS
}

/**
 * Estados en los que la avería está ABIERTA. Volver a uno de ellos es reabrirla.
 *
 * `fermé` no está aquí a propósito: cerrar es el final normal del camino y conserva el
 * rastro, que es justamente el archivo de lo que pasó.
 */
const OPEN_STATUSES: readonly string[] = ['nouveau', 'assigné', 'en_cours']

/** ¿La avería está en circulación (ni resuelta ni cerrada)? */
export function isOpenStatus(status: string): boolean {
  return OPEN_STATUSES.includes(status)
}

/**
 * ¿Este cambio de estado necesita que la oficina explique por qué?
 *
 * Una regla, usada por las cuatro puertas y por la interfaz, para que la ventana aparezca
 * exactamente cuando el servidor va a pedir datos. Que las dos usen esta misma función es el
 * punto entero: cuando la pantalla y el servidor opinaban por separado, salía un formulario
 * obligatorio sin campos donde escribir.
 *
 * Se pide justificación al **cerrar algo que estaba abierto**, y solo entonces:
 *
 * - `existingVia` no nulo ⇒ no se pide nada y **no se pisa**. Arrastrar de «Fermé» a «Résolu»
 *   una avería que un técnico resolvió de verdad no puede convertir su informe en una
 *   resolución de oficina.
 * - La avería tiene que venir de un estado **abierto**. Una ya resuelta o cerrada no se
 *   resuelve otra vez: corregirle el título, o archivar una resuelta, es mantenimiento del
 *   registro, no una resolución. Exigir ahí un motivo dejaba sin salida a quien solo quería
 *   arreglar una errata.
 * - Viniendo de abierta, `fermé` cuenta igual que `résolu`: archivar sin pasar por resuelto es
 *   la misma desaparición. Si no se pidiera, «Fermé» sería el atajo *barato* justo porque
 *   «Résolu» hace preguntas.
 */
export function requiresOfficeResolution(
  oldStatus: string,
  newStatus: string,
  existingVia: string | null,
): boolean {
  if (existingVia !== null) return false
  if (!isOpenStatus(oldStatus)) return false
  return newStatus === 'résolu' || newStatus === 'fermé'
}

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
 * **`rapport_intervention` también.** Era el hueco por el que se colaba todo lo demás: el
 * formulario del técnico rellena ese campo con lo que ya hubiera, así que una avería
 * reabierta en mayo se cerraba con el informe de marzo sin escribir una línea, y ni la
 * aplicación ni el candado de la BD podían notarlo — el texto estaba ahí. No se pierde: la
 * puerta que reabre lo archiva antes en `incident_history` (ver `archivedReportNote`).
 *
 * `resolved_at` sí se conserva: hay recuentos que lo usan (`atelier/data.ts`).
 */
export function clearResolution(): {
  resolved_via: null
  resolution_reason: null
  resolution_note: null
  rapport_intervention: null
  qr_verified: false
  qr_scanned_by: null
} {
  return {
    resolved_via: null,
    resolution_reason: null,
    resolution_note: null,
    rapport_intervention: null,
    qr_verified: false,
    qr_scanned_by: null,
  }
}

/**
 * Junta en una línea de historial todo lo que hay que contar de un cambio de estado.
 *
 * Existe porque el `??` que había antes elegía **uno**: si quien reabría escribía un
 * comentario, la nota con el informe archivado se descartaba y el informe del técnico no
 * quedaba en ninguna parte — ni en la avería, que acababa de borrarlo, ni en el historial.
 * Todo lo que llega aquí se conserva.
 */
export function historyComment(...notes: Array<string | null | undefined>): string | null {
  const kept = notes.map((n) => n?.trim()).filter((n): n is string => !!n)
  return kept.length > 0 ? kept.join('\n\n') : null
}

/**
 * Línea de historial que guarda el informe de la resolución anterior antes de borrarlo.
 *
 * Reabrir limpia el informe para que la próxima resolución traiga el suyo, pero lo que un
 * técnico escribió sobre una visita real no se tira: queda fechado en el historial de la
 * avería, que es donde se mira cuando un cliente reclama.
 */
export function archivedReportNote(previousReport: string | null | undefined): string | null {
  const report = previousReport?.trim()
  return report ? `Rapport de la résolution précédente : ${report}` : null
}
