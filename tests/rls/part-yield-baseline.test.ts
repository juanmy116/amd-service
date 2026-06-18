import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import {
  adminClient, signInAs, createUserWithRole, cleanup, ANON_KEY, SERVICE_KEY,
} from './helpers'

// Lógica y aislamiento de v_part_yield_baseline / v_part_yield_effective (Fase 2).
// Prueba el FIX de reemplazo: el baseline NO debe restar contadores a través de un
// reinicio de máquina (is_replacement_start). Y que las vistas (agregado cross-cliente,
// sensible) quedan vacías para no-admin. Supabase LOCAL efímero.

const admin = adminClient()

const ADMIN  = 'admin@rls.test'
const TECH   = 'tech-a@rls.test'
const CLIENT = 'client@rls.test'

const SERIE = 'TEST-SN1'

beforeAll(async () => {
  if (!ANON_KEY || !SERVICE_KEY) {
    throw new Error('Faltan ANON_KEY/SERVICE_ROLE_KEY. Ejecuta con `supabase start` y exporta las claves.')
  }
  await cleanup(admin)

  await createUserWithRole(admin, ADMIN, 'admin')
  const techA = await createUserWithRole(admin, TECH, 'technician')
  const clientUid = await createUserWithRole(admin, CLIENT, 'client')

  const { data: cli } = await admin.from('clients').insert({ nom_client: 'TEST Client' }).select('id').single()
  await admin.from('client_profiles').insert({ profile_id: clientUid, client_id: cli!.id })
  const { data: contract } = await admin.from('contracts')
    .insert({ numero_contrat: 'TEST-C1', client_id: cli!.id, date_debut: '2026-01-01', statut: 'actif' })
    .select('id').single()
  await admin.from('machines').insert({ numero_serie: SERIE, marque: 'TEST', modele: 'X' })
  const { data: line } = await admin.from('contract_machines')
    .insert({ contract_id: contract!.id, machine_id: SERIE, date_debut: '2026-01-01', statut: 'actif' })
    .select('id').single()

  // 3 cambios de la pieza 7 (Toner BK), vía incidencias resueltas en fechas crecientes.
  // changed_at de la vista = COALESCE(resolved_at, created_at).
  const dates = ['2026-01-15', '2026-02-15', '2026-04-15']
  const { data: incs } = await admin.from('incidents').insert(
    dates.map((d, i) => ({
      numero_incident: `TEST-I${i + 1}`, title: `Inc ${i}`, contract_machine_id: line!.id,
      assigned_to: techA, status: 'résolu' as const, resolved_at: `${d}T12:00:00Z`,
    }))
  ).select('id, numero_incident')
  for (const inc of incs!) {
    await admin.from('incident_parts').insert({ incident_id: inc.id, part_id: 7, quantity: 1 })
  }

  // Contadores: reinicio de contador (is_replacement_start) entre el 2º y 3er cambio.
  // C0=5000 (antes I1), C1=10000 (antes I2), REINICIO=2000, C2=40000 (antes I3).
  // Intervalo I1→I2 = 5000 (misma época). I2→I3 cruza el reemplazo → NO debe contarse.
  // NOTA: todas las filas deben tener LAS MISMAS claves — PostgREST rechaza un bulk
  // insert con objetos de claves distintas (por eso is_replacement_start va en todas).
  const { error: cntErr } = await admin.from('machine_counters').insert([
    { machine_id: SERIE, year: 2026, month: 1, day: 1, recorded_at: '2026-01-01T00:00:00Z', counter_bw: 5000,  counter_color: 0, is_replacement_start: false },
    { machine_id: SERIE, year: 2026, month: 2, day: 1, recorded_at: '2026-02-01T00:00:00Z', counter_bw: 10000, counter_color: 0, is_replacement_start: false },
    { machine_id: SERIE, year: 2026, month: 3, day: 1, recorded_at: '2026-03-01T00:00:00Z', counter_bw: 2000,  counter_color: 0, is_replacement_start: true  },
    { machine_id: SERIE, year: 2026, month: 4, day: 1, recorded_at: '2026-04-01T00:00:00Z', counter_bw: 40000, counter_color: 0, is_replacement_start: false },
  ])
  if (cntErr) throw new Error(`seed machine_counters: ${cntErr.message}`)
}, 60_000)

afterAll(async () => {
  await cleanup(admin)
})

describe('v_part_yield_baseline — lógica de rendimiento aprendido', () => {
  it('el baseline NO cruza fronteras de reemplazo (solo cuenta el intervalo válido)', async () => {
    // Con el fix: solo el intervalo I1→I2 (5000) cuenta; I2→I3 cruza el reinicio y se excluye.
    // Sin el fix daría avg 17500 / samples 2.
    const c = await signInAs(ADMIN)
    const { data } = await c.from('v_part_yield_baseline')
      .select('avg_yield_total, samples').eq('marque', 'TEST').eq('part_id', 7)
    expect(data).toEqual([{ avg_yield_total: 5000, samples: 1 }])
  })

  it('el rendimiento efectivo refleja el baseline (origen historique) sin ficha de fabricante', async () => {
    const c = await signInAs(ADMIN)
    const { data } = await c.from('v_part_yield_effective')
      .select('expected_yield_total, yield_source').eq('marque', 'TEST').eq('part_id', 7)
    expect(data).toEqual([{ expected_yield_total: 5000, yield_source: 'historique' }])
  })

  it('el técnico NO ve el baseline (agregado cross-cliente, hereda machine_counters admin-only)', async () => {
    const c = await signInAs(TECH)
    const { data } = await c.from('v_part_yield_baseline').select('avg_yield_total').eq('marque', 'TEST')
    expect(data ?? []).toHaveLength(0)
  })

  it('el cliente NO ve el baseline', async () => {
    const c = await signInAs(CLIENT)
    const { data } = await c.from('v_part_yield_baseline').select('avg_yield_total').eq('marque', 'TEST')
    expect(data ?? []).toHaveLength(0)
  })
})

// Caso 12 del gate (§9): las vistas eligen el contador por reading_date (FECHA REAL),
// NO por recorded_at (fecha de REGISTRO). Una lectura importada tarde tiene recorded_at
// posterior pero reading_date anterior; debe ordenarse por reading_date.
describe('v_machine_part_consumption — elige el contador por reading_date, no recorded_at', () => {
  it('una lectura importada tarde (recorded_at futuro, reading_date anterior) no se toma como actual', async () => {
    const SERIE_LATE = 'TEST-SN-LATE'
    const c = await signInAs(ADMIN)
    const { data: cli } = await admin.from('clients').insert({ nom_client: 'TEST Client Late' }).select('id').single()
    const { data: contract } = await admin.from('contracts')
      .insert({ numero_contrat: 'TEST-C-LATE', client_id: cli!.id, date_debut: '2026-01-01', statut: 'actif' })
      .select('id').single()
    await admin.from('machines').insert({ numero_serie: SERIE_LATE, marque: 'TESTLATE', modele: 'X' })
    const { data: line } = await admin.from('contract_machines')
      .insert({ contract_id: contract!.id, machine_id: SERIE_LATE, date_debut: '2026-01-01', statut: 'actif' })
      .select('id').single()

    // Cambio de la pieza 7 el 01-mar (changed_at). counter_at_change = lectura con reading_date <= 01-mar.
    const { data: inc } = await admin.from('incidents').insert({
      numero_incident: 'TEST-I-LATE', title: 'Inc late', contract_machine_id: line!.id,
      status: 'résolu' as const, resolved_at: '2026-03-01T12:00:00Z',
    }).select('id').single()
    await admin.from('incident_parts').insert({ incident_id: inc!.id, part_id: 7, quantity: 1 })

    // reading_date es columna GENERATED de (year,month,day) → NO se inserta; se deriva.
    const { error: cntErr } = await admin.from('machine_counters').insert([
      // Lectura del cambio (01-mar → reading_date 2026-03-01): 10000.
      { machine_id: SERIE_LATE, year: 2026, month: 3, day: 1, recorded_at: '2026-03-01T10:00:00Z', counter_bw: 10000, counter_color: 0, status: 'actif', is_replacement_start: false },
      // Lectura ACTUAL real (01-may): 15000, registrada a tiempo.
      { machine_id: SERIE_LATE, year: 2026, month: 5, day: 1, recorded_at: '2026-05-01T10:00:00Z', counter_bw: 15000, counter_color: 0, status: 'actif', is_replacement_start: false },
      // Lectura IMPORTADA TARDE: reading_date anterior (01-abr) pero recorded_at FUTURO (01-jun): 12000.
      // Por recorded_at sería "la más reciente" → counter_now 12000 → copies 2000 (MAL).
      // Por reading_date, la actual es la del 01-may (15000) → copies 5000 (BIEN).
      { machine_id: SERIE_LATE, year: 2026, month: 4, day: 1, recorded_at: '2026-06-01T10:00:00Z', counter_bw: 12000, counter_color: 0, status: 'actif', is_replacement_start: false },
    ])
    if (cntErr) throw new Error(`seed counters late: ${cntErr.message}`)

    const { data } = await c.from('v_machine_part_consumption')
      .select('copies_since_change').eq('machine_id', SERIE_LATE).eq('part_id', 7)
    expect(data).toHaveLength(1)
    expect(data![0].copies_since_change).toBe(5000) // 15000 (reading_date 01-may) − 10000, no 2000
  })
})
