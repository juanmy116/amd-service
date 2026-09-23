import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { adminClient, signInAs, cleanup, ANON_KEY, SERVICE_KEY } from './helpers'
import { expectEmpty } from './assert'
import { seedTenants, SC, type Tenants } from './scenario'

// Una visita de mantenimiento ASIGNADA cuenta como trabajo asignado (migración
// 20260923100000): el técnico con una visita en una máquina donde NO tiene ninguna
// incidencia ve su línea, la máquina, el contrato y el cliente — lo que necesitan
// /tech/planning y la agenda para pintar la visita. Otro técnico sin visita ni
// incidencia ahí no ve nada de eso.
//
// Grafo propio (además del escenario base):
//   Cliente V ── contrato V ── máquina V (línea V activa)
//   1 plan + 1 visita en la línea V, asignada al técnico A. SIN incidencias en V.

const admin = adminClient()
let t: Tenants
const SN_V = 'TEST-SN-V'
let clientVId: number
let contractVId: string
let lineVId: string

beforeAll(async () => {
  if (!ANON_KEY || !SERVICE_KEY) {
    throw new Error('Faltan ANON_KEY/SERVICE_ROLE_KEY. Ejecuta con `supabase start` y exporta las claves.')
  }
  await cleanup(admin)
  t = await seedTenants(admin)

  const { data: cli, error: cErr } = await admin.from('clients')
    .insert({ nom_client: 'TEST Client V' }).select('id').single()
  if (cErr) throw new Error(`seed client V: ${cErr.message}`)
  clientVId = cli!.id as number

  const { error: mErr } = await admin.from('machines')
    .insert({ numero_serie: SN_V, marque: 'TEST', modele: 'X', type: 'color' })
  if (mErr) throw new Error(`seed machine V: ${mErr.message}`)

  const { data: contract, error: kErr } = await admin.from('contracts')
    .insert({ numero_contrat: 'TEST-C-V', client_id: clientVId, date_debut: '2026-01-01', statut: 'actif' })
    .select('id').single()
  if (kErr) throw new Error(`seed contract V: ${kErr.message}`)
  contractVId = contract!.id as string

  const { data: line, error: lErr } = await admin.from('contract_machines')
    .insert({ contract_id: contractVId, machine_id: SN_V, date_debut: '2026-01-01', statut: 'actif' })
    .select('id').single()
  if (lErr) throw new Error(`seed line V: ${lErr.message}`)
  lineVId = line!.id as string

  const { data: plan, error: pErr } = await admin.from('maintenance_plans')
    .insert({ contract_id: contractVId, frequency: 'mensuel' }).select('id').single()
  if (pErr) throw new Error(`seed plan V: ${pErr.message}`)

  const { error: vErr } = await admin.from('maintenance_visits')
    .insert({ plan_id: plan!.id, contract_machine_id: lineVId, scheduled_date: '2026-07-10', assigned_to: t.techA })
  if (vErr) throw new Error(`seed visit V: ${vErr.message}`)
}, 90_000)

afterAll(async () => {
  await cleanup(admin)
})

describe('RLS — la visita asignada da visibilidad sobre su máquina, contrato y cliente', () => {
  it('el técnico A ve la línea de su visita (sin incidencia ahí)', async () => {
    const c = await signInAs(SC.techAEmail)
    const { data, error } = await c.from('contract_machines').select('id').eq('id', lineVId)
    expect(error).toBeNull()
    expect((data ?? []).map((x) => x.id)).toEqual([lineVId])
  })

  it('el técnico A ve la máquina de su visita', async () => {
    const c = await signInAs(SC.techAEmail)
    const { data, error } = await c.from('machines').select('numero_serie').eq('numero_serie', SN_V)
    expect(error).toBeNull()
    expect((data ?? []).map((x) => x.numero_serie)).toEqual([SN_V])
  })

  it('el técnico A ve el contrato de su visita', async () => {
    const c = await signInAs(SC.techAEmail)
    const { data, error } = await c.from('contracts').select('id').eq('id', contractVId)
    expect(error).toBeNull()
    expect((data ?? []).map((x) => x.id)).toEqual([contractVId])
  })

  it('el técnico A ve el cliente de su visita', async () => {
    const c = await signInAs(SC.techAEmail)
    const { data, error } = await c.from('clients').select('id').eq('id', clientVId)
    expect(error).toBeNull()
    expect((data ?? []).map((x) => x.id)).toEqual([clientVId])
  })

  it('la rama de incidencias sigue igual: el técnico A ve su máquina A y no la B', async () => {
    const c = await signInAs(SC.techAEmail)
    const { data, error } = await c.from('machines').select('numero_serie').in('numero_serie', [SC.snA, SC.snB])
    expect(error).toBeNull()
    const sns = (data ?? []).map((x) => x.numero_serie)
    expect(sns).toContain(SC.snA)
    expect(sns).not.toContain(SC.snB)
  })

  it('el técnico B (sin visita ni incidencia en V) no ve la línea V', async () => {
    const c = await signInAs(SC.techBEmail)
    expectEmpty(await c.from('contract_machines').select('id').eq('id', lineVId))
  })

  it('el técnico B no ve la máquina V', async () => {
    const c = await signInAs(SC.techBEmail)
    expectEmpty(await c.from('machines').select('numero_serie').eq('numero_serie', SN_V))
  })

  it('el técnico B no ve el contrato V', async () => {
    const c = await signInAs(SC.techBEmail)
    expectEmpty(await c.from('contracts').select('id').eq('id', contractVId))
  })

  it('el técnico B no ve el cliente V', async () => {
    const c = await signInAs(SC.techBEmail)
    expectEmpty(await c.from('clients').select('id').eq('id', clientVId))
  })
})
