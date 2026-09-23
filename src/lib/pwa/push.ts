// Utilidades puras de Web Push para la PWA de técnicos (testeadas en push.test.ts).

/** Clave pública VAPID (base64url) → bytes, como pide pushManager.subscribe(). */
export function urlBase64ToUint8Array(base64Url: string): Uint8Array {
  const padded = base64Url + '='.repeat((4 - (base64Url.length % 4)) % 4)
  const base64 = padded.replace(/-/g, '+').replace(/_/g, '/')
  const raw = atob(base64)
  return Uint8Array.from(raw, ch => ch.charCodeAt(0))
}

/**
 * ¿Los bytes de una applicationServerKey ya suscrita (ArrayBuffer, o null si no hay suscripción
 * previa) coinciden con la clave VAPID actual? Si no coinciden (rotación de la clave VAPID), la
 * suscripción vieja hay que darla de baja y crear una nueva — el navegador rechaza envíos
 * firmados con otra clave.
 */
export function sameKey(a: ArrayBuffer | null, b: Uint8Array): boolean {
  if (!a) return false
  const bytesA = new Uint8Array(a)
  if (bytesA.length !== b.length) return false
  for (let i = 0; i < bytesA.length; i++) {
    if (bytesA[i] !== b[i]) return false
  }
  return true
}

export type ParsedSubscription = { endpoint: string; p256dh: string; auth: string }

// Lista blanca de hosts de servicios push reales. send-push hace un POST directo a `endpoint`
// (server-side request forgery si aceptáramos cualquier URL): sin esta lista, un cliente podría
// registrar un endpoint arbitrario y convertir la Edge Function en un cañón de peticiones a lo
// que sea. Apple usa un único host fijo (web.push.apple.com); Google/Firefox/Windows reparten
// por subdominio, de ahí el sufijo.
const ALLOWED_PUSH_HOSTS = new Set(['web.push.apple.com', 'fcm.googleapis.com'])
const ALLOWED_PUSH_HOST_SUFFIXES = ['.push.apple.com', '.push.services.mozilla.com', '.notify.windows.com']

function isAllowedPushHost(hostname: string): boolean {
  if (ALLOWED_PUSH_HOSTS.has(hostname)) return true
  return ALLOWED_PUSH_HOST_SUFFIXES.some(suffix => hostname.endsWith(suffix))
}

/** Valida lo que llega del navegador antes de guardarlo (viene del cliente: no fiarse). */
export function parseSubscription(input: unknown): ParsedSubscription | null {
  if (!input || typeof input !== 'object') return null
  const { endpoint, keys } = input as { endpoint?: unknown; keys?: { p256dh?: unknown; auth?: unknown } }
  const ok = (v: unknown, max: number): v is string => typeof v === 'string' && v.length > 0 && v.length <= max
  if (!ok(endpoint, 2048)) return null

  let hostname: string
  try {
    const url = new URL(endpoint)
    if (url.protocol !== 'https:') return null
    hostname = url.hostname
  } catch {
    return null
  }
  if (!isAllowedPushHost(hostname)) return null

  if (!ok(keys?.p256dh, 512) || !ok(keys?.auth, 512)) return null
  return { endpoint, p256dh: keys.p256dh, auth: keys.auth }
}
