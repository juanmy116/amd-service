import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import {
  adminClient, anonClient, signInAs, createUserWithRole, cleanup, ANON_KEY, SERVICE_KEY,
} from './helpers'

// La vista v_machine_parts_history (Fase 1) es security_invoker: debe heredar
// la RLS de las tablas base. Verificamos que el aislamiento por rol se mantiene
// al leer el historial a través de la vista (un técnico no debe ver, vía la
// vista, piezas de incidencias que no tiene asignadas). Supabase LOCAL efímero.

const admin = adminClient()

const TECH_A = 'tech-a@rls.test'
const TECH_B = 'tech-b@rls.test'
const ADMIN  = 'admin@rls.test'
const CLIENT = 'client@rls.test'

const SERIE = 'TEST-SN1'

async function partsViaView(
  client: Awaited<ReturnType<typeof signInAs>> | ReturnType<typeof anonClient>,
): Promise<number[]> {
  const { data } = await client
    .from('v_machine_parts_history').select('part_id').eq('machine_id', SERIE)
  return (data ?? []).map((r) => r.part_id as number).sort((a, b) => a - b)
}

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

  // Pieza 7 (Toner BK) en la incidencia de A; pieza 3 (Tambour BK) en la de B.
  const { error: pErr } = await admin.from('incident_parts').insert([
    { incident_id: incA, part_id: 7, quantity: 2 },
    { incident_id: incB, part_id: 3, quantity: 1 },
  ])
  if (pErr) throw new Error(`seed incident_parts: ${pErr.message}`)
}, 60_000)

afterAll(async () => {
  await cleanup(admin)
})

describe('RLS — v_machine_parts_history (vista unificada)', () => {
  it('el admin ve el historial completo de la máquina (ambas incidencias)', async () => {
    const c = await signInAs(ADMIN)
    expect(await partsViaView(c)).toEqual([3, 7])
  })

  it('el técnico A ve por la vista solo las piezas de SU incidencia', async () => {
    const c = await signInAs(TECH_A)
    expect(await partsViaView(c)).toEqual([7])
  })

  it('el técnico B ve por la vista solo las piezas de SU incidencia', async () => {
    const c = await signInAs(TECH_B)
    expect(await partsViaView(c)).toEqual([3])
  })

  it('el cliente NO ve el desglose de piezas vía la vista (incident_parts es interno de AMD)', async () => {
    // incident_parts no tiene policy de SELECT para clientes (solo admin + técnico).
    // Al ser security_invoker, la vista hereda esa restricción: el cliente no ve filas.
    const c = await signInAs(CLIENT)
    expect(await partsViaView(c)).toEqual([])
  })

  it('un usuario anónimo no ve ninguna fila de la vista', async () => {
    expect(await partsViaView(anonClient())).toEqual([])
  })
})
