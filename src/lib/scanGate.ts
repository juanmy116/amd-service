/**
 * Regla del doble escaneo: el técnico escanea el QR de la máquina al empezar y otra vez al
 * terminar; solo entonces puede cerrar la avería.
 *
 * Lógica pura, sin `server-only` a propósito: la usan tanto el servidor (para rechazar el
 * cierre) como el cliente (para habilitar el botón), y así las dos lecturas no pueden divergir.
 */

/** Cuánto tiempo, desde el último escaneo, sigue abierta la posibilidad de cerrar. */
export const CLOSE_SCAN_WINDOW_MINUTES = 60

/** Escaneos del mismo técnico en la misma avería dentro de este margen cuentan como uno (rebote del lector). */
export const SCAN_DEDUPE_SECONDS = 60

/**
 * Textos que el técnico ve cuando el servidor rechaza empezar o cerrar. Son los mismos, letra por
 * letra, que lanza el trigger `guard_tech_scan_required()` (20261021110000): la ficha compara el
 * error recibido con `CLOSE_SCAN_ERROR` para saber que el cierre se rechazó por el escaneo.
 */
export const START_SCAN_ERROR = 'Scannez le QR de la machine pour démarrer l\'intervention.'
export const CLOSE_SCAN_ERROR = 'Scannez à nouveau le QR de la machine pour clôturer (valable 1 heure).'

/**
 * Por qué el cierre está bloqueado (null si se puede cerrar), para que la ficha diga al técnico
 * qué le falta en vez de un candado mudo:
 * - `no_scans`: ningún escaneo en este ciclo;
 * - `one_scan`: solo el de empezar;
 * - `too_close`: dos o más, pero a menos de SCAN_DEDUPE_SECONDS entre el primero y el último;
 * - `expired`: el último escaneo pasó la ventana de CLOSE_SCAN_WINDOW_MINUTES.
 */
export type CloseBlockReason = 'no_scans' | 'one_scan' | 'too_close' | 'expired'

export type CloseGate = {
  canClose: boolean
  closeUntil: Date | null
  reason: CloseBlockReason | null
  /** Primer escaneo del ciclo (null sin escaneos), para decir «1er scan enregistré à…». */
  firstScanAt: Date | null
  /**
   * Desde cuándo un nuevo escaneo sirve para cerrar (`one_scan`/`too_close`; null en los demás).
   * Es el ÚLTIMO escaneo + SCAN_DEDUPE_SECONDS, no el primero: antes de eso el escaneo nuevo se
   * descarta como rebote al grabarlo (se compara con el último), y no dejaría fila.
   */
  nextScanAfter: Date | null
}

/**
 * Decide si la avería se puede cerrar.
 *
 * Solo cuentan los escaneos posteriores a `resolvedAt`: si la avería se reabrió, el ciclo
 * anterior ya está gastado y hay que volver a escanear (empezar + terminar). Hacen falta dos
 * escaneos y que el más reciente no tenga más de la ventana, para que un escaneo viejo
 * no sirva de pase libre horas después.
 *
 * Además, el primero y el último del ciclo deben distar al menos SCAN_DEDUPE_SECONDS. El
 * descarte de rebotes al grabar (leer y luego insertar) no es atómico: si el lector dispara dos
 * veces a la vez, pueden colarse dos filas con milésimas de diferencia, y eso no es «empezar» y
 * «terminar», es un solo escaneo. Con este mínimo, una doble lectura nunca abre el cierre.
 */
export function closeGate(scans: Date[], resolvedAt: Date | null, now: Date = new Date()): CloseGate {
  const cycle = resolvedAt ? scans.filter((s) => s.getTime() > resolvedAt.getTime()) : scans
  const blocked = { canClose: false, closeUntil: null, nextScanAfter: null }
  if (cycle.length === 0) return { ...blocked, reason: 'no_scans', firstScanAt: null }

  // Sin asumir orden: la BD no lo garantiza y el llamador puede mezclar fuentes.
  const times = cycle.map((s) => s.getTime())
  const last = Math.max(...times)
  const first = Math.min(...times)
  const firstScanAt = new Date(first)
  if (cycle.length < 2 || last - first < SCAN_DEDUPE_SECONDS * 1000) {
    return {
      ...blocked,
      reason: cycle.length < 2 ? 'one_scan' : 'too_close',
      firstScanAt,
      nextScanAfter: new Date(last + SCAN_DEDUPE_SECONDS * 1000),
    }
  }
  const closeUntil = new Date(last + CLOSE_SCAN_WINDOW_MINUTES * 60_000)
  const canClose = closeUntil.getTime() >= now.getTime()
  return { canClose, closeUntil, reason: canClose ? null : 'expired', firstScanAt, nextScanAfter: null }
}

/**
 * ¿Debe este perfil cumplir el doble escaneo? Solo el técnico de campo. El Atelier (técnico con
 * `is_dispatcher`) reparte trabajo desde el taller y no está delante de la máquina; el admin que
 * entra a la PWA tampoco. `is_dispatcher` null cuenta como «no dispatcher»: ante la duda, se exige.
 */
export function requiresScan(profile: { role: string; is_dispatcher: boolean | null }): boolean {
  return profile.role === 'technician' && profile.is_dispatcher !== true
}
