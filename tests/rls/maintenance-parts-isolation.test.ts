import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { adminClient, signInAs, cleanup, ANON_KEY, SERVICE_KEY } from './helpers'
import { seedTenants, SC, type Tenants } from './scenario'

// F8 (escaneo de seguridad 2026-09-29, migración 20261009110000): las piezas de mantenimiento
// y los planes se aíslan por técnico con el mismo alcance que sus visitas
// (auth_tech_visit_ids). Antes bastaba con ser técnico para leer las piezas de TODAS las
// visitas, añadirlas a cualquiera (falseando el historial de piezas y el agente de anomalías)
// y leer todos los planes. La app no usa estas tablas con la sesión del técnico: cierra las
// visitas con la RPC close_maintenance_visit (service_role). Corre contra Supabase LOCAL efímero.

const admin = adminClient()
let t: Tenants
let planBId: string
let visitBId: string

async function partsOf(visitId: string): Promise<number[]> {
  const { data } = await admin.from('maintenance_parts').select('part_id').eq('visit_id', visitId)
  return (data ?? []).map((p) => p.part_id as number)
}

beforeAll(async () => {
  if (!ANON_KEY || !SERVICE_KEY) {
    throw new Error('Faltan ANON_KEY/SERVICE_ROLE_KEY. Ejecuta con `supabase start` y exporta las claves.')
  }
  await cleanup(admin)
  t = await seedTenants(admin)

  // Contrato B: plan + visita asignada al técnico B, con una pieza ya puesta.
  const { data: planB, error: pErr } = await admin.from('maintenance_plans')
    .insert({ contract_id: t.contractBId, frequency: 'mensuel' }).select('id').single()
  if (pErr) throw new Error(`seed plan B: ${pErr.message}`)
  planBId = planB!.id as string
  const { data: visitB, error: vErr } = await admin.from('maintenance_visits')
    .insert({ plan_id: planBId, contract_machine_id: t.lineBId, scheduled_date: '2026-07-02', assigned_to: t.techB })
    .select('id').single()
  if (vErr) throw new Error(`seed visit B: ${vErr.message}`)
  visitBId = visitB!.id as string

  for (const visit_id of [t.visitAId, visitBId]) {
    const { error } = await admin.from('maintenance_parts').insert({ visit_id, part_id: 5, quantity: 1 })
    if (error) throw new Error(`seed maintenance_parts: ${error.message}`)
  }
}, 60_000)

afterAll(async () => {
  await cleanup(admin)
})

describe('F8 — piezas de mantenimiento aisladas por técnico', () => {
  it('el técnico A lee las piezas de su visita, no las de la visita de B', async () => {
    const c = await signInAs(SC.techAEmail)
    const { data, error } = await c.from('maintenance_parts').select('visit_id')
    expect(error).toBeNull()
    const visits = (data ?? []).map((p) => p.visit_id)
    expect(visits).toContain(t.visitAId)
    expect(visits).not.toContain(visitBId)
  })

  it('el técnico A no puede añadir piezas a la visita del técnico B', async () => {
    const c = await signInAs(SC.techAEmail)
    const { error } = await c.from('maintenance_parts').insert({ visit_id: visitBId, part_id: 7, quantity: 1 })
    expect(error).not.toBeNull()
    expect(await partsOf(visitBId)).toEqual([5])
  })

  it('el técnico A sigue pudiendo añadir piezas a su propia visita', async () => {
    const c = await signInAs(SC.techAEmail)
    const { error } = await c.from('maintenance_parts').insert({ visit_id: t.visitAId, part_id: 7, quantity: 1 })
    expect(error).toBeNull()
    expect(await partsOf(t.visitAId)).toEqual(expect.arrayContaining([5, 7]))
  })

  it('el técnico A ve el plan de su visita, no el del contrato B', async () => {
    const c = await signInAs(SC.techAEmail)
    const { data } = await c.from('maintenance_plans').select('id').in('id', [t.planAId, planBId])
    const ids = (data ?? []).map((p) => p.id)
    expect(ids).toContain(t.planAId)
    expect(ids).not.toContain(planBId)
  })

  it('el cliente no ve piezas ni planes, ni puede añadir piezas', async () => {
    const c = await signInAs(SC.clientAEmail)
    const parts = await c.from('maintenance_parts').select('id')
    expect(parts.data ?? []).toHaveLength(0)
    const plans = await c.from('maintenance_plans').select('id')
    expect(plans.data ?? []).toHaveLength(0)
    const { error } = await c.from('maintenance_parts').insert({ visit_id: t.visitAId, part_id: 7, quantity: 1 })
    expect(error).not.toBeNull()
  })

  it('la oficina ve todas las piezas y todos los planes', async () => {
    const c = await signInAs(SC.adminEmail)
    const parts = await c.from('maintenance_parts').select('visit_id').in('visit_id', [t.visitAId, visitBId])
    expect(new Set((parts.data ?? []).map((p) => p.visit_id))).toEqual(new Set([t.visitAId, visitBId]))
    const plans = await c.from('maintenance_plans').select('id').in('id', [t.planAId, planBId])
    expect(plans.data ?? []).toHaveLength(2)
  })
})
