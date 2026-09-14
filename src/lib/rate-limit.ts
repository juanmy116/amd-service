import { Ratelimit } from '@upstash/ratelimit'
import { Redis } from '@upstash/redis'
import { headers } from 'next/headers'

const url = process.env.UPSTASH_REDIS_REST_URL
const token = process.env.UPSTASH_REDIS_REST_TOKEN

const redis = url && token ? new Redis({ url, token }) : null

function build(limit: number, window: `${number} ${'s' | 'm' | 'h' | 'd'}`, prefix: string) {
  if (!redis) return null
  return new Ratelimit({
    redis,
    limiter: Ratelimit.slidingWindow(limit, window),
    prefix: `amd:${prefix}`,
    analytics: false,
  })
}

export const rateLimiters = {
  login:                  build(5,  '15 m', 'login'),
  signup:                 build(3,  '1 h',  'signup'),
  verify:                 build(10, '1 h',  'verify'),
  csat:                   build(5,  '1 h',  'csat'),
  contact:                build(3,  '1 h',  'contact'),
  public_incident_hourly: build(2,  '1 h',  'pub_inc_h'),
  public_incident_daily:  build(5,  '24 h', 'pub_inc_d'),
  // Subida de foto en el formulario público del QR. Cupo propio (separado del envío del
  // formulario) para que adjuntar foto no agote el de public_incident_*, y para acotar el
  // abuso del endpoint anónimo de URL firmada.
  public_photo_upload:    build(6,  '1 h',  'pub_photo'),
}

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
  const limiter = rateLimiters[key]
  if (!limiter) {
    // Fail-closed SOLO en producción real: si Upstash no está configurado, DENEGAR en vez de
    // dejar pasar todo (un rate limit que silenciosamente permite todo es peor que ninguno).
    // Se usa VERCEL_ENV (no NODE_ENV): Vercel pone NODE_ENV='production' también en los deploys
    // de *preview*, donde Upstash suele no estar configurado — con NODE_ENV se romperían los
    // previews (login/contacto/CSAT denegados). VERCEL_ENV vale 'production' solo en prod real;
    // en preview/development/local queda permisivo.
    if (process.env.VERCEL_ENV === 'production') {
      console.error(`[rate-limit] ${key} sin backend en producción — UPSTASH_REDIS_REST_URL/TOKEN ausentes → denegando`)
      return false
    }
    return true
  }
  try {
    const { success } = await limiter.limit(identifier)
    return success
  } catch (error) {
    // El backend ESTÁ configurado pero no responde (caído, borrado, sin red...). Aquí se permite
    // la petición a propósito, en vez de propagar el error:
    //
    // Pasó de verdad el 2026-09-14. La base gratuita de Upstash se borró por inactividad, su
    // host dejó de resolver, `limiter.limit()` empezó a lanzar y la Server Action de login
    // reventaba con un 500 («ERROR 3227098399» en pantalla). Resultado: NADIE podía entrar en la
    // aplicación —admins, técnicos, clientes y el kiosko del taller—, ni con la contraseña
    // correcta. Solo seguían dentro quienes ya tenían la sesión iniciada.
    //
    // Un limitador caído no puede dejar a la empresa fuera de su propia aplicación. Supabase Auth
    // mantiene sus propios límites de intentos, así que el hueco de protección es acotado, y el
    // error se registra para que se vea en los logs de Vercel.
    console.error(`[rate-limit] ${key}: el backend no responde → se permite la petición`, error)
    return true
  }
}
