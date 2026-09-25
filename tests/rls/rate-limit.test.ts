import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { adminClient, anonClient, signInAs, cleanup, createUserWithRole, ANON_KEY, SERVICE_KEY } from './helpers'

// Limitador de intentos en Supabase (migración 20260925110000, sustituye a Upstash).
//
// 1. check_rate_limit deja pasar hasta el cupo y deniega a partir de ahí, sin apuntar lo denegado.
// 2. Cada puerta (bucket) y cada llamante (identifier) tienen su propio cupo.
// 3. La ventana es deslizante: pasado el tiempo, vuelve a dejar pasar.
// 4. Peticiones simultáneas no se cuelan por encima del cupo (candado consultivo).
// 5. Ni anon ni un usuario con sesión pueden llamarla (llenarían el cupo de otro) ni leer la libreta.

const admin = adminClient()
const ADMIN_EMAIL = 'rate-limit-admin@rls.test'
const BUCKET = 'TEST-rl'

async function check(identifier: string, limit: number, windowSeconds = 60, bucket = BUCKET): Promise<boolean> {
  const { data, error } = await admin.rpc('check_rate_limit', {
    p_bucket: bucket, p_identifier: identifier, p_limit: limit, p_window_seconds: windowSeconds,
  })
  if (error) throw new Error(`check_rate_limit: ${error.message}`)
  return data as boolean
}

async function hits(identifier: string): Promise<number> {
  const { count, error } = await admin.from('rate_limit_hits')
    .select('id', { count: 'exact', head: true })
    .like('bucket', 'TEST-%').eq('identifier', identifier)
  if (error) throw new Error(`count hits: ${error.message}`)
  return count ?? 0
}

beforeAll(async () => {
  if (!ANON_KEY || !SERVICE_KEY) {
    throw new Error('Faltan ANON_KEY/SERVICE_ROLE_KEY. Ejecuta con `supabase start` y exporta las claves.')
  }
  await cleanup(admin)
  await admin.from('rate_limit_hits').delete().like('bucket', 'TEST-%')
  await createUserWithRole(admin, ADMIN_EMAIL, 'admin')
}, 90_000)

afterAll(async () => {
  await admin.from('rate_limit_hits').delete().like('bucket', 'TEST-%')
  await cleanup(admin)
})

describe('check_rate_limit', () => {
  it('deja pasar hasta el cupo y deniega a partir de ahí, sin apuntar lo denegado', async () => {
    const results = []
    for (let i = 0; i < 5; i++) results.push(await check('ip:cupo', 3))
    expect(results).toEqual([true, true, true, false, false])
    expect(await hits('ip:cupo')).toBe(3)
  })

  it('cada puerta y cada llamante llevan su propio cupo', async () => {
    expect(await check('ip:a', 1)).toBe(true)
    expect(await check('ip:a', 1)).toBe(false)
    expect(await check('ip:b', 1)).toBe(true)
    expect(await check('ip:a', 1, 60, 'TEST-otra-puerta')).toBe(true)
  })

  it('la ventana es deslizante: pasado el tiempo vuelve a dejar pasar', async () => {
    expect(await check('ip:ventana', 1, 1)).toBe(true)
    expect(await check('ip:ventana', 1, 1)).toBe(false)
    await new Promise((r) => setTimeout(r, 1_200))
    expect(await check('ip:ventana', 1, 1)).toBe(true)
  })

  it('con cupo 0 (prueba en seco del panel /admin) responde «no» y no apunta nada', async () => {
    expect(await check('ip:seco', 0)).toBe(false)
    expect(await hits('ip:seco')).toBe(0)
  })

  it('las peticiones simultáneas no se cuelan por encima del cupo', async () => {
    const results = await Promise.all(Array.from({ length: 10 }, () => check('ip:rafaga', 3)))
    expect(results.filter(Boolean)).toHaveLength(3)
    expect(await hits('ip:rafaga')).toBe(3)
  })
})

describe('check_rate_limit — solo el servidor', () => {
  const args = { p_bucket: BUCKET, p_identifier: 'ip:intruso', p_limit: 5, p_window_seconds: 60 }

  it('anon no puede llamarla', async () => {
    const { error } = await anonClient().rpc('check_rate_limit', args)
    expect(error).not.toBeNull()
  })

  it('ni siquiera un admin con sesión puede llamarla', async () => {
    const c = await signInAs(ADMIN_EMAIL)
    const { error } = await c.rpc('check_rate_limit', args)
    expect(error).not.toBeNull()
    expect(await hits('ip:intruso')).toBe(0)
  })

  it('nadie con la clave pública lee la libreta (contiene IPs y emails)', async () => {
    await check('ip:privada', 5)
    const c = await signInAs(ADMIN_EMAIL)
    for (const client of [anonClient(), c]) {
      const { data } = await client.from('rate_limit_hits').select('id').like('bucket', 'TEST-%')
      expect(data ?? []).toHaveLength(0)
    }
  })
})
