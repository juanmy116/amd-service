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

export type CloseGate = { canClose: boolean; closeUntil: Date | null }

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
  if (cycle.length < 2) return { canClose: false, closeUntil: null }

  // Sin asumir orden: la BD no lo garantiza y el llamador puede mezclar fuentes.
  const times = cycle.map((s) => s.getTime())
  const last = Math.max(...times)
  const first = Math.min(...times)
  if (last - first < SCAN_DEDUPE_SECONDS * 1000) return { canClose: false, closeUntil: null }
  const closeUntil = new Date(last + CLOSE_SCAN_WINDOW_MINUTES * 60_000)
  return { canClose: closeUntil.getTime() >= now.getTime(), closeUntil }
}
