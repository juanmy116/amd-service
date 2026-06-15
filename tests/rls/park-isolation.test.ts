import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { adminClient, anonClient, signInAs, cleanup, ANON_KEY, SERVICE_KEY } from './helpers'
import { seedTenants, SC, type Tenants } from './scenario'

// Aislamiento RLS del PARQUE: machines, contracts, contract_machines, clients,
// machine_counters. La propiedad crítica multi-inquilino: un cliente solo ve SU
// parque (nunca el de otro cliente), y un técnico solo ve las máquinas/contratos
// de su trabajo asignado. clients y machine_counters son admin-only.

const admin = adminClient()
let t: Tenants

beforeAll(async () => {
  if (!ANON_KEY || !SERVICE_KEY) {
    throw new Error('Faltan ANON_KEY/SERVICE_ROLE_KEY. Ejecuta con `supabase start` y exporta las claves.')
  }
  await cleanup(admin)
  t = await seedTenants(admin)

  // Un contador en la máquina A (tabla admin-only) para probar su aislamiento.
  const { error } = await admin.from('machine_counters').insert({
    machine_id: SC.snA, year: 2026, month: 6, counter_bw: 100, counter_color: 50,
  })
  if (error) throw new Error(`seed counter: ${error.message}`)
}, 90_000)

afterAll(async () => {
  await cleanup(admin)
})

describe('RLS parque — machines', () => {
  it('el cliente A ve SOLO su máquina (no la del cliente B)', async () => {
    const c = await signInAs(SC.clientAEmail)
    const { data } = await c.from('machines').select('numero_serie').like('numero_serie', 'TEST-%')
    const sns = (data ?? []).map((m) => m.numero_serie)
    expect(sns).toContain(SC.snA)
    expect(sns).not.toContain(SC.snB)
  })

  it('el técnico A ve la máquina de su incidencia asignada (A), no la B', async () => {
    const c = await signInAs(SC.techAEmail)
    const { data } = await c.from('machines').select('numero_serie').like('numero_serie', 'TEST-%')
    const sns = (data ?? []).map((m) => m.numero_serie)
    expect(sns).toContain(SC.snA)
    expect(sns).not.toContain(SC.snB)
  })

  it('el técnico B (sin trabajo asignado) no ve ninguna máquina de prueba', async () => {
    const c = await signInAs(SC.techBEmail)
    const { data } = await c.from('machines').select('numero_serie').like('numero_serie', 'TEST-%')
    expect(data ?? []).toHaveLength(0)
  })

  it('el admin ve ambas máquinas', async () => {
    const c = await signInAs(SC.adminEmail)
    const { data } = await c.from('machines').select('numero_serie').like('numero_serie', 'TEST-%')
    const sns = (data ?? []).map((m) => m.numero_serie)
    expect(sns).toEqual(expect.arrayContaining([SC.snA, SC.snB]))
  })

  it('el anónimo no ve ninguna máquina', async () => {
    const { data } = await anonClient().from('machines').select('numero_serie').like('numero_serie', 'TEST-%')
    expect(data ?? []).toHaveLength(0)
  })

  it('el cliente A NO puede crear una máquina (escritura admin-only)', async () => {
    const c = await signInAs(SC.clientAEmail)
    await c.from('machines').insert({ numero_serie: 'TEST-SN-HACK', marque: 'X', modele: 'Y', type: 'color' })
    const { data } = await admin.from('machines').select('numero_serie').eq('numero_serie', 'TEST-SN-HACK')
    expect(data ?? []).toHaveLength(0)
  })
})

describe('RLS parque — contracts', () => {
  it('el cliente A ve SOLO su contrato', async () => {
    const c = await signInAs(SC.clientAEmail)
    const { data } = await c.from('contracts').select('numero_contrat').like('numero_contrat', 'TEST-%')
    const nums = (data ?? []).map((x) => x.numero_contrat)
    expect(nums).toContain(SC.contractNumA)
    expect(nums).not.toContain(SC.contractNumB)
  })

  it('el técnico A ve el contrato de su incidencia (A), no el B', async () => {
    const c = await signInAs(SC.techAEmail)
    const { data } = await c.from('contracts').select('numero_contrat').like('numero_contrat', 'TEST-%')
    const nums = (data ?? []).map((x) => x.numero_contrat)
    expect(nums).toContain(SC.contractNumA)
    expect(nums).not.toContain(SC.contractNumB)
  })

  it('el admin ve ambos contratos', async () => {
    const c = await signInAs(SC.adminEmail)
    const { data } = await c.from('contracts').select('numero_contrat').like('numero_contrat', 'TEST-%')
    const nums = (data ?? []).map((x) => x.numero_contrat)
    expect(nums).toEqual(expect.arrayContaining([SC.contractNumA, SC.contractNumB]))
  })
})

describe('RLS parque — contract_machines', () => {
  it('el cliente A ve SOLO su línea de contrato', async () => {
    const c = await signInAs(SC.clientAEmail)
    const { data } = await c.from('contract_machines').select('id').in('id', [t.lineAId, t.lineBId])
    const ids = (data ?? []).map((x) => x.id)
    expect(ids).toContain(t.lineAId)
    expect(ids).not.toContain(t.lineBId)
  })

  it('el técnico A ve la línea de su máquina asignada (A), no la B', async () => {
    const c = await signInAs(SC.techAEmail)
    const { data } = await c.from('contract_machines').select('id').in('id', [t.lineAId, t.lineBId])
    const ids = (data ?? []).map((x) => x.id)
    expect(ids).toContain(t.lineAId)
    expect(ids).not.toContain(t.lineBId)
  })
})

describe('RLS parque — clients', () => {
  // El cliente ve SU propia ficha de empresa (client_own_client_select); el técnico
  // ve las de su trabajo asignado (tech_clients_select). Nunca las de otro inquilino.
  it('el cliente A ve SOLO su propia ficha de cliente (no la del cliente B)', async () => {
    const c = await signInAs(SC.clientAEmail)
    const { data } = await c.from('clients').select('id').in('id', [t.clientAId, t.clientBId])
    const ids = (data ?? []).map((x) => x.id)
    expect(ids).toContain(t.clientAId)
    expect(ids).not.toContain(t.clientBId)
  })

  it('el técnico A ve el cliente de su trabajo asignado (A), no el B', async () => {
    const c = await signInAs(SC.techAEmail)
    const { data } = await c.from('clients').select('id').in('id', [t.clientAId, t.clientBId])
    const ids = (data ?? []).map((x) => x.id)
    expect(ids).toContain(t.clientAId)
    expect(ids).not.toContain(t.clientBId)
  })

  it('el anónimo no ve ningún cliente', async () => {
    const { data } = await anonClient().from('clients').select('id').in('id', [t.clientAId, t.clientBId])
    expect(data ?? []).toHaveLength(0)
  })

  it('el admin ve ambos clientes', async () => {
    const c = await signInAs(SC.adminEmail)
    const { data } = await c.from('clients').select('id').in('id', [t.clientAId, t.clientBId])
    const ids = (data ?? []).map((x) => x.id)
    expect(ids).toEqual(expect.arrayContaining([t.clientAId, t.clientBId]))
  })
})

describe('RLS parque — machine_counters (admin-only)', () => {
  it('el cliente A no ve los contadores de su propia máquina', async () => {
    const c = await signInAs(SC.clientAEmail)
    const { data } = await c.from('machine_counters').select('id').eq('machine_id', SC.snA)
    expect(data ?? []).toHaveLength(0)
  })

  it('el técnico A no ve los contadores', async () => {
    const c = await signInAs(SC.techAEmail)
    const { data } = await c.from('machine_counters').select('id').eq('machine_id', SC.snA)
    expect(data ?? []).toHaveLength(0)
  })

  it('el admin ve los contadores', async () => {
    const c = await signInAs(SC.adminEmail)
    const { data } = await c.from('machine_counters').select('id').eq('machine_id', SC.snA)
    expect((data ?? []).length).toBeGreaterThanOrEqual(1)
  })
})
