import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import {
  adminClient, anonClient, signInAs, createUserWithRole, cleanup, ANON_KEY, SERVICE_KEY,
} from './helpers'

// La vista v_machine_parts_history (Fase 1) es security_invoker: debe heredar
// la RLS de las tablas base. Verificamos el aislamiento por rol al leer el
// historial a través de la vista, cubriendo SUS DOS ORÍGENES: averías
// (incident_parts) y mantenimiento (maintenance_parts). Supabase LOCAL efímero.

const admin = adminClient()

const TECH_A = 'tech-a@rls.test'
const TECH_B = 'tech-b@rls.test'
const ADMIN  = 'admin@rls.test'
const CLIENT = 'client@rls.test'

const SERIE = 'TEST-SN1'

type ViewRow = { source: string | null; part_id: number | null }

async function rowsViaView(
  client: Awaited<ReturnType<typeof signInAs>> | ReturnType<typeof anonClient>,
): Promise<ViewRow[]> {
  const { data } = await client
    .from('v_machine_parts_history').select('source, part_id').eq('machine_id', SERIE)
  return (data ?? []) as ViewRow[]
}

const partIds = (rows: ViewRow[]) => rows.map((r) => r.part_id).sort((a, b) => (a ?? 0) - (b ?? 0))

beforeAll(async () => {
  if (!ANON_KEY || !SERVICE_KEY) {
    throw new Error('Faltan ANON_KEY/SERVICE_ROLE_KEY. Ejecuta con `supabase start` y exporta las claves.')
  }
  await cleanup(admin)

  const techA = await createUserWithRole(admin, TECH_A, 'technician')
  const techB = await createUserWithRole(admin, TECH_B, 'technician')
  await createUserWithRole(admin, ADMIN, 'admin')
  const clientUid = await createUserWithRole(admin, CLIENT, 'client')

  const { data: cli, error: cliErr } = await admin
    .from('clients').insert({ nom_client: 'TEST Client' }).select('id').single()
  if (cliErr) throw new Error(`seed client: ${cliErr.message}`)
  const { error: cpErr } = await admin
    .from('client_profiles').insert({ profile_id: clientUid, client_id: cli!.id })
  if (cpErr) throw new Error(`seed client_profiles: ${cpErr.message}`)

  const { data: contract, error: cErr } = await admin
    .from('contracts')
    .insert({ numero_contrat: 'TEST-C1', client_id: cli!.id, date_debut: '2026-01-01', statut: 'actif' })
    .select('id').single()
  if (cErr) throw new Error(`seed contract: ${cErr.message}`)

  const { error: mErr } = await admin
    .from('machines').insert({ numero_serie: SERIE, marque: 'TEST', modele: 'X' })
  if (mErr) throw new Error(`seed machine: ${mErr.message}`)

  const { data: line, error: lErr } = await admin
    .from('contract_machines')
    .insert({ contract_id: contract!.id, machine_id: SERIE, date_debut: '2026-01-01', statut: 'actif' })
    .select('id').single()
  if (lErr) throw new Error(`seed line: ${lErr.message}`)

  const { data: incs, error: iErr } = await admin.from('incidents').insert([
    { numero_incident: 'TEST-I1', title: 'Incident A', contract_machine_id: line!.id, assigned_to: techA },
    { numero_incident: 'TEST-I2', title: 'Incident B', contract_machine_id: line!.id, assigned_to: techB },
  ]).select('id, numero_incident')
  if (iErr) throw new Error(`seed incidents: ${iErr.message}`)
  const incA = incs!.find((i) => i.numero_incident === 'TEST-I1')!.id
  const incB = incs!.find((i) => i.numero_incident === 'TEST-I2')!.id

  // Origen 1 (averías): pieza 7 (Toner BK) en A; pieza 3 (Tambour BK) en B.
  const { error: pErr } = await admin.from('incident_parts').insert([
    { incident_id: incA, part_id: 7, quantity: 2 },
    { incident_id: incB, part_id: 3, quantity: 1 },
  ])
  if (pErr) throw new Error(`seed incident_parts: ${pErr.message}`)

  // Origen 2 (mantenimiento): plan + visita en la misma máquina + pieza 5 (Tambour M).
  // Las FK de mantenimiento son ON DELETE CASCADE → el cleanup las borra al borrar
  // el contrato/línea, sin limpieza explícita.
  const { data: plan, error: plErr } = await admin.from('maintenance_plans')
    .insert({ contract_id: contract!.id, frequency: 'mensuel' }).select('id').single()
  if (plErr) throw new Error(`seed plan: ${plErr.message}`)
  const { data: visit, error: vErr } = await admin.from('maintenance_visits')
    .insert({ plan_id: plan!.id, contract_machine_id: line!.id, scheduled_date: '2026-05-01' })
    .select('id').single()
  if (vErr) throw new Error(`seed visit: ${vErr.message}`)
  const { error: mpErr } = await admin.from('maintenance_parts')
    .insert({ visit_id: visit!.id, part_id: 5, quantity: 1 })
  if (mpErr) throw new Error(`seed maintenance_parts: ${mpErr.message}`)
}, 60_000)

afterAll(async () => {
  await cleanup(admin)
})

describe('RLS — v_machine_parts_history (vista unificada)', () => {
  it('el admin ve el historial completo: averías (3, 7) + mantenimiento (5)', async () => {
    const c = await signInAs(ADMIN)
    expect(partIds(await rowsViaView(c))).toEqual([3, 5, 7])
  })

  it('el admin ve la pieza del origen mantenimiento vía la vista', async () => {
    const c = await signInAs(ADMIN)
    const maint = (await rowsViaView(c)).filter((r) => r.source === 'maintenance')
    expect(maint.map((r) => r.part_id)).toEqual([5])
  })

  it('el técnico A ve por la vista su pieza de avería (7), no la de B (3)', async () => {
    const ids = partIds(await rowsViaView(await signInAs(TECH_A)))
    expect(ids).toContain(7)
    expect(ids).not.toContain(3)
  })

  it('el técnico B ve por la vista su pieza de avería (3), no la de A (7)', async () => {
    const ids = partIds(await rowsViaView(await signInAs(TECH_B)))
    expect(ids).toContain(3)
    expect(ids).not.toContain(7)
  })

  it('el cliente NO ve el desglose de piezas vía la vista (ni averías ni mantenimiento: es interno de AMD)', async () => {
    // Ni incident_parts ni maintenance_parts/visits tienen policy SELECT para clientes.
    // Al ser security_invoker, la vista hereda esa restricción → 0 filas.
    expect(await rowsViaView(await signInAs(CLIENT))).toEqual([])
  })

  it('un usuario anónimo no ve ninguna fila de la vista', async () => {
    expect(await rowsViaView(anonClient())).toEqual([])
  })
})
