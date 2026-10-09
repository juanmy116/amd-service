import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { adminClient, signInAs, cleanup, ANON_KEY, SERVICE_KEY } from './helpers'
import { seedTenants, SC, type Tenants } from './scenario'

// F3 (escaneo de seguridad 2026-09-29, migración 20261009120000): un cliente del portal solo crea
// averías como las crea el portal: nuevas, sin técnico, sin resolución y abiertas por él mismo
// (o sin `opened_by`). Antes la política solo miraba que la línea fuese suya: el cliente podía
// asignarse la avería y heredar las políticas de técnico (assigned_to = auth.uid()) sobre esa
// máquina, sus visitas, su contrato y su ficha. Corre contra Supabase LOCAL efímero.

const admin = adminClient()
let t: Tenants
let n = 0

function incident(extra: Record<string, unknown> = {}) {
  n += 1
  return { numero_incident: `TEST-F3-${n}`, title: 'TEST F3', contract_machine_id: t.lineAId, ...extra }
}

async function exists(numero: string): Promise<boolean> {
  const { data } = await admin.from('incidents').select('id').eq('numero_incident', numero)
  return (data ?? []).length > 0
}

beforeAll(async () => {
  if (!ANON_KEY || !SERVICE_KEY) {
    throw new Error('Faltan ANON_KEY/SERVICE_ROLE_KEY. Ejecuta con `supabase start` y exporta las claves.')
  }
  await cleanup(admin)
  t = await seedTenants(admin)
}, 60_000)

afterAll(async () => {
  await cleanup(admin)
})

describe('F3 — el cliente crea averías solo como el portal', () => {
  it('crea una avería como lo hace el portal', async () => {
    const c = await signInAs(SC.clientAEmail)
    const row = incident({ machine_id: null, source: null, category: 'autre', priority: 'normale', status: 'nouveau', opened_by: t.clientAUid })
    const { error } = await c.from('incidents').insert(row)
    expect(error).toBeNull()
    expect(await exists(row.numero_incident)).toBe(true)
  })

  it('crea una avería sin opened_by (los valores por defecto bastan)', async () => {
    const c = await signInAs(SC.clientAEmail)
    const row = incident()
    const { error } = await c.from('incidents').insert(row)
    expect(error).toBeNull()
    expect(await exists(row.numero_incident)).toBe(true)
  })

  it('no puede asignarse la avería a sí mismo', async () => {
    const c = await signInAs(SC.clientAEmail)
    const row = incident({ assigned_to: t.clientAUid })
    const { error } = await c.from('incidents').insert(row)
    expect(error).not.toBeNull()
    expect(await exists(row.numero_incident)).toBe(false)
  })

  it('no puede asignarla a un técnico', async () => {
    const c = await signInAs(SC.clientAEmail)
    const row = incident({ assigned_to: t.techA })
    const { error } = await c.from('incidents').insert(row)
    expect(error).not.toBeNull()
    expect(await exists(row.numero_incident)).toBe(false)
  })

  it('no puede crearla en otro estado que «nouveau»', async () => {
    const c = await signInAs(SC.clientAEmail)
    const row = incident({ status: 'en_cours' })
    const { error } = await c.from('incidents').insert(row)
    expect(error).not.toBeNull()
    expect(await exists(row.numero_incident)).toBe(false)
  })

  it('no puede crearla ya resuelta', async () => {
    const c = await signInAs(SC.clientAEmail)
    const row = incident({
      status: 'fermé', resolved_via: 'bureau', resolution_reason: 'doublon',
      resolution_note: 'TEST', closed_at: new Date().toISOString(),
    })
    const { error } = await c.from('incidents').insert(row)
    expect(error).not.toBeNull()
    expect(await exists(row.numero_incident)).toBe(false)
  })

  it('no puede firmarla en nombre de otro usuario', async () => {
    const c = await signInAs(SC.clientAEmail)
    const row = incident({ opened_by: t.clientBUid })
    const { error } = await c.from('incidents').insert(row)
    expect(error).not.toBeNull()
    expect(await exists(row.numero_incident)).toBe(false)
  })

  it('sigue sin poder crearla en la línea de otro cliente', async () => {
    const c = await signInAs(SC.clientAEmail)
    const row = incident({ contract_machine_id: t.lineBId })
    const { error } = await c.from('incidents').insert(row)
    expect(error).not.toBeNull()
    expect(await exists(row.numero_incident)).toBe(false)
  })
})
