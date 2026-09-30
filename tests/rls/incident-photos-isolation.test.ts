import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { adminClient, anonClient, signInAs, cleanup, ANON_KEY, SERVICE_KEY } from './helpers'
import { seedTenants, SC, type Tenants } from './scenario'
import { expectEmpty } from './assert'

// Aislamiento RLS de incident_photos (foto que el cliente adjunta al abrir una incidencia).
// Reutiliza el escenario de dos inquilinos: el cliente A / técnico A tienen la incidencia A;
// el cliente B y el técnico B no deben ver su foto. Corre contra Supabase LOCAL efímero.

const admin = adminClient()

let t: Tenants
let incidentAId: string
let photoAId: string

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

  // Foto de la incidencia A (simula la que subió el cliente A al abrirla).
  const { data: photo, error: pErr } = await admin.from('incident_photos').insert({
    incident_id: incidentAId, uploaded_by: t.clientAUid, storage_path: 'incidents/2026/06/test-photo-a.jpg',
  }).select('id').single()
  if (pErr) throw new Error(`seed photo: ${pErr.message}`)
  photoAId = photo!.id
}, 60_000)

afterAll(async () => {
  await cleanup(admin)
})

describe('RLS — incident_photos', () => {
  it('el cliente dueño ve la foto de su incidencia', async () => {
    const c = await signInAs(SC.clientAEmail)
    const { data } = await c.from('incident_photos').select('id').eq('incident_id', incidentAId)
    expect((data ?? []).map((p) => p.id)).toContain(photoAId)
  })

  it('el cliente dueño puede adjuntar una foto a su incidencia', async () => {
    const c = await signInAs(SC.clientAEmail)
    const { error } = await c.from('incident_photos').insert({
      incident_id: incidentAId, uploaded_by: t.clientAUid,
      storage_path: `incidents/${t.clientAUid}/2026/06/${'a'.repeat(64)}.jpeg`,
    })
    expect(error).toBeNull()
  })

  it('el cliente dueño NO puede asociar a su incidencia una ruta de otro usuario', async () => {
    const c = await signInAs(SC.clientAEmail)
    const { error } = await c.from('incident_photos').insert({
      incident_id: incidentAId, uploaded_by: t.clientAUid,
      storage_path: `incidents/${t.clientBUid}/2026/06/${'b'.repeat(64)}.jpeg`,
    })
    expect(error).not.toBeNull()
  })

  it('el cliente dueño NO puede asociar una ruta con path traversal', async () => {
    const c = await signInAs(SC.clientAEmail)
    const { error } = await c.from('incident_photos').insert({
      incident_id: incidentAId, uploaded_by: t.clientAUid,
      storage_path: `incidents/${t.clientAUid}/../../object/sign/counter-images/x.jpeg`,
    })
    expect(error).not.toBeNull()
  })

  it('un cliente ajeno NO ve la foto', async () => {
    const c = await signInAs(SC.clientBEmail)
    expectEmpty(await c.from('incident_photos').select('id').eq('incident_id', incidentAId))
  })

  it('un cliente ajeno NO puede adjuntar foto a una incidencia que no es suya', async () => {
    const c = await signInAs(SC.clientBEmail)
    const { error } = await c.from('incident_photos').insert({
      incident_id: incidentAId, uploaded_by: t.clientBUid,
      // Ruta válida de B: así el test aísla la condición «la incidencia tiene que ser suya».
      storage_path: `incidents/${t.clientBUid}/2026/06/${'c'.repeat(64)}.jpeg`,
    })
    expect(error).not.toBeNull()
  })

  it('el técnico asignado ve la foto', async () => {
    const c = await signInAs(SC.techAEmail)
    const { data } = await c.from('incident_photos').select('id').eq('incident_id', incidentAId)
    expect((data ?? []).map((p) => p.id)).toContain(photoAId)
  })

  it('un técnico no asignado NO ve la foto', async () => {
    const c = await signInAs(SC.techBEmail)
    expectEmpty(await c.from('incident_photos').select('id').eq('incident_id', incidentAId))
  })

  it('un usuario anónimo no ve ninguna foto', async () => {
    const c = anonClient()
    const { data } = await c.from('incident_photos').select('id').eq('incident_id', incidentAId)
    expect(data ?? []).toHaveLength(0)
  })
})
