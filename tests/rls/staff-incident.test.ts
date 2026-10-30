import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { adminClient, cleanup, URL, ANON_KEY, SERVICE_KEY } from './helpers'
import { seedTenants, SC, type Tenants } from './scenario'

// Averías creadas por el técnico con permiso o por el kiosko (tanda 6,
// `src/lib/staffIncident.server.ts`) contra la BD local real:
// - máquina en contrato ⇒ se cuelga de la línea abierta; en el almacén ⇒ solo `machine_id`;
// - la recogida exige contrato y entra con la categoría `recuperation`;
// - con técnico entra `assigné`, sin él `nouveau`; siempre con su línea de historial;
// - una recogida resuelta se archiva sin encuesta (`sendCsatForIncident`).
//
// `createAdminClient()` lee NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SECRET_KEY: se apuntan AQUÍ al
// Supabase local antes de importar el módulo, para que nunca pueda tocar otra base.

const admin = adminClient()
const STOCK = 'TEST-STAFF-STOCK'
let t: Tenants
let staff: typeof import('@/lib/staffIncident.server')
let csat: typeof import('@/lib/csat.server')
const created: string[] = []

const base = {
  reason: null,
  description: 'Bourrage papier',
  urgent: false,
  assignedTo: null,
  historyComment: 'test',
} as const

beforeAll(async () => {
  if (!ANON_KEY || !SERVICE_KEY) {
    throw new Error('Faltan ANON_KEY/SERVICE_ROLE_KEY. Ejecuta con `supabase start` y exporta las claves.')
  }
  process.env.NEXT_PUBLIC_SUPABASE_URL = URL
  process.env.SUPABASE_SECRET_KEY = SERVICE_KEY
  staff = await import('@/lib/staffIncident.server')
  csat = await import('@/lib/csat.server')
  await cleanup(admin)
  t = await seedTenants(admin)
  const { error } = await admin.from('machines').insert({ numero_serie: STOCK, marque: 'TESTSTAFF', modele: 'S1' })
  if (error) throw new Error(`seed stock: ${error.message}`)
}, 90_000)

afterAll(async () => {
  // Llevan número SAV real (no TEST-), así que `cleanup` no las vería.
  if (created.length > 0) {
    await admin.from('incident_history').delete().in('incident_id', created)
    await admin.from('incidents').delete().in('id', created)
  }
  await cleanup(admin)
})

async function create(input: Parameters<typeof staff.createStaffIncident>[0]) {
  const result = await staff.createStaffIncident(input)
  if ('id' in result) created.push(result.id)
  return result
}

async function read(id: string) {
  const { data } = await admin
    .from('incidents')
    .select('contract_machine_id, machine_id, category, status, priority, opened_by, assigned_to, title')
    .eq('id', id)
    .single()
  return data
}

describe('createStaffIncident', () => {
  it('panne en máquina en contrato ⇒ colgada de la línea, nouveau, sin técnico, con historial', async () => {
    const r = await create({ ...base, serie: SC.snA, kind: 'panne', openedBy: t.techA })
    if (!('id' in r)) throw new Error(r.error)
    expect(r.numeroIncident).toMatch(/^SAV-\d{4}-\d+$/)
    expect(await read(r.id)).toMatchObject({
      contract_machine_id: t.lineAId, machine_id: null, category: 'panne',
      status: 'nouveau', priority: 'normale', opened_by: t.techA, assigned_to: null,
    })
    const { data: history } = await admin.from('incident_history').select('old_status, new_status').eq('incident_id', r.id)
    expect(history).toEqual([{ old_status: null, new_status: 'nouveau' }])
  })

  it('panne en máquina del almacén ⇒ solo machine_id (XOR)', async () => {
    const r = await create({ ...base, serie: STOCK, kind: 'panne', urgent: true, openedBy: t.techA })
    if (!('id' in r)) throw new Error(r.error)
    expect(await read(r.id)).toMatchObject({ contract_machine_id: null, machine_id: STOCK, priority: 'urgente' })
  })

  it('recogida con técnico ⇒ recuperation, assigné, motivo en el título', async () => {
    const r = await create({
      ...base, serie: SC.snA, kind: 'recuperation', reason: 'fin_contrat', description: '',
      openedBy: t.adminUid, assignedTo: t.techA,
    })
    if (!('id' in r)) throw new Error(r.error)
    const row = await read(r.id)
    expect(row).toMatchObject({ category: 'recuperation', status: 'assigné', assigned_to: t.techA })
    expect(row?.title).toContain('Récupération (Fin de contrat)')
  })

  it('recogida de una máquina del almacén ⇒ error, nada creado', async () => {
    const r = await create({ ...base, serie: STOCK, kind: 'recuperation', reason: 'atelier', openedBy: t.adminUid })
    expect(r).toEqual({ error: "Cette machine n'est dans aucun contrat : rien à récupérer." })
  })

  it('recogida resuelta por el técnico ⇒ archivada, sin encuesta al cliente', async () => {
    const r = await create({ ...base, serie: SC.snB, kind: 'recuperation', reason: 'fin_contrat', openedBy: t.adminUid })
    if (!('id' in r)) throw new Error(r.error)
    const { error } = await admin.from('incidents').update({
      status: 'résolu', resolved_via: 'intervention',
      rapport_intervention: 'Machine récupérée.', resolution_note: 'Machine récupérée.',
    }).eq('id', r.id)
    expect(error).toBeNull()

    await csat.sendCsatForIncident(r.id)

    expect((await read(r.id))?.status).toBe('fermé')
    const { data: survey } = await admin.from('csat_responses').select('id').eq('incident_id', r.id)
    expect(survey).toEqual([])
  })

  it('máquina dada de baja ⇒ error', async () => {
    await admin.from('machines').update({ active: false }).eq('numero_serie', STOCK)
    const r = await create({ ...base, serie: STOCK, kind: 'panne', openedBy: t.techA })
    expect(r).toEqual({ error: 'Machine introuvable ou retirée du parc.' })
  })
})
