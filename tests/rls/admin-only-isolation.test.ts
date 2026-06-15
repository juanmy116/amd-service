import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { adminClient, anonClient, signInAs, cleanup, expectEmpty, ANON_KEY, SERVICE_KEY } from './helpers'
import { seedTenants, SC } from './scenario'

// Aislamiento RLS de tablas INTERNAS admin-only: leads, princity_api_logs,
// princity_health, pending_counter_imports, csat_responses, incident_photos.
// Ningún rol externo (client/technician/anon) debe poder leerlas; solo el admin.
// Cada caso siembra una fila con service_role y comprueba la visibilidad por rol.

const admin = adminClient()
let incidentAId: string

beforeAll(async () => {
  if (!ANON_KEY || !SERVICE_KEY) {
    throw new Error('Faltan ANON_KEY/SERVICE_ROLE_KEY. Ejecuta con `supabase start` y exporta las claves.')
  }
  await cleanup(admin)
  await seedTenants(admin)

  const { data: inc } = await admin.from('incidents').select('id').eq('numero_incident', SC.incidentNumA).single()
  incidentAId = inc!.id as string

  // Una fila de prueba en cada tabla interna.
  const seeds = await Promise.all([
    admin.from('leads').insert({
      name: 'TEST Lead', email: 'lead@rls.test', company: 'TEST Co', phone: '+221000000000', needs: 'rental',
    }),
    admin.from('princity_api_logs').insert({ function_name: 'TEST-fn', status: 'success' }),
    admin.from('princity_health').insert({ function_name: 'TEST-fn' }),
    admin.from('pending_counter_imports').insert({
      image_path: '2026/06/test-rls.jpg', image_size_bytes: 1000, image_hash_sha256: 'TEST-pci-rls',
    }),
    admin.from('csat_responses').insert({ incident_id: incidentAId, token: 'TEST-csat-token', rating: 5 }),
    admin.from('incident_photos').insert({ incident_id: incidentAId, storage_path: 'TEST/photo.jpg' }),
  ])
  const failed = seeds.find((s) => s.error)
  if (failed?.error) throw new Error(`seed admin-only: ${failed.error.message}`)
}, 90_000)

afterAll(async () => {
  await cleanup(admin)
})

// Para cada tabla: (selector de la fila sembrada) → client/tech/anon ven 0, admin ve ≥1.
const cases: { table: string; column: string; value: string }[] = [
  { table: 'leads', column: 'name', value: 'TEST Lead' },
  { table: 'princity_api_logs', column: 'function_name', value: 'TEST-fn' },
  { table: 'princity_health', column: 'function_name', value: 'TEST-fn' },
  { table: 'pending_counter_imports', column: 'image_hash_sha256', value: 'TEST-pci-rls' },
  { table: 'csat_responses', column: 'token', value: 'TEST-csat-token' },
  { table: 'incident_photos', column: 'storage_path', value: 'TEST/photo.jpg' },
]

describe.each(cases)('RLS admin-only — $table', ({ table, column, value }) => {
  it('el cliente no la ve', async () => {
    const c = await signInAs(SC.clientAEmail)
    expectEmpty(await c.from(table).select('*').eq(column, value))
  })

  it('el técnico no la ve', async () => {
    const c = await signInAs(SC.techAEmail)
    expectEmpty(await c.from(table).select('*').eq(column, value))
  })

  it('el anónimo no la ve', async () => {
    const { data } = await anonClient().from(table).select('*').eq(column, value)
    expect(data ?? []).toHaveLength(0)
  })

  it('el admin sí la ve', async () => {
    const c = await signInAs(SC.adminEmail)
    const { data } = await c.from(table).select('*').eq(column, value)
    expect((data ?? []).length).toBeGreaterThanOrEqual(1)
  })
})
