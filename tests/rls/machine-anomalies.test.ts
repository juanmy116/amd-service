import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import {
  adminClient, anonClient, signInAs, createUserWithRole, cleanup, ANON_KEY, SERVICE_KEY,
} from './helpers'

// machine_anomalies (Fase 3): cola de anomalías del agente. Es interna de AMD y
// solo el admin puede leerla/gestionarla (policy admin_all_machine_anomalies).
// Supabase LOCAL efímero.

const admin = adminClient()

const ADMIN  = 'admin@rls.test'
const TECH   = 'tech-a@rls.test'
const CLIENT = 'client@rls.test'

const SERIE = 'TEST-SN1'

beforeAll(async () => {
  if (!ANON_KEY || !SERVICE_KEY) {
    throw new Error('Faltan ANON_KEY/SERVICE_ROLE_KEY. Ejecuta con `supabase start` y exporta las claves.')
  }
  await cleanup(admin)
  await createUserWithRole(admin, ADMIN, 'admin')
  await createUserWithRole(admin, TECH, 'technician')
  await createUserWithRole(admin, CLIENT, 'client')

  const { error: mErr } = await admin.from('machines').insert({ numero_serie: SERIE, marque: 'TEST', modele: 'X' })
  if (mErr) throw new Error(`seed machine: ${mErr.message}`)
  const { error: aErr } = await admin.from('machine_anomalies').insert({
    machine_id: SERIE, part_id: 7, anomaly_type: 'consumo_alto_sin_cambio',
    light: 'red', reason: 'TEST anomalie',
  })
  if (aErr) throw new Error(`seed anomaly: ${aErr.message}`)
}, 60_000)

afterAll(async () => {
  await cleanup(admin)
})

describe('RLS — machine_anomalies (admin-only)', () => {
  it('el admin ve y gestiona las anomalías', async () => {
    const c = await signInAs(ADMIN)
    const { data } = await c.from('machine_anomalies').select('id, light').eq('machine_id', SERIE)
    expect((data ?? []).map((r) => r.light)).toEqual(['red'])
  })

  it('el técnico NO ve las anomalías', async () => {
    const c = await signInAs(TECH)
    const { data } = await c.from('machine_anomalies').select('id').eq('machine_id', SERIE)
    expect(data ?? []).toHaveLength(0)
  })

  it('el técnico NO puede cambiar el estado de una anomalía', async () => {
    const c = await signInAs(TECH)
    await c.from('machine_anomalies').update({ status: 'dismissed' }).eq('machine_id', SERIE)
    // Verificación independiente: sigue 'open'.
    const { data } = await admin.from('machine_anomalies').select('status').eq('machine_id', SERIE).single()
    expect(data?.status).toBe('open')
  })

  it('el cliente NO ve las anomalías', async () => {
    const c = await signInAs(CLIENT)
    const { data } = await c.from('machine_anomalies').select('id').eq('machine_id', SERIE)
    expect(data ?? []).toHaveLength(0)
  })

  it('un usuario anónimo NO ve las anomalías', async () => {
    const { data } = await anonClient().from('machine_anomalies').select('id').eq('machine_id', SERIE)
    expect(data ?? []).toHaveLength(0)
  })
})
