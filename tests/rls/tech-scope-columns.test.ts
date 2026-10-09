import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { adminClient, signInAs, cleanup, ANON_KEY, SERVICE_KEY } from './helpers'
import { seedTenants, SC, type Tenants } from './scenario'

// F2 (escaneo de seguridad 2026-09-29, migración 20261009100000): un técnico no puede cambiar
// las columnas de las que sale su propio alcance RLS. Antes, el asignado de una avería podía
// apuntarla a otra máquina (o mover su visita a otra línea) y las funciones auth_tech_* le
// abrían esa máquina, sus visitas, su contrato y la ficha de su cliente. La oficina y
// service_role (taller, Server Actions) siguen pudiendo mover y reasignar.
// Corre contra Supabase LOCAL efímero.

const admin = adminClient()

let t: Tenants
let incidentAId: string

async function incidentA() {
  const { data } = await admin.from('incidents')
    .select('contract_machine_id, machine_id, assigned_to, status').eq('id', incidentAId).single()
  return data!
}

async function visitA() {
  const { data } = await admin.from('maintenance_visits')
    .select('contract_machine_id, assigned_to').eq('id', t.visitAId).single()
  return data!
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

describe('F2 — el técnico no puede ampliar su propio alcance', () => {
  it('el técnico sigue pudiendo trabajar su avería (estado, informe)', async () => {
    const c = await signInAs(SC.techAEmail)
    const { error } = await c.from('incidents')
      .update({ status: 'en_cours', rapport_intervention: 'TEST en curso', assigned_to: t.techA })
      .eq('id', incidentAId)
    expect(error).toBeNull()
    expect((await incidentA()).status).toBe('en_cours')
  })

  it('no puede apuntar su avería a la línea de otro cliente', async () => {
    const c = await signInAs(SC.techAEmail)
    const { error } = await c.from('incidents')
      .update({ contract_machine_id: t.lineBId }).eq('id', incidentAId)
    expect(error?.code).toBe('42501')
    expect((await incidentA()).contract_machine_id).toBe(t.lineAId)
  })

  it('no puede pasar su avería a otra máquina por número de serie', async () => {
    const c = await signInAs(SC.techAEmail)
    const { error } = await c.from('incidents')
      .update({ contract_machine_id: null, machine_id: SC.snB }).eq('id', incidentAId)
    expect(error?.code).toBe('42501')
    const row = await incidentA()
    expect(row.contract_machine_id).toBe(t.lineAId)
    expect(row.machine_id).toBeNull()
  })

  it('no puede mover su visita de mantenimiento a la línea de otro cliente', async () => {
    const c = await signInAs(SC.techAEmail)
    const { error } = await c.from('maintenance_visits')
      .update({ contract_machine_id: t.lineBId }).eq('id', t.visitAId)
    expect(error?.code).toBe('42501')
    expect((await visitA()).contract_machine_id).toBe(t.lineAId)
  })

  it('no puede reasignar una visita', async () => {
    const c = await signInAs(SC.techAEmail)
    const { error } = await c.from('maintenance_visits')
      .update({ assigned_to: t.techB }).eq('id', t.visitAId)
    expect(error?.code).toBe('42501')
    expect((await visitA()).assigned_to).toBe(t.techA)
  })

  it('tras los intentos, la máquina B sigue fuera de su alcance', async () => {
    const c = await signInAs(SC.techAEmail)
    const { data } = await c.from('contract_machines').select('id').eq('id', t.lineBId)
    expect(data ?? []).toHaveLength(0)
  })

  it('la oficina sigue pudiendo mover y reasignar', async () => {
    const c = await signInAs(SC.adminEmail)
    const moved = await c.from('incidents')
      .update({ contract_machine_id: t.lineBId, assigned_to: t.techB }).eq('id', incidentAId)
    expect(moved.error).toBeNull()
    const back = await c.from('incidents')
      .update({ contract_machine_id: t.lineAId, assigned_to: t.techA }).eq('id', incidentAId)
    expect(back.error).toBeNull()
    const visit = await c.from('maintenance_visits')
      .update({ assigned_to: t.techB }).eq('id', t.visitAId)
    expect(visit.error).toBeNull()
    expect((await visitA()).assigned_to).toBe(t.techB)
  })

  it('service_role (taller, Server Actions) sigue pudiendo reasignar', async () => {
    const inc = await admin.from('incidents').update({ assigned_to: t.techB }).eq('id', incidentAId)
    expect(inc.error).toBeNull()
    const visit = await admin.from('maintenance_visits').update({ assigned_to: t.techA }).eq('id', t.visitAId)
    expect(visit.error).toBeNull()
    expect((await incidentA()).assigned_to).toBe(t.techB)
    expect((await visitA()).assigned_to).toBe(t.techA)
  })
})
