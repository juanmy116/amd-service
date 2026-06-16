import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { adminClient, cleanup, ANON_KEY, SERVICE_KEY } from './helpers'
import { evaluateConsumption, type YieldSource } from '../../src/lib/anomalies'

// Gate END-TO-END de la feature historial de piezas (Fases 1→2→3) sobre la cadena
// completa de vistas, con datos sintéticos en el Supabase efímero del CI:
//   incidencia+pieza → v_machine_parts_history → ficha fabricante (part_yield_specs)
//   → v_part_yield_effective → v_machine_part_consumption → evaluateConsumption.
// Verifica que un consumo por encima del rendimiento esperado produce la anomalía
// roja correcta. Es la prueba de integración que ninguna verificación por-fase cubrió.

const admin = adminClient()

const SERIE = 'TEST-E2E1'
const MARQUE = 'TESTE2E'
const MODELE = 'M1'

async function clearSpecs() {
  await admin.from('part_yield_specs').delete().like('marque', 'TESTE2E%')
}

beforeAll(async () => {
  if (!ANON_KEY || !SERVICE_KEY) {
    throw new Error('Faltan ANON_KEY/SERVICE_ROLE_KEY. Ejecuta con `supabase start` y exporta las claves.')
  }
  await cleanup(admin)
  await clearSpecs()

  const { data: cli, error: cliErr } = await admin
    .from('clients').insert({ nom_client: 'TEST E2E Client' }).select('id').single()
  if (cliErr) throw new Error(`seed client: ${cliErr.message}`)
  const { data: contract, error: cErr } = await admin.from('contracts')
    .insert({ numero_contrat: 'TEST-E2EC1', client_id: cli!.id, date_debut: '2026-01-01', statut: 'actif' })
    .select('id').single()
  if (cErr) throw new Error(`seed contract: ${cErr.message}`)
  const { error: mErr } = await admin.from('machines')
    .insert({ numero_serie: SERIE, marque: MARQUE, modele: MODELE })
  if (mErr) throw new Error(`seed machine: ${mErr.message}`)
  const { data: line, error: lErr } = await admin.from('contract_machines')
    .insert({ contract_id: contract!.id, machine_id: SERIE, date_debut: '2026-01-01', statut: 'actif' })
    .select('id').single()
  if (lErr) throw new Error(`seed line: ${lErr.message}`)

  // Último cambio de la pieza 7 (Toner BK) el 2026-03-15.
  const { data: inc, error: iErr } = await admin.from('incidents')
    .insert({ numero_incident: 'TEST-E2EI1', title: 'toner', contract_machine_id: line!.id, status: 'résolu', resolved_at: '2026-03-15T12:00:00Z' })
    .select('id').single()
  if (iErr) throw new Error(`seed incident: ${iErr.message}`)
  const { error: ipErr } = await admin.from('incident_parts').insert({ incident_id: inc!.id, part_id: 7, quantity: 1 })
  if (ipErr) throw new Error(`seed incident_parts: ${ipErr.message}`)

  // Contador 5000 antes del cambio, 18000 ahora → 13 000 copias desde el cambio.
  const { error: cntErr } = await admin.from('machine_counters').insert([
    { machine_id: SERIE, year: 2026, month: 3, recorded_at: '2026-03-01T00:00:00Z', counter_bw: 5000,  counter_color: 0, is_replacement_start: false },
    { machine_id: SERIE, year: 2026, month: 5, recorded_at: '2026-05-01T00:00:00Z', counter_bw: 18000, counter_color: 0, is_replacement_start: false },
  ])
  if (cntErr) throw new Error(`seed counters: ${cntErr.message}`)

  // Ficha del fabricante: el Toner BK rinde 10 000 copias en este modelo.
  const { error: spErr } = await admin.from('part_yield_specs')
    .insert({ marque: MARQUE, modele: MODELE, part_id: 7, expected_yield: 10000, unit: 'copies_total', source: 'fabricant' })
  if (spErr) throw new Error(`seed spec: ${spErr.message}`)
}, 60_000)

afterAll(async () => {
  await clearSpecs()
  await cleanup(admin)
})

describe('E2E historial de piezas — cadena completa hasta la anomalía', () => {
  it('v_machine_part_consumption integra historial + ficha del fabricante', async () => {
    const { data } = await admin.from('v_machine_part_consumption')
      .select('part_id, copies_since_change, expected_yield_total, yield_source, samples')
      .eq('machine_id', SERIE)
    expect(data).toEqual([{
      part_id: 7,
      copies_since_change: 13000,   // 18000 − 5000
      expected_yield_total: 10000,  // ficha del fabricante
      yield_source: 'fabricant',
      samples: null,
    }])
  })

  it('el agente marca ROJO (consumo 130% del rendimiento esperado)', async () => {
    const { data } = await admin.from('v_machine_part_consumption').select('*').eq('machine_id', SERIE).single()
    const ev = evaluateConsumption({
      copiesSinceChange: data!.copies_since_change ?? 0,
      expectedYield: data!.expected_yield_total,
      source: data!.yield_source as YieldSource,
      samples: data!.samples,
    })
    expect(ev?.light).toBe('red')
    expect(ev?.type).toBe('consumo_alto_sin_cambio')
    expect(ev?.reason).toContain('Remplacement')
  })
})
