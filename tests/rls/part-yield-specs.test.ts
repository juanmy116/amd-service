import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import {
  adminClient, anonClient, signInAs, createUserWithRole, cleanup, ANON_KEY, SERVICE_KEY,
} from './helpers'

// part_yield_specs (Fase 2): fichas de rendimiento del fabricante. Es interno de
// AMD y solo el admin debe poder leerlas/escribirlas (policy admin_all_part_yield_specs).
// Supabase LOCAL efímero.

const admin = adminClient()

const ADMIN  = 'admin@rls.test'
const TECH   = 'tech-a@rls.test'
const CLIENT = 'client@rls.test'

async function clearSpecs() {
  await admin.from('part_yield_specs').delete().like('marque', 'TEST%')
}

beforeAll(async () => {
  if (!ANON_KEY || !SERVICE_KEY) {
    throw new Error('Faltan ANON_KEY/SERVICE_ROLE_KEY. Ejecuta con `supabase start` y exporta las claves.')
  }
  await cleanup(admin)
  await clearSpecs()
  await createUserWithRole(admin, ADMIN, 'admin')
  await createUserWithRole(admin, TECH, 'technician')
  await createUserWithRole(admin, CLIENT, 'client')
}, 60_000)

afterAll(async () => {
  await clearSpecs()
  await cleanup(admin)
})

describe('RLS — part_yield_specs (admin-only)', () => {
  it('el admin puede crear y leer una ficha de rendimiento', async () => {
    const c = await signInAs(ADMIN)
    const { error } = await c.from('part_yield_specs').insert({
      marque: 'TEST Ricoh', modele: 'MP C3002', part_id: 7,
      expected_yield: 15000, unit: 'copies_total',
    })
    expect(error).toBeNull()
    const { data } = await c.from('part_yield_specs').select('expected_yield').like('marque', 'TEST%')
    expect((data ?? []).map((r) => r.expected_yield)).toEqual([15000])
  })

  it('el técnico NO puede leer las fichas', async () => {
    const c = await signInAs(TECH)
    const { data } = await c.from('part_yield_specs').select('id').like('marque', 'TEST%')
    expect(data ?? []).toHaveLength(0)
  })

  it('el técnico NO puede crear una ficha (WITH CHECK admin)', async () => {
    const c = await signInAs(TECH)
    await c.from('part_yield_specs').insert({
      marque: 'TEST Tech', modele: 'X', part_id: 7, expected_yield: 999, unit: 'copies_total',
    })
    // Verificación independiente con service_role: no se creó.
    const { data } = await admin.from('part_yield_specs').select('id').eq('marque', 'TEST Tech')
    expect(data ?? []).toHaveLength(0)
  })

  it('el cliente NO puede leer las fichas', async () => {
    const c = await signInAs(CLIENT)
    const { data } = await c.from('part_yield_specs').select('id').like('marque', 'TEST%')
    expect(data ?? []).toHaveLength(0)
  })

  it('un usuario anónimo NO puede leer las fichas', async () => {
    const { data } = await anonClient().from('part_yield_specs').select('id').like('marque', 'TEST%')
    expect(data ?? []).toHaveLength(0)
  })
})
