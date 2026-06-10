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
  const { success } = await limiter.limit(identifier)
  return success
}
