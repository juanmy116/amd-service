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

  it('V2 — relevé legacy (contract_machine_id NULL) FUERA de la vigencia (date_debut, date_fin] → rechazado', async () => {
    // Línea vigente desde 2026-01-01. Un relevé legacy fechado el 2025-12-15 (≤ date_debut) NO cae en
    // (date_debut, date_fin] → el fallback de V2 no lo acepta aunque sea de la misma máquina. Demuestra
    // el rango de vigencia (sin él, un legacy de otra etapa de la máquina se colaría).
    const leg = await admin.from('machine_counters')
      .insert({ machine_id: SERIE, contract_id: contractId, contract_machine_id: null, client_id: clientId, year: 2025, month: 12, day: 15, counter_bw: 500, counter_color: 100, recorded_at: '2025-12-15T10:00:00Z' })
      .select('id').single()
    if (leg.error) throw new Error(`seed legacy: ${leg.error.message}`)
    const { error } = await emit(basePayload([{ ...baseLine(), closing_counter_id: leg.data!.id }]))
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

// ─────────────────────────────────────────────────────────────────────────────
// V3c sobre cierre persistido SOLO en breakdown (no top-level) de una factura emise previa.
// Contrato dedicado (HARD2) para aislar el historial. La factura previa se inserta a mano con el
// cierre X únicamente dentro de invoice_lines.breakdown → V3c debe seguir detectando su reutilización.
// ─────────────────────────────────────────────────────────────────────────────
describe('emit_contract_invoice — V3c detecta reutilización de un cierre guardado solo en breakdown', () => {
  const SERIE2 = 'TESTINV-HARD-M2'
  const CONTRAT2 = 'TESTINV-HARD-C2'
  let contractId2: string
  let lineId2: string
  let cXId: string   // cierre real persistido solo en el breakdown de la factura previa

  beforeAll(async () => {
    await admin.from('machine_counters').delete().eq('machine_id', SERIE2)
    const prev = await admin.from('contracts').select('id').eq('numero_contrat', CONTRAT2).maybeSingle()
    if (prev.data) {
      await admin.from('contract_machines').delete().eq('contract_id', prev.data.id)
      await admin.from('contracts').delete().eq('id', prev.data.id)
    }
    await admin.from('machines').delete().eq('numero_serie', SERIE2)

    await admin.from('machines').insert({ numero_serie: SERIE2, marque: 'TESTHARD', modele: 'M2', type: 'color' })
    const c = await admin.from('contracts')
      .insert({ numero_contrat: CONTRAT2, client_id: clientId, date_debut: '2026-01-01', statut: 'actif', billing_day: 1 })
      .select('id').single()
    contractId2 = c.data!.id as string
    const planRow = await admin.from('billing_plans').select('id').eq('name', PLAN).single()
    const ln = await admin.from('contract_machines')
      .insert({ contract_id: contractId2, machine_id: SERIE2, date_debut: '2026-01-01', statut: 'actif', billing_plan_id: planRow.data!.id })
      .select('id').single()
    lineId2 = ln.data!.id as string

    // Apertura (base) + cierre X (real). cX se usará como cierre dentro del breakdown de la factura previa.
    const cnt = await admin.from('machine_counters').insert([
      { machine_id: SERIE2, contract_id: contractId2, contract_machine_id: lineId2, client_id: clientId, year: 2026, month: 4, day: 29, counter_bw: 1000, counter_color: 200, recorded_at: '2026-04-29T10:00:00Z' },
      { machine_id: SERIE2, contract_id: contractId2, contract_machine_id: lineId2, client_id: clientId, year: 2026, month: 6, day: 3,  counter_bw: 1500, counter_color: 260, recorded_at: '2026-06-03T10:00:00Z' },
    ]).select('id, month')
    cXId = cnt.data!.find(c => c.month === 6)!.id as string

    // Factura previa de MAYO insertada a mano: el cierre X vive SOLO dentro de breakdown (top-level null).
    const inv = await admin.from('invoices').insert({
      numero_facture: 'TESTINV-HARD-BD1', client_id: clientId, client_name: CLIENT, contract_id: contractId2,
      period_year: 2026, period_month: 5, status: 'emise', total_amount: 8000,
    }).select('id').single()
    if (inv.error) throw new Error(`seed prev invoice: ${inv.error.message}`)
    const il = await admin.from('invoice_lines').insert({
      invoice_id: inv.data!.id, contract_id: contractId2, numero_contrat: CONTRAT2, machine_id: SERIE2,
      machine_label: `TESTHARD M2 (${SERIE2})`, plan_name: PLAN, billing_type: 'per_copy',
      delta_bw: 500, delta_color: 60, amount_fixed: 0, amount_bw: 5000, amount_color: 3000, amount_total: 8000,
      contract_machine_id: lineId2, closing_counter_id: null,   // top-level NULL a propósito
      breakdown: [{ contract_machine_id: lineId2, machine_label: 'M2', delta_bw: 500, delta_color: 60, closing_counter_id: cXId }],
    })
    if (il.error) throw new Error(`seed prev line: ${il.error.message}`)
  }, 90_000)

  it('emitir JUNIO reutilizando X (que en la factura de mayo está solo en breakdown) → bloqueado', async () => {
    const junio = {
      contract_id: contractId2, client_id: clientId, client_name: CLIENT, numero_contrat: CONTRAT2,
      period_start: '2026-06-03', period_end: '2026-07-01', period_year: 2026, period_month: 6,
      has_estimated: false, has_replacement: false, confirm_estimated: false, total_amount: 8000,
      lines: [{
        cm_id: lineId2, contract_id: contractId2, numero_contrat: CONTRAT2, machine_id: SERIE2,
        machine_label: `TESTHARD M2 (${SERIE2})`, plan_name: PLAN, billing_type: 'per_copy',
        fixed_fee: null, price_bw: 10, price_color: 50, tiers: null,
        delta_bw: 500, delta_color: 60, is_estimated: false,
        amount_fixed: 0, amount_bw: 5000, amount_color: 3000, amount_total: 8000,
        opening_counter_id: null, closing_counter_id: cXId,
        opening_reading_date: '2026-06-03', closing_reading_date: '2026-06-03',
        opening_counter_bw: 1000, opening_counter_color: 200, closing_counter_bw: 1500, closing_counter_color: 260,
      }],
    }
    const { error } = await emit(junio)
    expect(error?.message).toContain('closing_counter_already_used')
  })
})
