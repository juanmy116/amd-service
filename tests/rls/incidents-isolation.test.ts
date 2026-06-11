import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import {
  adminClient, anonClient, signInAs, createUserWithRole, cleanup, ANON_KEY, SERVICE_KEY,
} from './helpers'

// Tests de aislamiento RLS por rol (Fase 2). Corren contra un Supabase LOCAL
// efímero (`supabase start`), NO contra producción. Es la red que protege la
// propiedad crítica de seguridad: cada rol ve solo lo suyo. Los 4 bugs de
// incidencias de junio vivían justo en esta capa.

const admin = adminClient()

const TECH_A = 'tech-a@rls.test'
const TECH_B = 'tech-b@rls.test'
const ADMIN  = 'admin@rls.test'
const CLIENT = 'client@rls.test'

let lineId: string

beforeAll(async () => {
  if (!ANON_KEY || !SERVICE_KEY) {
    throw new Error('Faltan ANON_KEY/SERVICE_ROLE_KEY. Ejecuta con `supabase start` y exporta las claves.')
  }
  await cleanup(admin)

  const techA = await createUserWithRole(admin, TECH_A, 'technician')
  const techB = await createUserWithRole(admin, TECH_B, 'technician')
  await createUserWithRole(admin, ADMIN, 'admin')
  const clientUid = await createUserWithRole(admin, CLIENT, 'client')

  // Cliente + su vínculo de acceso
  const { data: cli, error: cliErr } = await admin
    .from('clients').insert({ nom_client: 'TEST Client' }).select('id').single()
  if (cliErr) throw new Error(`seed client: ${cliErr.message}`)
  const clientId = cli!.id
  const { error: cpErr } = await admin
    .from('client_profiles').insert({ profile_id: clientUid, client_id: clientId })
  if (cpErr) throw new Error(`seed client_profiles: ${cpErr.message}`)

  // Contrato + máquina + línea abierta
  const { data: contract, error: cErr } = await admin
    .from('contracts')
    .insert({ numero_contrat: 'TEST-C1', client_id: clientId, date_debut: '2026-01-01', statut: 'actif' })
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
  lineId = line!.id

  // Dos incidencias internas, una asignada a cada técnico, ambas del contrato del cliente.
  const { error: iErr } = await admin.from('incidents').insert([
    { numero_incident: 'TEST-I1', title: 'Incident A', contract_machine_id: lineId, assigned_to: techA },
    { numero_incident: 'TEST-I2', title: 'Incident B', contract_machine_id: lineId, assigned_to: techB },
  ])
  if (iErr) throw new Error(`seed incidents: ${iErr.message}`)
}, 60_000)

afterAll(async () => {
  await cleanup(admin)
})

async function visibleIncidents(client: Awaited<ReturnType<typeof signInAs>>): Promise<string[]> {
  const { data } = await client.from('incidents').select('numero_incident').like('numero_incident', 'TEST-%')
  return (data ?? []).map((i) => i.numero_incident as string)
}

describe('RLS — aislamiento de incidencias', () => {
  it('el técnico A ve SOLO su incidencia (no la del técnico B)', async () => {
    const c = await signInAs(TECH_A)
    const nums = await visibleIncidents(c)
    expect(nums).toContain('TEST-I1')
    expect(nums).not.toContain('TEST-I2')
  })

  it('el técnico B ve SOLO su incidencia (no la del técnico A)', async () => {
    const c = await signInAs(TECH_B)
    const nums = await visibleIncidents(c)
    expect(nums).toContain('TEST-I2')
    expect(nums).not.toContain('TEST-I1')
  })

  it('el cliente ve las incidencias de su contrato (ambas)', async () => {
    const c = await signInAs(CLIENT)
    const nums = await visibleIncidents(c)
    expect(nums).toEqual(expect.arrayContaining(['TEST-I1', 'TEST-I2']))
  })

  it('el admin ve todas las incidencias', async () => {
    const c = await signInAs(ADMIN)
    const nums = await visibleIncidents(c)
    expect(nums).toEqual(expect.arrayContaining(['TEST-I1', 'TEST-I2']))
  })

  it('un usuario anónimo no ve ninguna incidencia', async () => {
    const c = anonClient()
    const { data } = await c.from('incidents').select('numero_incident').like('numero_incident', 'TEST-%')
    expect(data ?? []).toHaveLength(0)
  })

  it('el técnico A NO puede actualizar la incidencia del técnico B', async () => {
    const c = await signInAs(TECH_A)
    await c.from('incidents').update({ title: 'hijacked' }).eq('numero_incident', 'TEST-I2')
    // Verificación independiente con service_role: el título no cambió.
    const { data } = await admin.from('incidents').select('title').eq('numero_incident', 'TEST-I2').single()
    expect(data?.title).toBe('Incident B')
  })
})
