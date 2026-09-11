import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import {
  adminClient, anonClient, signInAs, createUserWithRole, cleanup, ANON_KEY, SERVICE_KEY,
} from './helpers'

// quartiers: catálogo de barrios con coordenadas para el mapa de /atelier.
// Lo lee cualquier usuario autenticado (el kiosko usa cuenta technician-dispatcher);
// solo el admin puede tocarlo. Supabase LOCAL efímero.

const admin = adminClient()

const ADMIN  = 'admin@rls.test'
const TECH   = 'tech-a@rls.test'
const CLIENT = 'client@rls.test'

async function clearTestRows() {
  await admin.from('quartiers').delete().like('code', 'test-%')
}

beforeAll(async () => {
  if (!ANON_KEY || !SERVICE_KEY) {
    throw new Error('Faltan ANON_KEY/SERVICE_ROLE_KEY. Ejecuta con `supabase start` y exporta las claves.')
  }
  await cleanup(admin)
  await clearTestRows()
  await createUserWithRole(admin, ADMIN, 'admin')
  await createUserWithRole(admin, TECH, 'technician')
  await createUserWithRole(admin, CLIENT, 'client')
}, 60_000)

afterAll(async () => {
  await clearTestRows()
  await cleanup(admin)
})

describe('RLS — quartiers (lectura authenticated, escritura admin)', () => {
  it('el seed de la migración está presente', async () => {
    const { data } = await admin.from('quartiers').select('code').eq('code', 'plateau')
    expect((data ?? []).length).toBe(1)
  })

  it('el técnico PUEDE leer el catálogo', async () => {
    const c = await signInAs(TECH)
    const { data, error } = await c.from('quartiers').select('code, lat, lng').eq('code', 'almadies')
    expect(error).toBeNull()
    expect((data ?? []).length).toBe(1)
  })

  it('el cliente PUEDE leer el catálogo', async () => {
    const c = await signInAs(CLIENT)
    const { data } = await c.from('quartiers').select('code').eq('code', 'plateau')
    expect((data ?? []).length).toBe(1)
  })

  it('el anónimo NO puede leer el catálogo', async () => {
    // Ojo: aquí NO se usa expectEmpty (ver tests/rls/assert.ts). El anónimo no tiene GRANT
    // sobre la tabla, así que recibir un permission-denied con data null es el resultado
    // esperado, no un falso verde.
    const c = anonClient()
    const { data } = await c.from('quartiers').select('code')
    expect(data ?? []).toHaveLength(0)
  })

  it('el admin puede crear un quartier', async () => {
    const c = await signInAs(ADMIN)
    const { error } = await c.from('quartiers').insert({
      code: 'test-zone', label: 'Test Zone', ville: 'Dakar', lat: 14.7, lng: -17.45,
    })
    expect(error).toBeNull()
  })

  it('el técnico NO puede crear un quartier', async () => {
    const c = await signInAs(TECH)
    await c.from('quartiers').insert({
      code: 'test-tech', label: 'Test Tech', ville: 'Dakar', lat: 14.7, lng: -17.45,
    })
    const { data } = await admin.from('quartiers').select('code').eq('code', 'test-tech')
    expect(data ?? []).toHaveLength(0)
  })

  it('el técnico NO puede mover un quartier existente', async () => {
    const c = await signInAs(TECH)
    await c.from('quartiers').update({ lat: 0 }).eq('code', 'plateau')
    const { data } = await admin.from('quartiers').select('lat').eq('code', 'plateau').single()
    expect(data?.lat).toBeCloseTo(14.669, 3)
  })
})
