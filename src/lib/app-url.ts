import { headers } from 'next/headers'

/**
 * Base pública de la app: `NEXT_PUBLIC_APP_URL` o, como respaldo, el origen de
 * la request. Evita generar URLs relativas (p. ej. QR no escaneables) si la
 * variable no está configurada. Solo en servidor (usa `next/headers`).
 */
export async function appBaseUrl(): Promise<string> {
  const env = process.env.NEXT_PUBLIC_APP_URL
  if (env) return env
  const h = await headers()
  const host = h.get('x-forwarded-host') ?? h.get('host')
  const proto = h.get('x-forwarded-proto') ?? 'https'
  return host ? `${proto}://${host}` : ''
}
