import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import {
  adminClient, anonClient, signInAs, createUserWithRole, cleanup, ANON_KEY, SERVICE_KEY,
} from './helpers'

// Aislamiento RLS + flujo de `quantity` sobre incident_parts y el RPC atómico
// set_incident_parts (Fase 0 historial de piezas). Cubre el hueco que el
// code-review señaló: ningún test tocaba incident_parts ni la columna quantity
// ni las piezas nuevas (ADF=13). Corre contra Supabase LOCAL efímero.

const admin = adminClient()

const TECH_A = 'tech-a@rls.test'
const TECH_B = 'tech-b@rls.test'
const ADMIN  = 'admin@rls.test'

let incidentA: string
let incidentB: string

async function partsOf(incidentId: string): Promise<Array<{ part_id: number; quantity: number }>> {
  const { data } = await admin
    .from('incident_parts').select('part_id, quantity').eq('incident_id', incidentId)
    .order('part_id')
  return (data ?? []) as Array<{ part_id: number; quantity: number }>
}

beforeAll(async () => {
  if (!ANON_KEY || !SERVICE_KEY) {
    throw new Error('Faltan ANON_KEY/SERVICE_ROLE_KEY. Ejecuta con `supabase start` y exporta las claves.')
  }
  await cleanup(admin)

  const techA = await createUserWithRole(admin, TECH_A, 'technician')
  const techB = await createUserWithRole(admin, TECH_B, 'technician')
  await createUserWithRole(admin, ADMIN, 'admin')

  const { data: cli, error: cliErr } = await admin
    .from('clients').insert({ nom_client: 'TEST Client' }).select('id').single()
  if (cliErr) throw new Error(`seed client: ${cliErr.message}`)

  const { data: contract, error: cErr } = await admin
    .from('contracts')
    .insert({ numero_contrat: 'TEST-C1', client_id: cli!.id, date_debut: '2026-01-01', statut: 'actif' })
    .select('id').single()
  if (cErr) throw new Error(`seed contract: ${cErr.message}`)

  const { error: mErr } = await admin
    .from('machines').insert({ numero_serie: 'TEST-SN1', marque: 'TEST', modele: 'X' })
  if (mErr) throw new Error(`seed machine: ${mErr.message}`)

  const { data: line, error: lErr } = await admin
    .from('contract_machines')
    .insert({ contract_id: contract!.id, machine_id: 'TEST-SN1', date_debut: '2026-01-01', statut: 'actif' })
    .select('id').single()
  if (lErr) throw new Error(`seed line: ${lErr.message}`)

  const { data: incs, error: iErr } = await admin.from('incidents').insert([
    { numero_incident: 'TEST-I1', title: 'Incident A', contract_machine_id: line!.id, assigned_to: techA },
    { numero_incident: 'TEST-I2', title: 'Incident B', contract_machine_id: line!.id, assigned_to: techB },
  ]).select('id, numero_incident')
  if (iErr) throw new Error(`seed incidents: ${iErr.message}`)
  incidentA = incs!.find((i) => i.numero_incident === 'TEST-I1')!.id
  incidentB = incs!.find((i) => i.numero_incident === 'TEST-I2')!.id
}, 60_000)

afterAll(async () => {
  await cleanup(admin)
})

describe('RLS + quantity — incident_parts vía set_incident_parts', () => {
  it('el técnico asignado registra piezas con cantidad (incluida una pieza nueva, ADF=13)', async () => {
    const c = await signInAs(TECH_A)
    const { error } = await c.rpc('set_incident_parts', {
      p_incident_id: incidentA,
      p_parts: [{ part_id: 7, quantity: 2 }, { part_id: 13, quantity: 1 }],
    })
    expect(error).toBeNull()
    expect(await partsOf(incidentA)).toEqual([
      { part_id: 7, quantity: 2 },
      { part_id: 13, quantity: 1 },
    ])
  })

  it('reemplaza el set completo de forma atómica (las piezas anteriores desaparecen)', async () => {
    const c = await signInAs(TECH_A)
    const { error } = await c.rpc('set_incident_parts', {
      p_incident_id: incidentA,
      p_parts: [{ part_id: 8, quantity: 5 }],
    })
    expect(error).toBeNull()
    expect(await partsOf(incidentA)).toEqual([{ part_id: 8, quantity: 5 }])
  })

  it('un set vacío borra todas las piezas', async () => {
    const c = await signInAs(TECH_A)
    const { error } = await c.rpc('set_incident_parts', { p_incident_id: incidentA, p_parts: [] })
    expect(error).toBeNull()
    expect(await partsOf(incidentA)).toEqual([])
  })

  it('el técnico A NO puede tocar las piezas de la incidencia del técnico B', async () => {
    // B registra sus piezas.
    const cb = await signInAs(TECH_B)
    await cb.rpc('set_incident_parts', { p_incident_id: incidentB, p_parts: [{ part_id: 1, quantity: 1 }] })
    expect(await partsOf(incidentB)).toEqual([{ part_id: 1, quantity: 1 }])

    // A intenta sobrescribirlas: la RLS (WITH CHECK por incident_id) lo rechaza
    // y la transacción del RPC revierte, dejando intactas las de B.
    const ca = await signInAs(TECH_A)
    await ca.rpc('set_incident_parts', { p_incident_id: incidentB, p_parts: [{ part_id: 9, quantity: 9 }] })
    expect(await partsOf(incidentB)).toEqual([{ part_id: 1, quantity: 1 }])
  })

  it('el técnico A solo ve las piezas de su incidencia, no las de B', async () => {
    const c = await signInAs(TECH_A)
    const { data: ownB } = await c.from('incident_parts').select('part_id').eq('incident_id', incidentB)
    expect(ownB ?? []).toHaveLength(0)
  })

  it('un usuario anónimo no ve ninguna pieza', async () => {
    const c = anonClient()
    const { data } = await c.from('incident_parts').select('part_id').eq('incident_id', incidentB)
    expect(data ?? []).toHaveLength(0)
  })
})
