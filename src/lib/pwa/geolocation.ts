// Posición del técnico en un momento concreto (escanear, resolver, cerrar). Nunca lanza: sin
// permiso, sin GPS o sin respuesta ⇒ null (queda 🟡 «sans position»).
// `timeoutMs` es el tope del GPS una vez concedido el permiso. El `timeout` de la API de
// Geolocation NO cuenta el tiempo que el técnico tarda en contestar al aviso de permiso, así que
// el tope exterior depende del estado del permiso: ya concedido ⇒ `timeoutMs + 500`; por
// preguntar (o navegador sin Permissions API, como Safari antiguo) ⇒ PROMPT_CAP_MS, para dejarle
// leer el aviso; denegado ⇒ null al instante, sin pedir nada.
// `maximumAgeMs`: cuánto puede tener de vieja una posición en caché. Corto (5 s) por defecto: una
// posición de hace un minuto puede ser la de la calle anterior y daría un veredicto falso. El
// escáner pasa 0 (la posición del escaneo puede fijar la ubicación de la máquina para siempre).
// Solo navegador: no se testea con vitest (entorno `node`); la validación en el servidor es
// `readPosition` / `toPosition` de `src/lib/geo.ts`.
export type CapturedPosition = { lat: number; lng: number; accuracy: number }

const PROMPT_CAP_MS = 30_000

async function permissionState(): Promise<PermissionState | null> {
  try {
    const status = await navigator.permissions?.query({ name: 'geolocation' })
    return status?.state ?? null
  } catch {
    return null
  }
}

export async function getPositionOnce(timeoutMs = 4000, maximumAgeMs = 5000): Promise<CapturedPosition | null> {
  try {
    if (typeof navigator === 'undefined' || !('geolocation' in navigator)) return null
    const state = await permissionState()
    if (state === 'denied') return null
    const cap = state === 'granted' ? timeoutMs + 500 : PROMPT_CAP_MS
    return await new Promise<CapturedPosition | null>(resolve => {
      const timer = setTimeout(() => resolve(null), cap)
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
  } catch {
    return null
  }
}

/** Para enviar la posición en un FormData de Server Action. */
export function appendPosition(fd: FormData, p: CapturedPosition | null): void {
  if (!p) return
  fd.set('pos_lat', String(p.lat)); fd.set('pos_lng', String(p.lng)); fd.set('pos_accuracy', String(p.accuracy))
}
