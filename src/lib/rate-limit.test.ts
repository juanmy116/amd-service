import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// La llamada a la función SQL `check_rate_limit`. Cada test decide qué responde.
const rpcMock = vi.fn()

vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => ({ rpc: rpcMock }) }))
vi.mock('next/headers', () => ({ headers: async () => new Headers() }))

const { checkRateLimit } = await import('./rate-limit')

describe('checkRateLimit', () => {
  beforeEach(() => {
    rpcMock.mockReset()
    vi.spyOn(console, 'error').mockImplementation(() => {})
  })
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('pasa a la base la puerta, quién llama y el cupo de esa puerta', async () => {
    rpcMock.mockResolvedValue({ data: true, error: null })
    await checkRateLimit('login', 'ip:alguien')
    expect(rpcMock).toHaveBeenCalledWith('check_rate_limit', {
      p_bucket: 'login', p_identifier: 'ip:alguien', p_limit: 5, p_window_seconds: 900,
    })
  })

  it('deja pasar cuando la base dice que sí', async () => {
    rpcMock.mockResolvedValue({ data: true, error: null })
    expect(await checkRateLimit('login', 'ip:alguien')).toBe(true)
  })

  it('bloquea cuando se ha superado el cupo', async () => {
    rpcMock.mockResolvedValue({ data: false, error: null })
    expect(await checkRateLimit('login', 'ip:alguien')).toBe(false)
  })

  it('si la base devuelve un error, deja pasar en vez de tumbar el login', async () => {
    // El caso del 2026-09-14 (entonces con Upstash): el limitador falló y nadie podía entrar.
    rpcMock.mockResolvedValue({ data: null, error: { message: 'permission denied' } })
    expect(await checkRateLimit('login', 'ip:alguien')).toBe(true)
  })

  it('si la base NO RESPONDE, deja pasar y lo registra en los logs', async () => {
    rpcMock.mockRejectedValue(new Error('fetch failed'))
    expect(await checkRateLimit('contact', 'ip:alguien')).toBe(true)
    expect(console.error).toHaveBeenCalled()
  })
})
