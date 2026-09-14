import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// El objeto que devuelve `new Ratelimit(...)`. Cada test decide qué hace `limit()`.
const limitMock = vi.fn()

vi.mock('@upstash/ratelimit', () => ({
  Ratelimit: class {
    static slidingWindow = () => ({})
    limit = limitMock
  },
}))
vi.mock('@upstash/redis', () => ({ Redis: class {} }))
vi.mock('next/headers', () => ({ headers: async () => new Headers() }))

async function loadCheckRateLimit() {
  vi.resetModules()
  process.env.UPSTASH_REDIS_REST_URL = 'https://ejemplo.upstash.io'
  process.env.UPSTASH_REDIS_REST_TOKEN = 'token-de-prueba'
  const mod = await import('./rate-limit')
  return mod.checkRateLimit
}

describe('checkRateLimit', () => {
  beforeEach(() => {
    limitMock.mockReset()
    vi.spyOn(console, 'error').mockImplementation(() => {})
  })
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('deja pasar cuando el limitador dice que sí', async () => {
    limitMock.mockResolvedValue({ success: true })
    const checkRateLimit = await loadCheckRateLimit()
    expect(await checkRateLimit('login', 'ip:alguien')).toBe(true)
  })

  it('bloquea cuando se ha superado el cupo', async () => {
    limitMock.mockResolvedValue({ success: false })
    const checkRateLimit = await loadCheckRateLimit()
    expect(await checkRateLimit('login', 'ip:alguien')).toBe(false)
  })

  it('si el backend NO RESPONDE, deja pasar en vez de tumbar el login', async () => {
    // El caso del 2026-09-14: la base de Upstash se borró y nadie podía entrar en la aplicación.
    limitMock.mockRejectedValue(new Error('getaddrinfo ENOTFOUND exotic-wren-125514.upstash.io'))
    const checkRateLimit = await loadCheckRateLimit()
    expect(await checkRateLimit('login', 'ip:alguien')).toBe(true)
  })

  it('un backend caído queda registrado en los logs', async () => {
    limitMock.mockRejectedValue(new Error('fetch failed'))
    const checkRateLimit = await loadCheckRateLimit()
    await checkRateLimit('contact', 'ip:alguien')
    expect(console.error).toHaveBeenCalled()
  })
})
