import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { adminClient, ANON_KEY, SERVICE_KEY, cleanup } from './helpers'

// BANCO ADVERSARIAL de los CIERRES POR LÍNEA (PR-D.2, FASE 4 del spec
// 2026-06-17-contadores-fecha-real-y-linea-design.md §6 «Cierres»).
//
// Las RPCs de cierre (return_machine_to_stock / terminate_contract /
// replace_contract_machine) validan que el contador de cierre no sea inferior a la
// última lectura REAL de la línea. El modelo viejo elegía «el último contador de la
// MÁQUINA» (sin línea, ordenando por year/month/recorded_at y SIN límite de fecha).
// Eso permite que una lectura POSTERIOR a la fecha de cierre (date_fin) — p.ej. una
// captura que llega tarde y corresponde a un periodo que esta línea ya no cubre —
// se use como referencia y haga RECHAZAR un cierre legítimo (regla de oro de Codex).
//
// Estos casos fijan el comportamiento correcto: la referencia del cierre = última
// lectura de la MISMA línea (contract_machine_id) con reading_date <= date_fin.
//
// Prefijo TEST- → cleanup() lo barre. Estas RPCs NO emiten facturas (no hay
// inmutabilidad que bloquee el borrado).

const admin = adminClient()

type Counter = { date: string; bw: number; color: number; cmRef?: 'self' | 'other' }

// Siembra cliente + máquina + contrato + 1 línea abierta, con sus contadores.
// `suffix` aísla cada caso (índice one_open_per_machine: una línea abierta por máquina).
async function seedLine(
  suffix: string,
  opts: { dateDebut?: string; startBw?: number; startColor?: number; counters?: Counter[] } = {},
): Promise<{ serie: string; contractId: string; lineId: string; clientId: number }> {
  const serie = `TEST-D2-${suffix}`
  const contractNum = `TEST-D2-C-${suffix}`
  const dateDebut = opts.dateDebut ?? '2026-01-01'

  const cli = await admin.from('clients')
    .upsert({ nom_client: `TEST D2 ${suffix}` }, { onConflict: 'nom_client' }).select('id').single()
  if (cli.error) throw new Error(`seed client ${suffix}: ${cli.error.message}`)
  const clientId = cli.data!.id as number

  const mch = await admin.from('machines')
    .insert({ numero_serie: serie, marque: 'TESTD2', modele: 'M', type: 'color' })
  if (mch.error) throw new Error(`seed machine ${suffix}: ${mch.error.message}`)

  const contract = await admin.from('contracts')
    .insert({ numero_contrat: contractNum, client_id: clientId, date_debut: '2026-01-01', statut: 'actif', billing_day: 1 })
    .select('id').single()
  if (contract.error) throw new Error(`seed contract ${suffix}: ${contract.error.message}`)
  const contractId = contract.data!.id as string

  const line = await admin.from('contract_machines')
    .insert({
      contract_id: contractId, machine_id: serie, date_debut: dateDebut, statut: 'actif',
      start_counter_bw: opts.startBw ?? null, start_counter_color: opts.startColor ?? null,
    })
    .select('id').single()
  if (line.error) throw new Error(`seed line ${suffix}: ${line.error.message}`)
  const lineId = line.data!.id as string

  for (const c of opts.counters ?? []) {
    const [y, m, d] = c.date.split('-').map(Number)
    const ins = await admin.from('machine_counters').insert({
      machine_id: serie, contract_id: contractId, contract_machine_id: lineId, client_id: clientId,
      year: y, month: m, day: d, counter_bw: c.bw, counter_color: c.color,
      recorded_at: `${c.date}T10:00:00Z`,
    })
    if (ins.error) throw new Error(`seed counter ${suffix} ${c.date}: ${ins.error.message}`)
  }

  return { serie, contractId, lineId, clientId }
}

beforeAll(async () => {
  if (!ANON_KEY || !SERVICE_KEY) {
    throw new Error('Faltan ANON_KEY/SERVICE_ROLE_KEY. Ejecuta con `supabase start` y exporta las claves.')
  }
  await cleanup(admin)
})

afterAll(async () => {
  await cleanup(admin)
})

// ─────────────────────────────────────────────────────────────────────────────
// 1) return_machine_to_stock
// ─────────────────────────────────────────────────────────────────────────────
describe('return_machine_to_stock — cierre por línea + reading_date', () => {
  it('una lectura POSTERIOR a date_fin no se usa como referencia → cierre legítimo OK', async () => {
    // 15-abr bw=1000 (cuenta) + 15-jun bw=5000 (NO cuenta: posterior al cierre del 31-may).
    const { lineId } = await seedLine('RET1', {
      counters: [
        { date: '2026-04-15', bw: 1000, color: 200 },
        { date: '2026-06-15', bw: 5000, color: 900 },
      ],
    })
    const { error } = await admin.rpc('return_machine_to_stock', {
      p_payload: { cm_id: lineId, date: '2026-05-31', end_counter_bw: 1500, end_counter_color: 300 },
    })
    // Modelo viejo: 1500 < 5000 (lectura de junio) → closing_counter_too_low (falso positivo).
    expect(error).toBeNull()
  })

  it('la regla de oro sigue protegiendo: cierre < última lectura real de la línea → rechazado', async () => {
    const { lineId } = await seedLine('RET2', {
      counters: [{ date: '2026-04-15', bw: 1000, color: 200 }],
    })
    const { error } = await admin.rpc('return_machine_to_stock', {
      p_payload: { cm_id: lineId, date: '2026-05-31', end_counter_bw: 800, end_counter_color: 300 },
    })
    expect(error?.message).toContain('closing_counter_too_low')
  })

  it('una lectura de OTRA línea de la misma máquina no contamina la referencia', async () => {
    // L1 (cerrada) tiene una lectura; L2 (abierta) NO tiene lectura propia (solo su start).
    // El cierre de L2 debe apoyarse en SU start (línea L2), no en la lectura de L1.
    // Caso de datos incoherentes entre líneas (corrección/reasignación) que el aislamiento
    // por contract_machine_id maneja: el modelo viejo, al elegir «último de la máquina»,
    // cogería la lectura de L1 y rechazaría un cierre válido de L2.
    const serie = 'TEST-D2-RETLINE'
    const cli = await admin.from('clients')
      .upsert({ nom_client: 'TEST D2 RETLINE' }, { onConflict: 'nom_client' }).select('id').single()
    if (cli.error) throw new Error(cli.error.message)
    const clientId = cli.data!.id as number
    await admin.from('machines').insert({ numero_serie: serie, marque: 'TESTD2', modele: 'M', type: 'color' })
    const contract = await admin.from('contracts')
      .insert({ numero_contrat: 'TEST-D2-C-RETLINE', client_id: clientId, date_debut: '2026-01-01', statut: 'actif', billing_day: 1 })
      .select('id').single()
    const contractId = contract.data!.id as string
    // L1: ene–mar, cerrada, con una lectura atribuida a L1.
    const l1 = await admin.from('contract_machines')
      .insert({ contract_id: contractId, machine_id: serie, date_debut: '2026-01-01', date_fin: '2026-03-31', statut: 'terminé', end_counter_bw: 9000, end_counter_color: 800 })
      .select('id').single()
    await admin.from('machine_counters').insert({
      machine_id: serie, contract_id: contractId, contract_machine_id: l1.data!.id, client_id: clientId,
      year: 2026, month: 3, day: 15, counter_bw: 9000, counter_color: 800, recorded_at: '2026-03-15T10:00:00Z',
    })
    // L2: abre en abril, SIN lectura propia → su referencia de cierre es su start_counter.
    const l2 = await admin.from('contract_machines')
      .insert({ contract_id: contractId, machine_id: serie, date_debut: '2026-04-01', statut: 'actif', start_counter_bw: 100, start_counter_color: 20 })
      .select('id').single()
    const { error } = await admin.rpc('return_machine_to_stock', {
      p_payload: { cm_id: l2.data!.id, date: '2026-05-31', end_counter_bw: 200, end_counter_color: 30 },
    })
    // Modelo viejo: ve la lectura de L1 (9000) → 200 < 9000 → closing_counter_too_low (falso positivo).
    // Modelo nuevo: L2 no tiene lecturas propias → ref = start (100/20) → 200>=100, 30>=20 → OK.
    expect(error).toBeNull()
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// 2) terminate_contract
// ─────────────────────────────────────────────────────────────────────────────
describe('terminate_contract — cierre por línea + reading_date', () => {
  it('una lectura POSTERIOR a date_fin no rechaza el cierre de la línea', async () => {
    const { contractId, lineId } = await seedLine('TERM1', {
      counters: [
        { date: '2026-04-15', bw: 1000, color: 200 },
        { date: '2026-06-15', bw: 5000, color: 900 },
      ],
    })
    const { error } = await admin.rpc('terminate_contract', {
      p_payload: {
        contract_id: contractId, date: '2026-05-31',
        lines: [{ cm_id: lineId, end_counter_bw: 1500, end_counter_color: 300 }],
      },
    })
    expect(error).toBeNull()
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// 3) replace_contract_machine
// ─────────────────────────────────────────────────────────────────────────────
describe('replace_contract_machine — cierre por línea + reading_date', () => {
  it('una lectura POSTERIOR a date_fin no rechaza el cierre de la saliente', async () => {
    const { lineId } = await seedLine('REPL1', {
      counters: [
        { date: '2026-04-15', bw: 1000, color: 200 },
        { date: '2026-06-15', bw: 5000, color: 900 },
      ],
    })
    // Máquina entrante nueva, libre.
    const inSerie = 'TEST-D2-REPL1-IN'
    await admin.from('machines').insert({ numero_serie: inSerie, marque: 'TESTD2', modele: 'M', type: 'color' })
    const { error } = await admin.rpc('replace_contract_machine', {
      p_payload: {
        out_cm_id: lineId, in_machine_id: inSerie, date: '2026-05-31',
        out_counter_bw: 1500, out_counter_color: 300, in_counter_bw: 0, in_counter_color: 0,
      },
    })
    expect(error).toBeNull()
  })
})
