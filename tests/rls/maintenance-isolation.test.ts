import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { adminClient, anonClient, signInAs, cleanup, ANON_KEY, SERVICE_KEY } from './helpers'
import { expectEmpty } from './assert'
import { seedTenants, SC, type Tenants } from './scenario'

// Aislamiento RLS de MANTENIMIENTO.
//   maintenance_visits: aisladas por técnico. auth_tech_visit_ids() = "asignadas a mí
//     (assigned_to) O en una máquina donde tengo trabajo asignado". Antes de la tarea 7
//     (migración 20260611150000) un técnico veía las de TODOS — esto es la red contra
//     esa regresión, y prueba LAS DOS ramas (asignación directa y por máquina).
//   maintenance_plans: NO están aislados por técnico — CUALQUIER técnico ve TODOS los
//     planes (tech_read_plans filtra solo por role='technician'). El cliente no ve
//     mantenimiento (no hay policy de cliente en ninguna de las dos tablas).

const admin = adminClient()
let t: Tenants
let visitBId: string
let visitCId: string // en la máquina A (de techA) pero asignada a techB → rama "por máquina"

beforeAll(async () => {
  if (!ANON_KEY || !SERVICE_KEY) {
    throw new Error('Faltan ANON_KEY/SERVICE_ROLE_KEY. Ejecuta con `supabase start` y exporta las claves.')
  }
  await cleanup(admin)
  t = await seedTenants(admin)

  // Segunda visita: contrato B (máquina B), asignada al técnico B. El técnico A
  // no debe verla y el técnico B no debe ver la visita A del escenario base.
  const { data: planB, error: pErr } = await admin.from('maintenance_plans')
    .insert({ contract_id: t.contractBId, frequency: 'mensuel' }).select('id').single()
  if (pErr) throw new Error(`seed plan B: ${pErr.message}`)
  const { data: visitB, error: vErr } = await admin.from('maintenance_visits')
    .insert({ plan_id: planB!.id, contract_machine_id: t.lineBId, scheduled_date: '2026-07-02', assigned_to: t.techB })
    .select('id').single()
  if (vErr) throw new Error(`seed visit B: ${vErr.message}`)
  visitBId = visitB!.id as string

  // Tercera visita: en la máquina A (donde techA tiene trabajo asignado) pero asignada
  // a techB. techA debe verla por la rama "por máquina" de auth_tech_visit_ids, aunque
  // no sea suya. Ejercita el clause (b) que la migración 20260611150000 añadió.
  const { data: visitC, error: vcErr } = await admin.from('maintenance_visits')
    .insert({ plan_id: t.planAId, contract_machine_id: t.lineAId, scheduled_date: '2026-07-03', assigned_to: t.techB })
    .select('id').single()
  if (vcErr) throw new Error(`seed visit C: ${vcErr.message}`)
  visitCId = visitC!.id as string
}, 90_000)

afterAll(async () => {
  await cleanup(admin)
})

describe('RLS mantenimiento — maintenance_visits', () => {
  it('el técnico A ve SU visita (A), no la del técnico B', async () => {
    const c = await signInAs(SC.techAEmail)
    const { data } = await c.from('maintenance_visits').select('id').in('id', [t.visitAId, visitBId])
    const ids = (data ?? []).map((x) => x.id)
    expect(ids).toContain(t.visitAId)
    expect(ids).not.toContain(visitBId)
  })

  it('el técnico B ve SU visita (B), no la del técnico A', async () => {
    const c = await signInAs(SC.techBEmail)
    const { data } = await c.from('maintenance_visits').select('id').in('id', [t.visitAId, visitBId])
    const ids = (data ?? []).map((x) => x.id)
    expect(ids).toContain(visitBId)
    expect(ids).not.toContain(t.visitAId)
  })

  it('el técnico A ve una visita en SU máquina aunque esté asignada a otro (rama "por máquina")', async () => {
    const c = await signInAs(SC.techAEmail)
    const { data, error } = await c.from('maintenance_visits').select('id').in('id', [visitCId, visitBId])
    expect(error).toBeNull()
    const ids = (data ?? []).map((x) => x.id)
    expect(ids).toContain(visitCId)      // máquina A = máquina de techA → la ve
    expect(ids).not.toContain(visitBId)  // máquina B no es suya → no la ve
  })

  it('el cliente A no ve ninguna visita de mantenimiento', async () => {
    const c = await signInAs(SC.clientAEmail)
    expectEmpty(await c.from('maintenance_visits').select('id').in('id', [t.visitAId, visitBId]))
  })

  it('el admin ve ambas visitas', async () => {
    const c = await signInAs(SC.adminEmail)
    const { data } = await c.from('maintenance_visits').select('id').in('id', [t.visitAId, visitBId])
    expect((data ?? []).map((x) => x.id)).toEqual(expect.arrayContaining([t.visitAId, visitBId]))
  })

  it('el anónimo no ve ninguna visita', async () => {
    const { data } = await anonClient().from('maintenance_visits').select('id').in('id', [t.visitAId, visitBId])
    expect(data ?? []).toHaveLength(0)
  })

  // Control positivo: el técnico A SÍ puede actualizar su propia visita. Sin esto, el
  // test de bloqueo de abajo podría pasar trivialmente (p.ej. si NADIE pudiera escribir).
  it('el técnico A SÍ puede actualizar su propia visita', async () => {
    const c = await signInAs(SC.techAEmail)
    await c.from('maintenance_visits').update({ notes: 'fait par A' }).eq('id', t.visitAId)
    const { data } = await admin.from('maintenance_visits').select('notes').eq('id', t.visitAId).single()
    expect(data?.notes).toBe('fait par A')
  })

  it('el técnico B NO puede actualizar la visita del técnico A', async () => {
    const c = await signInAs(SC.techBEmail)
    await c.from('maintenance_visits').update({ notes: 'hijacked' }).eq('id', t.visitAId)
    const { data } = await admin.from('maintenance_visits').select('notes').eq('id', t.visitAId).single()
    expect(data?.notes).not.toBe('hijacked')
  })
})

describe('RLS mantenimiento — maintenance_plans', () => {
  it('el cliente A no ve los planes de mantenimiento', async () => {
    const c = await signInAs(SC.clientAEmail)
    expectEmpty(await c.from('maintenance_plans').select('id').in('id', [t.planAId]))
  })

  it('el técnico A ve los planes (NO están aislados por técnico)', async () => {
    const c = await signInAs(SC.techAEmail)
    const { data, error } = await c.from('maintenance_plans').select('id').eq('id', t.planAId)
    expect(error).toBeNull()
    expect((data ?? []).length).toBe(1)
  })

  it('el admin ve el plan del contrato A', async () => {
    const c = await signInAs(SC.adminEmail)
    const { data } = await c.from('maintenance_plans').select('id').eq('id', t.planAId)
    expect((data ?? []).length).toBe(1)
  })
})
