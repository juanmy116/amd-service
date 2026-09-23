// Posición del técnico en un momento concreto (escanear, resolver, cerrar). Nunca lanza y nunca
// espera más de `timeoutMs`: sin permiso, sin GPS o sin respuesta ⇒ null (queda 🟡 «sans position»).
// `maximumAgeMs`: cuánto puede tener de vieja una posición en caché. Corto (5 s) por defecto: una
// posición de hace un minuto puede ser la de la calle anterior y daría un veredicto falso. El
// escáner pasa 0 (la posición del escaneo puede fijar la ubicación de la máquina para siempre).
// Solo navegador: no se testea con vitest (entorno `node`); la validación en el servidor es
// `readPosition` de `src/lib/geo.ts`.
export type CapturedPosition = { lat: number; lng: number; accuracy: number }

export function getPositionOnce(timeoutMs = 4000, maximumAgeMs = 5000): Promise<CapturedPosition | null> {
  if (typeof navigator === 'undefined' || !('geolocation' in navigator)) return Promise.resolve(null)
  return new Promise(resolve => {
    const timer = setTimeout(() => resolve(null), timeoutMs + 500)
    try {
      navigator.geolocation.getCurrentPosition(
        p => { clearTimeout(timer); resolve({ lat: p.coords.latitude, lng: p.coords.longitude, accuracy: p.coords.accuracy }) },
        () => { clearTimeout(timer); resolve(null) },
        { enableHighAccuracy: true, timeout: timeoutMs, maximumAge: maximumAgeMs },
      )
    } catch {
      // Algún navegador lanza en vez de llamar al callback de error (p. ej. política de permisos).
      clearTimeout(timer)
      resolve(null)
    }
  })
}

/** Para enviar la posición en un FormData de Server Action. */
export function appendPosition(fd: FormData, p: CapturedPosition | null): void {
  if (!p) return
  fd.set('pos_lat', String(p.lat)); fd.set('pos_lng', String(p.lng)); fd.set('pos_accuracy', String(p.accuracy))
}
