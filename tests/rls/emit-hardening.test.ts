import { describe, it, expect, beforeAll } from 'vitest'
import { adminClient, ANON_KEY, SERVICE_KEY } from './helpers'

// BANCO DE PRUEBAS ADVERSARIAL de emit_contract_invoice (PR-D.1, FASE 4). Ejecuta la RPC con payloads
// MANIPULADOS para verificar que la última barrera antes de la factura inmutable los rechaza, y que NO
// bloquea los casos legítimos. Cada caso corresponde a una validación V1–V4 del spec §6 y a un hallazgo
// real de las revisiones de Codex. Sobre BD efímera (supabase db reset reconstruye todas las migraciones).
//
// Inmutabilidad: emite facturas → prefijo 'TESTINV' que cleanup() NO barre. En CI la BD es efímera; en
// local requiere `supabase db reset` entre ejecuciones.

const admin = adminClient()

const CLIENT  = 'TESTINV HARD Client'
const SERIE   = 'TESTINV-HARD-M1'
const CONTRAT = 'TESTINV-HARD-C1'
const PLAN    = 'TESTINV HARD Plan'

let clientId: number
let contractId: string
let lineId: string
let cAbrId: string   // 29-abr (base / apertura de mayo)
let cJunId: string   // 03-jun (cierre de mayo)
let cAnnuleId: string // relevé anulado (para V2)

beforeAll(async () => {
  if (!ANON_KEY || !SERVICE_KEY) {
    throw new Error('Faltan ANON_KEY/SERVICE_ROLE_KEY. Ejecuta con `supabase start` y exporta las claves.')
  }

  await admin.from('machine_counters').delete().eq('machine_id', SERIE)
  const prev = await admin.from('contracts').select('id').eq('numero_contrat', CONTRAT).maybeSingle()
  if (prev.data) {
    await admin.from('contract_machines').delete().eq('contract_id', prev.data.id)
    await admin.from('contracts').delete().eq('id', prev.data.id)
  }
  await admin.from('machines').delete().eq('numero_serie', SERIE)

  const cli = await admin.from('clients').upsert({ nom_client: CLIENT }, { onConflict: 'nom_client' }).select('id').single()
  if (cli.error) throw new Error(`seed client: ${cli.error.message}`)
  clientId = cli.data!.id as number

  const plan = await admin.from('billing_plans')
    .upsert({ name: PLAN, type: 'per_copy', price_bw: 10, price_color: 50 }, { onConflict: 'name' })
    .select('id').single()
  if (plan.error) throw new Error(`seed plan: ${plan.error.message}`)

  const mch = await admin.from('machines').insert({ numero_serie: SERIE, marque: 'TESTHARD', modele: 'M1', type: 'color' })
  if (mch.error) throw new Error(`seed machine: ${mch.error.message}`)

  const contract = await admin.from('contracts')
    .insert({ numero_contrat: CONTRAT, client_id: clientId, date_debut: '2026-01-01', statut: 'actif', billing_day: 1 })
    .select('id').single()
  if (contract.error) throw new Error(`seed contract: ${contract.error.message}`)
  contractId = contract.data!.id as string

  const line = await admin.from('contract_machines')
    .insert({ contract_id: contractId, machine_id: SERIE, date_debut: '2026-01-01', statut: 'actif', billing_plan_id: plan.data!.id })
    .select('id').single()
  if (line.error) throw new Error(`seed line: ${line.error.message}`)
  lineId = line.data!.id as string

  const cnt = await admin.from('machine_counters').insert([
    { machine_id: SERIE, contract_id: contractId, contract_machine_id: lineId, client_id: clientId, year: 2026, month: 4, day: 29, counter_bw: 1000, counter_color: 200, recorded_at: '2026-04-29T10:00:00Z' },
    { machine_id: SERIE, contract_id: contractId, contract_machine_id: lineId, client_id: clientId, year: 2026, month: 6, day: 3,  counter_bw: 1500, counter_color: 260, recorded_at: '2026-06-03T10:00:00Z' },
  ]).select('id, month')
  if (cnt.error) throw new Error(`seed counters: ${cnt.error.message}`)
  cAbrId = cnt.data!.find(c => c.month === 4)!.id as string
  cJunId = cnt.data!.find(c => c.month === 6)!.id as string

  // Relevé ANULADO (status annule) — no debe poder usarse como cierre (V2 exige actif).
  const an = await admin.from('machine_counters')
    .insert({ machine_id: SERIE, contract_id: contractId, contract_machine_id: lineId, client_id: clientId, year: 2026, month: 5, day: 15, counter_bw: 1200, counter_color: 230, status: 'annule', recorded_at: '2026-05-15T10:00:00Z' })
    .select('id').single()
  if (an.error) throw new Error(`seed annule: ${an.error.message}`)
  cAnnuleId = an.data!.id as string
}, 90_000)

// Línea base legítima de la factura de MAYO (apertura 29-abr → cierre 03-jun, consumo 500/60).
function baseLine() {
  return {
    cm_id: lineId,
    contract_id: contractId, numero_contrat: CONTRAT, machine_id: SERIE,
    machine_label: `TESTHARD M1 (${SERIE})`, plan_name: PLAN, billing_type: 'per_copy',
    fixed_fee: null, price_bw: 10, price_color: 50, tiers: null,
    delta_bw: 500, delta_color: 60, is_estimated: false,
    amount_fixed: 0, amount_bw: 5000, amount_color: 3000, amount_total: 8000,
    opening_counter_id: cAbrId, closing_counter_id: cJunId,
    opening_reading_date: '2026-04-29', closing_reading_date: '2026-06-03',
    opening_counter_bw: 1000, opening_counter_color: 200,
    closing_counter_bw: 1500, closing_counter_color: 260,
  }
}
// deno-lint-ignore no-explicit-any
function basePayload(lines: unknown[] = [baseLine()], over: Record<string, unknown> = {}) {
  return {
    contract_id: contractId, client_id: clientId, client_name: CLIENT, numero_contrat: CONTRAT,
    period_start: '2026-04-29', period_end: '2026-06-03', period_year: 2026, period_month: 5,
    has_estimated: false, has_replacement: false, confirm_estimated: false,
    total_amount: 8000, lines, ...over,
  }
}
const emit = (payload: unknown) => admin.rpc('emit_contract_invoice', { p_payload: payload })

// ─────────────────────────────────────────────────────────────────────────────
// RECHAZOS (sin historial: ninguno de estos emite → no dejan factura).
// ─────────────────────────────────────────────────────────────────────────────
describe('emit_contract_invoice — endurecimiento: rechazos de payload manipulado', () => {
  it('V1 — línea sin cm_id → line_without_cm', async () => {
    const { cm_id: _drop, ...noCm } = baseLine()
    void _drop
    const { error } = await emit(basePayload([noCm]))
    expect(error?.message).toContain('line_without_cm')
  })

  it('V1 — cm_id que no pertenece al contrato → cm_id_not_in_contract', async () => {
    const { error } = await emit(basePayload([{ ...baseLine(), cm_id: crypto.randomUUID() }]))
    expect(error?.message).toContain('cm_id_not_in_contract')
  })

  it('V2 — closing_counter_id inexistente/ajeno a la línea → closing_counter_not_in_line', async () => {
    const { error } = await emit(basePayload([{ ...baseLine(), closing_counter_id: crypto.randomUUID() }]))
    expect(error?.message).toContain('closing_counter_not_in_line')
  })

  it('V2 — un relevé ANULADO no puede ser cierre → closing_counter_not_in_line', async () => {
    const { error } = await emit(basePayload([{ ...baseLine(), closing_counter_id: cAnnuleId }]))
    expect(error?.message).toContain('closing_counter_not_in_line')
  })

  it('V3a — dos líneas con el mismo cm_id → duplicate_cm_in_payload', async () => {
    const { error } = await emit(basePayload([baseLine(), baseLine()]))
    expect(error?.message).toContain('duplicate_cm_in_payload')
  })

  it('V3b — dos líneas con el mismo closing_counter_id (doble cobro del cierre) → closing_counter_already_used', async () => {
    // cm distintos (V3a pasa); mismo cierre → V3b dispara. (uuid ajeno; V3b corre antes que V1/V2.)
    const { error } = await emit(basePayload([baseLine(), { ...baseLine(), cm_id: crypto.randomUUID() }]))
    expect(error?.message).toContain('closing_counter_already_used')
  })

  it('vector breakdown:[] — un array vacío NO oculta el cierre top-level (sigue detectándose el duplicado)', async () => {
    const { error } = await emit(basePayload([
      { ...baseLine(), breakdown: [] },
      { ...baseLine(), cm_id: crypto.randomUUID() },
    ]))
    expect(error?.message).toContain('closing_counter_already_used')
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// FLUJO CON HISTORIAL: emite mayo (legítimo) y luego prueba V3c / V4 / dedup.
// ─────────────────────────────────────────────────────────────────────────────
describe('emit_contract_invoice — endurecimiento: secuencia, dedup y no-reutilización', () => {
  it('legítimo — emite la factura de mayo y persiste contract_id = el real (P2)', async () => {
    // P2: aunque el payload mande un contract_id de línea distinto, se persiste el del contrato (V1).
    const tampered = [{ ...baseLine(), contract_id: crypto.randomUUID() }]
    const { data: invoiceId, error } = await emit(basePayload(tampered))
    expect(error).toBeNull()
    expect(invoiceId).toBeTruthy()
    const { data: il } = await admin.from('invoice_lines').select('contract_id').eq('invoice_id', invoiceId).single()
    expect(il!.contract_id).toBe(contractId)   // no el uuid manipulado del payload
  })

  it('dedup — reintentar MAYO (ya facturado) → already_issued (no billing_sequence_mismatch)', async () => {
    const { error } = await emit(basePayload([baseLine()], { period_start: '2026-04-30' }))
    expect(error?.message).toContain('already_issued')
  })

  it('V4 — saltar a JULIO (último facturado = mayo) → billing_sequence_mismatch', async () => {
    // Cierre de julio distinto para no chocar con V3c; lo que se valida aquí es la SECUENCIA.
    const ins = await admin.from('machine_counters')
      .insert({ machine_id: SERIE, contract_id: contractId, contract_machine_id: lineId, client_id: clientId, year: 2026, month: 8, day: 1, counter_bw: 2200, counter_color: 320, recorded_at: '2026-08-01T10:00:00Z' })
      .select('id').single()
    const cAouId = ins.data!.id as string
    const julio = basePayload(
      [{ ...baseLine(), opening_counter_id: cJunId, closing_counter_id: cAouId,
         opening_reading_date: '2026-06-03', closing_reading_date: '2026-08-01',
         opening_counter_bw: 1500, opening_counter_color: 260, closing_counter_bw: 2200, closing_counter_color: 320,
         delta_bw: 700, delta_color: 60, amount_bw: 7000, amount_color: 3000, amount_total: 10000 }],
      { period_month: 7, period_end: '2026-08-01', total_amount: 10000 },
    )
    const { error } = await emit(julio)
    expect(error?.message).toContain('billing_sequence_mismatch')
  })

  it('V3c — reutilizar el cierre de mayo (cJun) como cierre de JUNIO → closing_counter_already_used', async () => {
    // Junio es el mes en secuencia (mayo+1), pero reusar el closing ya facturado de mayo debe bloquearse.
    const junio = basePayload(
      [{ ...baseLine(), opening_counter_id: cAbrId, closing_counter_id: cJunId,
         opening_reading_date: '2026-04-29', closing_reading_date: '2026-06-03' }],
      { period_month: 6, period_end: '2026-06-03' },
    )
    const { error } = await emit(junio)
    expect(error?.message).toContain('closing_counter_already_used')
  })
})
