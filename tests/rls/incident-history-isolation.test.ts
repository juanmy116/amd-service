import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { adminClient, signInAs, cleanup, ANON_KEY, SERVICE_KEY } from './helpers'
import { seedTenants, SC, type Tenants } from './scenario'

// Escritura en incident_history (migración 20260930190000): solo el técnico ASIGNADO escribe en
// el historial de una avería; la oficina sigue por admin_all_incident_history. Antes bastaba con
// `changed_by = auth.uid()` y cualquier sesión (cliente, técnico ajeno) podía inventarse líneas
// en el historial de cualquier avería. Corre contra Supabase LOCAL efímero.

const admin = adminClient()

let t: Tenants
let incidentAId: string

async function historyComments(): Promise<string[]> {
  const { data } = await admin.from('incident_history').select('comment').eq('incident_id', incidentAId)
  return (data ?? []).map((h) => h.comment as string)
}

beforeAll(async () => {
  if (!ANON_KEY || !SERVICE_KEY) {
    throw new Error('Faltan ANON_KEY/SERVICE_ROLE_KEY. Ejecuta con `supabase start` y exporta las claves.')
  }
  await cleanup(admin)
  t = await seedTenants(admin)

  const { data: inc, error: incErr } = await admin
    .from('incidents').select('id').eq('numero_incident', SC.incidentNumA).single()
  if (incErr) throw new Error(`seed incident lookup: ${incErr.message}`)
  incidentAId = inc!.id
}, 60_000)

afterAll(async () => {
  await cleanup(admin)
})

describe('RLS — incident_history (INSERT)', () => {
  it('el técnico asignado escribe en el historial de su avería', async () => {
    const c = await signInAs(SC.techAEmail)
    const { error } = await c.from('incident_history').insert({
      incident_id: incidentAId, changed_by: t.techA, old_status: 'assigné', new_status: 'en_cours', comment: 'TEST tech A',
    })
    expect(error).toBeNull()
    expect(await historyComments()).toContain('TEST tech A')
  })

  it('la oficina escribe en el historial de cualquier avería', async () => {
    const c = await signInAs(SC.adminEmail)
    const { error } = await c.from('incident_history').insert({
      incident_id: incidentAId, changed_by: t.adminUid, old_status: null, new_status: null, comment: 'TEST admin',
    })
    expect(error).toBeNull()
    expect(await historyComments()).toContain('TEST admin')
  })

  it('un técnico NO asignado no puede escribir en el historial de la avería', async () => {
    const c = await signInAs(SC.techBEmail)
    const { error } = await c.from('incident_history').insert({
      incident_id: incidentAId, changed_by: t.techB, old_status: 'en_cours', new_status: 'résolu', comment: 'TEST forge tech B',
    })
    expect(error).not.toBeNull()
    expect(await historyComments()).not.toContain('TEST forge tech B')
  })

  it('el cliente dueño de la avería no puede escribir en su historial', async () => {
    const c = await signInAs(SC.clientAEmail)
    const { error } = await c.from('incident_history').insert({
      incident_id: incidentAId, changed_by: t.clientAUid, old_status: 'en_cours', new_status: 'fermé', comment: 'TEST forge client A',
    })
    expect(error).not.toBeNull()
    expect(await historyComments()).not.toContain('TEST forge client A')
  })

  it('un cliente ajeno no puede escribir en el historial de la avería', async () => {
    const c = await signInAs(SC.clientBEmail)
    const { error } = await c.from('incident_history').insert({
      incident_id: incidentAId, changed_by: t.clientBUid, old_status: 'en_cours', new_status: 'fermé', comment: 'TEST forge client B',
    })
    expect(error).not.toBeNull()
    expect(await historyComments()).not.toContain('TEST forge client B')
  })

  it('el técnico asignado no puede firmar una línea en nombre de otro', async () => {
    const c = await signInAs(SC.techAEmail)
    const { error } = await c.from('incident_history').insert({
      incident_id: incidentAId, changed_by: t.adminUid, old_status: null, new_status: null, comment: 'TEST forge as admin',
    })
    expect(error).not.toBeNull()
    expect(await historyComments()).not.toContain('TEST forge as admin')
  })
})
