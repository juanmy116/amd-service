// Utilidades puras de Web Push para la PWA de técnicos (testeadas en push.test.ts).

/** Clave pública VAPID (base64url) → bytes, como pide pushManager.subscribe(). */
export function urlBase64ToUint8Array(base64Url: string): Uint8Array {
  const padded = base64Url + '='.repeat((4 - (base64Url.length % 4)) % 4)
  const base64 = padded.replace(/-/g, '+').replace(/_/g, '/')
  const raw = atob(base64)
  return Uint8Array.from(raw, ch => ch.charCodeAt(0))
}

export type ParsedSubscription = { endpoint: string; p256dh: string; auth: string }

/** Valida lo que llega del navegador antes de guardarlo (viene del cliente: no fiarse). */
export function parseSubscription(input: unknown): ParsedSubscription | null {
  if (!input || typeof input !== 'object') return null
  const { endpoint, keys } = input as { endpoint?: unknown; keys?: { p256dh?: unknown; auth?: unknown } }
  const ok = (v: unknown, max: number): v is string => typeof v === 'string' && v.length > 0 && v.length <= max
  if (!ok(endpoint, 2048) || !endpoint.startsWith('https://')) return null
  if (!ok(keys?.p256dh, 512) || !ok(keys?.auth, 512)) return null
  return { endpoint, p256dh: keys.p256dh, auth: keys.auth }
}
