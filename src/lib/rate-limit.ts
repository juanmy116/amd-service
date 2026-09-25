import { headers } from 'next/headers'
import { createAdminClient } from '@/lib/supabase/admin'

// Cupos por puerta: `limit` intentos por ventana deslizante de `windowSeconds`.
// La cuenta la lleva la función SQL `check_rate_limit` (migración 20260925110000).
export const rateLimiters = {
  login:                  { limit: 5,  windowSeconds: 15 * 60 },
  signup:                 { limit: 3,  windowSeconds: 60 * 60 },
  verify:                 { limit: 10, windowSeconds: 60 * 60 },
  csat:                   { limit: 5,  windowSeconds: 60 * 60 },
  contact:                { limit: 3,  windowSeconds: 60 * 60 },
  public_incident_hourly: { limit: 2,  windowSeconds: 60 * 60 },
  public_incident_daily:  { limit: 5,  windowSeconds: 24 * 60 * 60 },
  // Subida de foto en el formulario público del QR. Cupo propio (separado del envío del
  // formulario) para que adjuntar foto no agote el de public_incident_*, y para acotar el
  // abuso del endpoint anónimo de URL firmada.
  public_photo_upload:    { limit: 6,  windowSeconds: 60 * 60 },
} as const

export type RateLimiterKey = keyof typeof rateLimiters

export async function getClientIp(): Promise<string> {
  const h = await headers()
  const fwd = h.get('x-forwarded-for')
  if (fwd) return fwd.split(',')[0]!.trim()
  return h.get('x-real-ip') ?? 'unknown'
}

export function getClientIpFromHeaders(h: Headers): string {
  const fwd = h.get('x-forwarded-for')
  if (fwd) return fwd.split(',')[0]!.trim()
  return h.get('x-real-ip') ?? 'unknown'
}

export async function checkRateLimit(key: RateLimiterKey, identifier: string): Promise<boolean> {
  const { limit, windowSeconds } = rateLimiters[key]
  try {
    const { data, error } = await createAdminClient().rpc('check_rate_limit', {
      p_bucket: key,
      p_identifier: identifier,
      p_limit: limit,
      p_window_seconds: windowSeconds,
    })
    if (error) throw error
    return data === true
  } catch (error) {
    // Si la base no responde se permite la petición a propósito, en vez de propagar el error.
    //
    // Pasó de verdad el 2026-09-14, cuando el limitador vivía en Upstash: su base gratuita se
    // borró por inactividad, la llamada empezó a lanzar y la Server Action de login reventaba con
    // un 500 («ERROR 3227098399» en pantalla). NADIE podía entrar en la aplicación, ni con la
    // contraseña correcta. Un limitador caído no puede dejar a la empresa fuera de su propia
    // aplicación. Supabase Auth mantiene sus propios límites de intentos, así que el hueco es
    // acotado, y el error queda en los logs de Vercel.
    console.error(`[rate-limit] ${key}: la base no responde → se permite la petición`, error)
    return true
  }
}
