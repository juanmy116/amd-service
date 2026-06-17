import { describe, it, expect, vi } from 'vitest'
import { counterDelta, type Counter } from '@/lib/counters'
import {
  countersForLine, BillingDataError, isLineBillable,
  computeInvoiceMonth, buildContractInvoiceDraft, listReadyToBill,
  computeLineChainConsumption, type ChainStart, type LineCounters,
} from '@/lib/invoicing'

// Mock del admin client de Supabase para los tests de buildContractInvoiceDraft (P0-7).
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: vi.fn() }))
import { createAdminClient } from '@/lib/supabase/admin'

// Helper: construye un relevé con valores por defecto razonables. `recorded_at` deriva de la
// fecha (year-month-day) para que el desempate por recorded_at sea coherente con la fecha real.
function mkCounter(p: Partial<Counter> & { id: string; year: number; month: number }): Counter {
  const day = p.day ?? 1
  const reading_date = `${p.year}-${String(p.month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
  return {
    day,
    reading_date,
    contract_machine_id: null,
    counter_bw: 0,
    counter_color: 0,
    status: 'actif',
    is_replacement_start: false,
    previous_machine_id: null,
    annulation_reason: null,
    annule_at: null,
    notes: null,
    recorded_at: `${reading_date}T10:00:00Z`,
    ...p,
  }
}

// Relevé con las columnas de atribución (CounterRow): Counter + machine_id + contract_id.
function mkRow(
  p: Partial<Counter> & { id: string; year: number; month: number },
  machine_id: string,
  contract_id: string | null,
) {
  return { ...mkCounter(p), machine_id, contract_id }
}

describe('counterDelta (primitiva compartida)', () => {
  it('resta final − inicial', () => {
    expect(counterDelta(1500, 1000)).toBe(500)
  })
  it('devuelve null si falta cualquiera de los dos puntos', () => {
    expect(counterDelta(null, 1000)).toBeNull()
    expect(counterDelta(1500, null)).toBeNull()
    expect(counterDelta(null, null)).toBeNull()
  })
  it('NO recorta negativos (la política la decide cada caller)', () => {
    expect(counterDelta(900, 1000)).toBe(-100)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// BLOQUE B — atribución por línea/contrato (P0-3).
// ─────────────────────────────────────────────────────────────────────────────
describe('Bloque B — countersForLine (P0-3): cada línea solo ve los relevés de SU línea (contract_machine_id)', () => {
  // lA, lB = dos LÍNEAS distintas de la misma máquina M1 (puestos sucesivos en el tiempo).
  const all = [
    mkRow({ id: 'a-may', year: 2026, month: 5, contract_machine_id: 'lA', counter_bw: 1000, counter_color: 200 }, 'M1', 'cA'),
    mkRow({ id: 'b-jun', year: 2026, month: 6, contract_machine_id: 'lB', counter_bw: 200,  counter_color: 40  }, 'M1', 'cB'),
  ]

  it('la línea A no ve el relevé de B y viceversa (atribución por línea)', () => {
    const forA = countersForLine('lA', '2026-04-01', '2026-06-10', all)
    const forB = countersForLine('lB', '2026-06-11', null,        all)
    expect(forA.map(c => c.id)).toEqual(['a-may'])
    expect(forB.map(c => c.id)).toEqual(['b-jun'])
  })

  it('un relevé heredado sin contract_machine_id se atribuye por el intervalo de vigencia de la línea', () => {
    const withLegacy = [
      ...all,
      mkRow({ id: 'legacy-jun', year: 2026, month: 6, day: 5, contract_machine_id: null, counter_bw: 50, counter_color: 10 }, 'M1', null),
    ]
    const forA = countersForLine('lA', '2026-04-01', '2026-06-10', withLegacy)
    const forB = countersForLine('lB', '2026-06-11', null,        withLegacy)
    expect(forA.map(c => c.id).sort()).toEqual(['a-may', 'legacy-jun'])
    expect(forB.map(c => c.id)).toEqual(['b-jun'])
  })

  it('invariante de no-solapamiento: relevé legacy en el día-frontera cuenta en UNA sola línea', () => {
    const X = '2026-06-10'
    const onFrontier = [
      mkRow({ id: 'legacy-X', year: 2026, month: 6, day: 10, contract_machine_id: null, counter_bw: 500, counter_color: 100 }, 'M1', null),
    ]
    const forA = countersForLine('lA', '2026-04-01', X,   onFrontier)
    const forB = countersForLine('lB', X,          null, onFrontier)
    expect(forA.map(c => c.id)).toEqual(['legacy-X'])
    expect(forB).toEqual([])
    expect(forA.length + forB.length).toBe(1)
  })
})

// Query builder encadenable y "awaitable" que devuelve un resultado fijo {data,error}.
function makeQb(result: { data: unknown; error: unknown }) {
  const p: Record<string, unknown> = {}
  const chain = () => p
  Object.assign(p, {
    select: chain, eq: chain, lte: chain, or: chain, in: chain, not: chain, order: chain,
    maybeSingle: () => Promise.resolve(result),
    single: () => Promise.resolve(result),
    then: (resolve: (v: unknown) => unknown, reject?: (e: unknown) => unknown) =>
      Promise.resolve(result).then(resolve, reject),
  })
  return p
}
function makeAdmin(byTable: Record<string, { data: unknown; error: unknown }>) {
  return { from: (t: string) => makeQb(byTable[t] ?? { data: null, error: null }) } as unknown as ReturnType<typeof createAdminClient>
}

// ─────────────────────────────────────────────────────────────────────────────
// BLOQUE D / P1-6 — facturabilidad por estado de contrato/línea.
// ─────────────────────────────────────────────────────────────────────────────
describe('Bloque D — isLineBillable (P1-6)', () => {
  it('contrato suspendu → NO factura', () => expect(isLineBillable('actif', 'suspendu', null)).toBe(false))
  it('línea suspendu → NO factura', () => expect(isLineBillable('suspendu', 'actif', null)).toBe(false))
  it('contrato terminé con línea aún abierta → NO factura (huérfana)', () => expect(isLineBillable('actif', 'terminé', null)).toBe(false))
  it('contrato terminé con línea cerrada (date_fin) → SÍ factura su mes de cierre', () => expect(isLineBillable('terminé', 'terminé', '2026-06-10')).toBe(true))
  it('línea terminé por retirada/reemplazo, contrato actif → SÍ factura (H-D6)', () => expect(isLineBillable('terminé', 'actif', '2026-06-10')).toBe(true))
  it('todo actif → factura', () => expect(isLineBillable('actif', 'actif', null)).toBe(true))
})

// ─────────────────────────────────────────────────────────────────────────────
// FORMA B — regla del mes facturado (computeInvoiceMonth). Spec §4.3.
// ─────────────────────────────────────────────────────────────────────────────
describe('FORMA B — computeInvoiceMonth (mes anterior al vencimiento más cercano al cierre)', () => {
  it('día 1, cierre 03-jun → mayo', () => {
    expect(computeInvoiceMonth(1, '2026-06-03')).toEqual({ year: 2026, month: 5 })
  })
  it('día 1, cierre 29-abr (unos días ANTES del día 1) → abril, no marzo', () => {
    expect(computeInvoiceMonth(1, '2026-04-29')).toEqual({ year: 2026, month: 4 })
  })
  it('día 1, cierre 01-jul (justo el vencimiento) → junio', () => {
    expect(computeInvoiceMonth(1, '2026-07-01')).toEqual({ year: 2026, month: 6 })
  })
  it('día 20, cierre 20-may → abril (Opción 1 del usuario)', () => {
    expect(computeInvoiceMonth(20, '2026-05-20')).toEqual({ year: 2026, month: 4 })
  })
  it('cruce de año: día 1, cierre 02-ene → diciembre del año anterior', () => {
    expect(computeInvoiceMonth(1, '2026-01-02')).toEqual({ year: 2025, month: 12 })
  })
  it('B4: cierre equidistante entre dos vencimientos → mes PASADO (tie-break determinista)', () => {
    // día 15, cierre 30-abr: a 15 días tanto de 15-abr como de 15-may → gana el vencimiento pasado
    // (15-abr) → mes facturado = marzo.
    expect(computeInvoiceMonth(15, '2026-04-30')).toEqual({ year: 2026, month: 3 })
  })

  // Regla dual N7 — FIN DE MES (billing_day 29/30/31): el mes facturado es el MISMO del vencimiento.
  it('fin de mes (día 31), cierre 31-may → mayo', () => {
    expect(computeInvoiceMonth(31, '2026-05-31')).toEqual({ year: 2026, month: 5 })
  })
  it('fin de mes (día 31), cierre 28-feb → febrero (clamp al último día)', () => {
    expect(computeInvoiceMonth(31, '2026-02-28')).toEqual({ year: 2026, month: 2 })
  })
  it('fin de mes (día 31) en bisiesto, cierre 29-feb → febrero', () => {
    expect(computeInvoiceMonth(31, '2024-02-29')).toEqual({ year: 2024, month: 2 })
  })
  it('fin de mes (día 31), cierre 30-jun → junio', () => {
    expect(computeInvoiceMonth(31, '2026-06-30')).toEqual({ year: 2026, month: 6 })
  })
  it('fin de mes (día 30), cierre 30-abr → abril', () => {
    expect(computeInvoiceMonth(30, '2026-04-30')).toEqual({ year: 2026, month: 4 })
  })
  it('fin de mes (día 31), cruce de año, cierre 31-dic → diciembre', () => {
    expect(computeInvoiceMonth(31, '2026-12-31')).toEqual({ year: 2026, month: 12 })
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// FORMA B — buildContractInvoiceDraft: factura por contrato y mes, con fechas reales.
// ─────────────────────────────────────────────────────────────────────────────
describe('FORMA B — buildContractInvoiceDraft', () => {
  const contractRow = {
    id: 'ctr-1', numero_contrat: 'CT-2026-001', client_id: 7, billing_day: 1, statut: 'actif',
    clients: { id: 7, nom_client: 'ACME' },
  }
  const lineRow = {
    id: 'cm-1', machine_id: 'M1', billing_plan_id: 'plan-1',
    date_debut: '2026-01-01', date_fin: null, statut: 'actif', replaces_contract_machine_id: null,
    start_counter_bw: null, start_counter_color: null, end_counter_bw: null, end_counter_color: null,
    price_bw_override: null, price_color_override: null, fixed_fee_override: null,
    billing_plans: { id: 'plan-1', name: 'Par copie', type: 'per_copy', fixed_fee: null, price_bw: 10, price_color: 50, tiers: null },
    machines: { numero_serie: 'M1', marque: 'HP', modele: 'X' },
  }
  const mkRowC = (id: string, year: number, month: number, day: number, bw: number, color: number) => ({
    id, machine_id: 'M1', contract_id: 'ctr-1', contract_machine_id: null,
    reading_date: `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`,
    year, month, day, counter_bw: bw, counter_color: color,
    status: 'actif', is_replacement_start: false, previous_machine_id: null,
    annulation_reason: null, annule_at: null, notes: null,
    recorded_at: `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}T10:00:00Z`,
  })
  const counterRows = [
    mkRowC('c-abr', 2026, 4, 29, 1000, 200),
    mkRowC('c-jun', 2026, 6, 3,  1500, 260),
  ]

  it('factura el mes de mayo con el periodo real 29/04 → 03/06 y consumo = 1500 − 1000', async () => {
    vi.mocked(createAdminClient).mockReturnValue(makeAdmin({
      contracts:         { data: contractRow, error: null },
      contract_machines: { data: [lineRow],   error: null },
      machine_counters:  { data: counterRows, error: null },
    }))
    const draft = await buildContractInvoiceDraft('ctr-1', 2026, 5)
    expect(draft).not.toBeNull()
    expect(draft!.period_start).toBe('2026-04-29')
    expect(draft!.period_end).toBe('2026-06-03')
    expect(draft!.period_year).toBe(2026)
    expect(draft!.period_month).toBe(5)
    expect(draft!.lines).toHaveLength(1)
    expect(draft!.lines[0].delta_bw).toBe(500)
    expect(draft!.lines[0].amount_total).toBe(500 * 10 + 60 * 50)   // 8000
    expect(draft!.total_amount).toBe(8000)
    expect(draft!.has_estimated).toBe(false)
  })

  it('mes sin tanda (ninguna lectura de cierre etiquetada) → null', async () => {
    vi.mocked(createAdminClient).mockReturnValue(makeAdmin({
      contracts:         { data: contractRow, error: null },
      contract_machines: { data: [lineRow],   error: null },
      machine_counters:  { data: counterRows, error: null },
    }))
    // En julio nadie cierra (no hay lectura ~1-ago) → no hay nada que facturar.
    await expect(buildContractInvoiceDraft('ctr-1', 2026, 7)).resolves.toBeNull()
  })

  it('mes de PURO ARRANQUE (solo la lectura base, sin apertura) → null (caso 2AS abril)', async () => {
    // counterRows tiene 29-abr (base) y 03-jun. Facturar abril: el cierre sería 29-abr pero no hay
    // apertura previa ni start_counter → todo arranque → no se factura el mes de instalación.
    vi.mocked(createAdminClient).mockReturnValue(makeAdmin({
      contracts:         { data: contractRow, error: null },
      contract_machines: { data: [lineRow],   error: null },
      machine_counters:  { data: counterRows, error: null },
    }))
    await expect(buildContractInvoiceDraft('ctr-1', 2026, 4)).resolves.toBeNull()
  })

  it('máquina muda (sin lectura este mes pero activa) entra estimada al forfait si hay tanda', async () => {
    const hybridPlan = { id: 'plan-h', name: 'Forfait', type: 'hybrid', fixed_fee: 5000, price_bw: 10, price_color: 50, tiers: null }
    const lineA = { ...lineRow, id: 'cm-A', machine_id: 'M1', billing_plans: hybridPlan, machines: { numero_serie: 'M1', marque: 'HP', modele: 'X' } }
    const lineB = { ...lineRow, id: 'cm-B', machine_id: 'M2', billing_plans: hybridPlan, machines: { numero_serie: 'M2', marque: 'HP', modele: 'Y' } }
    // Solo M1 tiene recogidas; M2 está muda este mes.
    const rows = [
      mkRowC('a1', 2026, 4, 29, 1000, 200),
      mkRowC('a2', 2026, 6, 3,  1500, 260),
    ].map(r => ({ ...r, machine_id: 'M1' }))
    vi.mocked(createAdminClient).mockReturnValue(makeAdmin({
      contracts:         { data: contractRow, error: null },
      contract_machines: { data: [lineA, lineB], error: null },
      machine_counters:  { data: rows, error: null },
    }))
    const draft = await buildContractInvoiceDraft('ctr-1', 2026, 5)
    expect(draft).not.toBeNull()
    const byMachine = Object.fromEntries(draft!.lines.map(l => [l.machine_id, l]))
    expect(byMachine['M1'].is_estimated).toBe(false)
    expect(byMachine['M1'].amount_total).toBe(5000 + 500 * 10 + 60 * 50)
    expect(byMachine['M2'].is_estimated).toBe(true)        // muda → estimada
    expect(byMachine['M2'].amount_total).toBe(5000)        // solo forfait
    expect(draft!.has_estimated).toBe(true)
  })

  it('máquina añadida DESPUÉS del mes facturado NO aparece en la factura', async () => {
    const hybridPlan = { id: 'plan-h', name: 'Forfait', type: 'hybrid', fixed_fee: 5000, price_bw: 10, price_color: 50, tiers: null }
    // M1 tiene la tanda de mayo (cierra 03-jun). M2 entró el 15-jul (después de la tanda).
    const lineA = { ...lineRow, id: 'cm-A', machine_id: 'M1', date_debut: '2026-01-01', billing_plans: hybridPlan, machines: { numero_serie: 'M1', marque: 'HP', modele: 'X' } }
    const lineB = { ...lineRow, id: 'cm-B', machine_id: 'M2', date_debut: '2026-07-15', billing_plans: hybridPlan, machines: { numero_serie: 'M2', marque: 'HP', modele: 'Y' } }
    const rows = [
      mkRowC('a1', 2026, 4, 29, 1000, 200),
      mkRowC('a2', 2026, 6, 3,  1500, 260),
    ]
    vi.mocked(createAdminClient).mockReturnValue(makeAdmin({
      contracts:         { data: contractRow, error: null },
      contract_machines: { data: [lineA, lineB], error: null },
      machine_counters:  { data: rows, error: null },
    }))
    const draft = await buildContractInvoiceDraft('ctr-1', 2026, 5)
    expect(draft).not.toBeNull()
    expect(draft!.lines).toHaveLength(1)            // solo M1; M2 (futura) excluida
    expect(draft!.lines[0].machine_id).toBe('M1')
  })

  // Historial previo de MAYO (cerró con la lectura del 02-jun) para encadenar el mes de JUNIO.
  const mayInvoiced = { data: [{
    period_year: 2026, period_month: 5,
    invoice_lines: [{
      contract_machine_id: 'cm-1', closing_counter_id: 'c-may2',
      closing_reading_date: '2026-06-02', closing_counter_bw: 1500, closing_counter_color: 260,
    }],
  }], error: null }

  it('desfase (N9): facturado mayo; un contador que llega el 20-jun cierra JUNIO en la secuencia', async () => {
    const rows = [
      mkRowC('c-may2', 2026, 6, 2,  1500, 260),   // cerró mayo (en el historial)
      mkRowC('c-late', 2026, 6, 20, 1800, 280),   // llega tarde → cierra junio (secuencia)
    ]
    vi.mocked(createAdminClient).mockReturnValue(makeAdmin({
      contracts:         { data: contractRow, error: null },
      contract_machines: { data: [lineRow],   error: null },
      machine_counters:  { data: rows, error: null },
      invoices:          mayInvoiced,
    }))
    const draft = await buildContractInvoiceDraft('ctr-1', 2026, 6)
    expect(draft).not.toBeNull()
    expect(draft!.period_month).toBe(6)
    expect(draft!.lines[0].delta_bw).toBe(300)      // 1800 − 1500 (apertura = cierre de mayo)
    expect(draft!.lines[0].close_date).toBe('2026-06-20')
    expect(draft!.lines[0].is_estimated).toBe(false)
  })

  it('mes solo-fijo (N8): facturado mayo, sin lectura nueva en junio → solo forfait estimado', async () => {
    const hybridPlan = { id: 'plan-h', name: 'Forfait', type: 'hybrid', fixed_fee: 5000, price_bw: 10, price_color: 50, tiers: null }
    const lineH = { ...lineRow, billing_plans: hybridPlan }
    const rows = [mkRowC('c-may2', 2026, 6, 2, 1500, 260)]   // solo el cierre de mayo; nada nuevo en junio
    vi.mocked(createAdminClient).mockReturnValue(makeAdmin({
      contracts:         { data: contractRow, error: null },
      contract_machines: { data: [lineH],     error: null },
      machine_counters:  { data: rows, error: null },
      invoices:          mayInvoiced,
    }))
    const draft = await buildContractInvoiceDraft('ctr-1', 2026, 6)
    expect(draft).not.toBeNull()
    expect(draft!.period_month).toBe(6)
    expect(draft!.lines[0].is_estimated).toBe(true)
    expect(draft!.lines[0].delta_bw).toBe(0)
    expect(draft!.lines[0].close_date).toBeNull()   // sin cierre nuevo → el punto de partida no avanza
    expect(draft!.lines[0].amount_total).toBe(5000) // solo el forfait
    expect(draft!.has_estimated).toBe(true)
  })

  it('P0 reemplazo consolidado: la línea conserva la IDENTIDAD de cierre de B (no la de A)', async () => {
    const planH = { id: 'plan-h', name: 'Forfait', type: 'hybrid', fixed_fee: 5000, price_bw: 10, price_color: 50, tiers: null }
    // A (M1): se cierra el 15-jun con end_counter 1700; abrió con la lectura base 30-abr (1000).
    // B (M2): reemplaza a A el 15-jun con start_counter 0 y AÚN sin lectura real posterior.
    const lineA = { ...lineRow, id: 'cm-A', machine_id: 'M1', date_fin: '2026-06-15',
      end_counter_bw: 1700, end_counter_color: 300, billing_plans: planH, machines: { numero_serie: 'M1', marque: 'HP', modele: 'X' } }
    const lineB = { ...lineRow, id: 'cm-B', machine_id: 'M2', date_debut: '2026-06-15',
      replaces_contract_machine_id: 'cm-A', start_counter_bw: 0, start_counter_color: 0,
      billing_plans: planH, machines: { numero_serie: 'M2', marque: 'HP', modele: 'Y' } }
    const rows = [mkRowC('a-base', 2026, 4, 30, 1000, 200)]   // solo M1; M2 sin lecturas
    vi.mocked(createAdminClient).mockReturnValue(makeAdmin({
      contracts:         { data: contractRow, error: null },
      contract_machines: { data: [lineA, lineB], error: null },
      machine_counters:  { data: rows, error: null },
    }))
    const draft = await buildContractInvoiceDraft('ctr-1', 2026, 5)   // 15-jun (día 1) ancla mayo
    expect(draft).not.toBeNull()
    expect(draft!.lines).toHaveLength(1)
    const line = draft!.lines[0]
    expect(line.machine_id).toBe('M2')                   // cabeza = B (la máquina entrante)
    expect(line.delta_bw).toBe(700)                      // consumo consolidado A(700) + B(0)
    expect(line.close_date).toBe('2026-06-15')           // DISPLAY: hasta el cierre de A
    expect(line.closing_reading_date).toBeNull()         // IDENTIDAD: B no cerró → NO corrompe la cadena
    expect(line.closing_counter_bw).toBeNull()
    expect(line.breakdown).toHaveLength(2)               // trazabilidad por tramo (§5)
  })

  it('contrato inexistente → null', async () => {
    vi.mocked(createAdminClient).mockReturnValue(makeAdmin({ contracts: { data: null, error: null } }))
    await expect(buildContractInvoiceDraft('nope', 2026, 5)).resolves.toBeNull()
  })

  it('error técnico al leer el contrato → BillingDataError', async () => {
    vi.mocked(createAdminClient).mockReturnValue(makeAdmin({ contracts: { data: null, error: { message: 'boom' } } }))
    await expect(buildContractInvoiceDraft('ctr-1', 2026, 5)).rejects.toBeInstanceOf(BillingDataError)
  })

  it('error técnico al leer contadores (P0-7: nunca factura 0) → BillingDataError', async () => {
    vi.mocked(createAdminClient).mockReturnValue(makeAdmin({
      contracts:         { data: contractRow, error: null },
      contract_machines: { data: [lineRow],   error: null },
      machine_counters:  { data: null, error: { message: 'boom' } },
    }))
    await expect(buildContractInvoiceDraft('ctr-1', 2026, 5)).rejects.toBeInstanceOf(BillingDataError)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// MOTOR DE CADENA (spec v3.1 §4) — computeLineChainConsumption. Gate §9.
// ─────────────────────────────────────────────────────────────────────────────
describe('MOTOR DE CADENA — computeLineChainConsumption', () => {
  const NL: LineCounters = {
    date_debut: '2026-01-01', date_fin: null,
    start_counter_bw: null, start_counter_color: null, end_counter_bw: null, end_counter_color: null,
  }
  const start = (bw: number, color: number, date: string, id: string, rec = ''): ChainStart => ({
    counter_id: id || null, reading_date: date, counter_bw: bw, counter_color: color, recorded_at: rec || null,
  })

  it('arranque puro (solo la lectura BASE, sin apertura previa) → estimada, sin cierre, opening_is_base', () => {
    const cs = [mkCounter({ id: 'base', year: 2026, month: 4, day: 29, counter_bw: 1000, counter_color: 200 })]
    const r = computeLineChainConsumption(NL, cs, null)
    expect(r.opening_is_base).toBe(true)
    expect(r.is_estimated).toBe(true)
    expect(r.closing_counter_id).toBeNull()
    expect(r.opening_counter_id).toBe('base')
  })

  it('2AS: 1ª factura = base 29-abr → cierre 03-jun (la más antigua posterior), delta 500/60', () => {
    const cs = [
      mkCounter({ id: 'c-abr', year: 2026, month: 4, day: 29, counter_bw: 1000, counter_color: 200 }),
      mkCounter({ id: 'c-jun', year: 2026, month: 6, day: 3,  counter_bw: 1500, counter_color: 260 }),
    ]
    const r = computeLineChainConsumption(NL, cs, null)
    expect(r.is_estimated).toBe(false)
    expect(r.delta_bw).toBe(500)
    expect(r.delta_color).toBe(60)
    expect(r.opening_counter_id).toBe('c-abr')
    expect(r.closing_counter_id).toBe('c-jun')
    expect(r.closing_reading_date).toBe('2026-06-03')
  })

  it('Gate §9.5 — dos contadores de golpe: cada llamada toma la MÁS ANTIGUA posterior', () => {
    const cs = [
      mkCounter({ id: 'abr', year: 2026, month: 5, day: 2,  counter_bw: 1000, counter_color: 200 }), // cierre de abril
      mkCounter({ id: 'may', year: 2026, month: 6, day: 2,  counter_bw: 1500, counter_color: 260 }), // 02-jun
      mkCounter({ id: 'jun', year: 2026, month: 6, day: 30, counter_bw: 2000, counter_color: 300 }), // 30-jun
    ]
    // Facturado abril (prevClose = lectura 02-may). Mayo usa 02-jun.
    const mayo = computeLineChainConsumption(NL, cs, start(1000, 200, '2026-05-02', 'abr', '2026-05-02T10:00:00Z'))
    expect(mayo.closing_counter_id).toBe('may')
    expect(mayo.delta_bw).toBe(500)
    // Facturado mayo (prevClose = 02-jun). Junio usa 30-jun.
    const junio = computeLineChainConsumption(NL, cs, start(1500, 260, '2026-06-02', 'may', '2026-06-02T10:00:00Z'))
    expect(junio.closing_counter_id).toBe('jun')
    expect(junio.delta_bw).toBe(500)
  })

  it('Gate §9.6 — desfase: contador tardío cierra el siguiente tramo (no se salta nada)', () => {
    const cs = [
      mkCounter({ id: 'abr', year: 2026, month: 5, day: 2,  counter_bw: 1000, counter_color: 200 }),
      mkCounter({ id: 'late', year: 2026, month: 6, day: 20, counter_bw: 1800, counter_color: 280 }),
    ]
    // Facturado abril; llega un contador el 20-jun → cierra el siguiente tramo (etiquetado mayo por la secuencia).
    const r = computeLineChainConsumption(NL, cs, start(1000, 200, '2026-05-02', 'abr', '2026-05-02T10:00:00Z'))
    expect(r.closing_counter_id).toBe('late')
    expect(r.delta_bw).toBe(800)
  })

  it('Gate §9.7 — mes solo-fijo: sin lectura posterior al punto de partida → sin cierre (delta 0)', () => {
    const cs = [mkCounter({ id: 'abr', year: 2026, month: 5, day: 2, counter_bw: 1000, counter_color: 200 })]
    const r = computeLineChainConsumption(NL, cs, start(1000, 200, '2026-05-02', 'abr', '2026-05-02T10:00:00Z'))
    expect(r.is_estimated).toBe(true)
    expect(r.closing_counter_id).toBeNull()
    expect(r.opening_reading_date).toBe('2026-05-02')
  })

  it('Gate §9.7 (cont.) — tras un mes solo-fijo, el punto de partida NO avanza: acumula copias', () => {
    const cs = [
      mkCounter({ id: 'abr', year: 2026, month: 5, day: 2, counter_bw: 1000, counter_color: 200 }),
      mkCounter({ id: 'jun', year: 2026, month: 7, day: 1, counter_bw: 2000, counter_color: 300 }),
    ]
    // mayo se facturó solo-fijo (no avanzó). Ahora junio: prevClose sigue siendo el cierre de abril (02-may).
    const r = computeLineChainConsumption(NL, cs, start(1000, 200, '2026-05-02', 'abr', '2026-05-02T10:00:00Z'))
    expect(r.delta_bw).toBe(1000)   // mayo + junio juntos, sin perder copias
    expect(r.closing_counter_id).toBe('jun')
  })

  it('B1 — start_counter y lectura el MISMO día: la lectura cuenta como cierre', () => {
    const sameDay: LineCounters = {
      date_debut: '2026-07-01', date_fin: null,
      start_counter_bw: 100, start_counter_color: 20, end_counter_bw: null, end_counter_color: null,
    }
    const cs = [mkCounter({ id: 'x', year: 2026, month: 7, day: 1, counter_bw: 250, counter_color: 60 })]
    const r = computeLineChainConsumption(sameDay, cs, null)
    expect(r.is_estimated).toBe(false)
    expect(r.delta_bw).toBe(150)
    expect(r.opening_counter_id).toBeNull()       // apertura = start_counter (sintético)
    expect(r.closing_counter_id).toBe('x')
  })

  it('cierre por reemplazo con AMBOS end_counter usa el end_counter en date_fin', () => {
    const replLine: LineCounters = {
      date_debut: '2026-01-01', date_fin: '2026-06-03',
      start_counter_bw: null, start_counter_color: null, end_counter_bw: 1400, end_counter_color: 250,
    }
    const cs = [mkCounter({ id: 'c-abr', year: 2026, month: 4, day: 29, counter_bw: 1000, counter_color: 200 })]
    const r = computeLineChainConsumption(replLine, cs, null)
    expect(r.is_estimated).toBe(false)
    expect(r.delta_bw).toBe(400)                  // 1400 − 1000
    expect(r.closing_reading_date).toBe('2026-06-03')
    expect(r.closing_counter_id).toBeNull()       // end_counter sintético
  })

  it('P0 reemplazo: el end_counter NO salta una lectura real intermedia anterior al reemplazo', () => {
    // Apertura 30-abr (1000); lectura real 31-may (1500); reemplazo 15-jun con end_counter 1700.
    const replLine: LineCounters = {
      date_debut: '2026-01-01', date_fin: '2026-06-15',
      start_counter_bw: null, start_counter_color: null, end_counter_bw: 1700, end_counter_color: 300,
    }
    const cs = [mkCounter({ id: 'c-may', year: 2026, month: 5, day: 31, counter_bw: 1500, counter_color: 260 })]

    // Tramo de mayo: cierra con la lectura REAL del 31-may (la más antigua posterior), NO con el end_counter.
    const mayo = computeLineChainConsumption(replLine, cs, start(1000, 200, '2026-04-30', 'prev', '2026-04-30T10:00:00Z'))
    expect(mayo.closing_counter_id).toBe('c-may')
    expect(mayo.closing_reading_date).toBe('2026-05-31')
    expect(mayo.delta_bw).toBe(500)               // 1500 − 1000
    expect(mayo.delta_color).toBe(60)

    // Tramo final: ya facturado hasta 31-may → ahora sí cierra con el end_counter del reemplazo (15-jun).
    const fin = computeLineChainConsumption(replLine, cs, start(1500, 260, '2026-05-31', 'c-may', '2026-05-31T10:00:00Z'))
    expect(fin.closing_counter_id).toBeNull()     // end_counter sintético
    expect(fin.closing_reading_date).toBe('2026-06-15')
    expect(fin.delta_bw).toBe(200)                // 1700 − 1500
    expect(fin.delta_color).toBe(40)
  })

  it('P0 same-day: una lectura real en date_fin cierra ANTES que el end_counter; el final usa el end_counter', () => {
    // date_fin = 15-jun con end_counter 1700; y una lectura REAL también el 15-jun = 1600.
    const replLine: LineCounters = {
      date_debut: '2026-01-01', date_fin: '2026-06-15',
      start_counter_bw: null, start_counter_color: null, end_counter_bw: 1700, end_counter_color: 300,
    }
    const cs = [mkCounter({ id: 'real', year: 2026, month: 6, day: 15, counter_bw: 1600, counter_color: 280 })]

    // Tramo 1 (apertura 30-abr): cierra con la LECTURA REAL del 15-jun, no con el end_counter.
    const t1 = computeLineChainConsumption(replLine, cs, start(1000, 200, '2026-04-30', 'prev', '2026-04-30T10:00:00Z'))
    expect(t1.closing_counter_id).toBe('real')
    expect(t1.delta_bw).toBe(600)                 // 1600 − 1000

    // Tramo 2 (apertura = la lectura real del 15-jun): cierra con el end_counter sintético (mismo día).
    const t2 = computeLineChainConsumption(replLine, cs, start(1600, 280, '2026-06-15', 'real', '2026-06-15T10:00:00Z'))
    expect(t2.closing_counter_id).toBeNull()
    expect(t2.closing_reading_date).toBe('2026-06-15')
    expect(t2.delta_bw).toBe(100)                 // 1700 − 1600 (copias que NO se pueden perder)
  })

  it('delta negativo (reset) → estimada, conservando identidad de apertura/cierre', () => {
    const cs = [
      mkCounter({ id: 'a', year: 2026, month: 4, day: 29, counter_bw: 1000, counter_color: 200 }),
      mkCounter({ id: 'b', year: 2026, month: 6, day: 3,  counter_bw: 900,  counter_color: 200 }),
    ]
    const r = computeLineChainConsumption(NL, cs, null)
    expect(r.is_estimated).toBe(true)
    expect(r.delta_bw).toBe(0)
    expect(r.closing_counter_id).toBe('b')
  })
})

describe('P1-5 — buildContractInvoiceDraft usa la tarifa VIGENTE a la fecha de apertura', () => {
  const contractRow = {
    id: 'ctr-1', numero_contrat: 'CT-2026-001', client_id: 7, billing_day: 1, statut: 'actif',
    clients: { id: 7, nom_client: 'ACME' },
  }
  const lineRow = {
    id: 'cm-1', machine_id: 'M1', billing_plan_id: 'plan-1',
    date_debut: '2026-01-01', date_fin: null, statut: 'actif', replaces_contract_machine_id: null,
    start_counter_bw: null, start_counter_color: null, end_counter_bw: null, end_counter_color: null,
    price_bw_override: null, price_color_override: null, fixed_fee_override: null,
    billing_plans: { id: 'plan-1', name: 'Par copie', type: 'per_copy', fixed_fee: null, price_bw: 20, price_color: 100, tiers: null },
    machines: { numero_serie: 'M1', marque: 'HP', modele: 'X' },
  }
  // Precio viejo 10/50 desde enero; SUBIDA a 20/100 desde el 15-may.
  const planVersions = [
    { plan_id: 'plan-1', effective_from: '2026-01-01', type: 'per_copy', fixed_fee: null, price_bw: 10, price_color: 50, tiers: null },
    { plan_id: 'plan-1', effective_from: '2026-05-15', type: 'per_copy', fixed_fee: null, price_bw: 20, price_color: 100, tiers: null },
  ]
  const mk = (id: string, year: number, month: number, day: number, bw: number, color: number) => ({
    id, machine_id: 'M1', contract_id: 'ctr-1', contract_machine_id: null,
    reading_date: `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`,
    year, month, day, counter_bw: bw, counter_color: color,
    status: 'actif', is_replacement_start: false, previous_machine_id: null,
    annulation_reason: null, annule_at: null, notes: null,
    recorded_at: `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}T10:00:00Z`,
  })
  const counterRows = [
    mk('c-abr', 2026, 4, 30, 1000, 200),   // cierra abril
    mk('c-jun', 2026, 6, 3,  1500, 260),   // cierra mayo (apertura 30-abr < subida)
    mk('c-jul', 2026, 7, 1,  2000, 300),   // cierra junio (apertura 03-jun > subida)
  ]
  const admin = () => makeAdmin({
    contracts:             { data: contractRow,  error: null },
    contract_machines:     { data: [lineRow],    error: null },
    machine_counters:      { data: counterRows,  error: null },
    billing_plan_versions: { data: planVersions, error: null },
    contract_machine_override_versions: { data: [], error: null },
  })

  it('mayo (apertura 30-abr, antes de la subida) → precio viejo 10/50', async () => {
    vi.mocked(createAdminClient).mockReturnValue(admin())
    const draft = await buildContractInvoiceDraft('ctr-1', 2026, 5)
    expect(draft!.period_start).toBe('2026-04-30')
    expect(draft!.lines[0].price_bw).toBe(10)
    expect(draft!.lines[0].amount_total).toBe(500 * 10 + 60 * 50)   // 8000
  })

  it('junio (apertura 03-jun, tras la subida) → precio nuevo 20/100', async () => {
    // Modelo de cadena: para facturar junio, MAYO ya debe estar facturado (historial). La factura de
    // mayo cerró con la lectura del 03-jun → es el punto de partida del tramo de junio.
    vi.mocked(createAdminClient).mockReturnValue(makeAdmin({
      contracts:             { data: contractRow,  error: null },
      contract_machines:     { data: [lineRow],    error: null },
      machine_counters:      { data: counterRows,  error: null },
      billing_plan_versions: { data: planVersions, error: null },
      contract_machine_override_versions: { data: [], error: null },
      invoices: { data: [{
        period_year: 2026, period_month: 5,
        invoice_lines: [{
          contract_machine_id: 'cm-1', closing_counter_id: 'c-jun',
          closing_reading_date: '2026-06-03', closing_counter_bw: 1500, closing_counter_color: 260,
        }],
      }], error: null },
    }))
    const draft = await buildContractInvoiceDraft('ctr-1', 2026, 6)
    expect(draft!.period_start).toBe('2026-06-03')
    expect(draft!.lines[0].delta_bw).toBe(500)    // 2000 − 1500
    expect(draft!.lines[0].price_bw).toBe(20)
    expect(draft!.lines[0].amount_total).toBe(500 * 20 + 40 * 100)  // 14000
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// MOTOR DE CADENA — listReadyToBill: un mes por contrato (secuencia) y nunca futuros.
// ─────────────────────────────────────────────────────────────────────────────
describe('MOTOR DE CADENA — listReadyToBill', () => {
  const contractNested = {
    id: 'ctr-1', numero_contrat: 'CT-2026-001', billing_day: 1, statut: 'actif',
    clients: { nom_client: 'ACME' },
  }
  // Fila de contract_machines que satisface el select de listReadyToBill Y el de buildDraft (anidados).
  const cmRow = {
    id: 'cm-1', contract_id: 'ctr-1', machine_id: 'M1', billing_plan_id: 'plan-1',
    date_debut: '2026-01-01', date_fin: null, statut: 'actif', replaces_contract_machine_id: null,
    start_counter_bw: null, start_counter_color: null, end_counter_bw: null, end_counter_color: null,
    price_bw_override: null, price_color_override: null, fixed_fee_override: null,
    billing_plans: { id: 'plan-1', name: 'Par copie', type: 'per_copy', fixed_fee: null, price_bw: 10, price_color: 50, tiers: null },
    machines: { numero_serie: 'M1', marque: 'HP', modele: 'X' },
    contracts: contractNested,
  }
  const contractRow = { id: 'ctr-1', numero_contrat: 'CT-2026-001', client_id: 7, billing_day: 1, statut: 'actif', clients: { id: 7, nom_client: 'ACME' } }
  const mkRow = (id: string, y: number, m: number, d: number, bw: number, color: number) => ({
    id, machine_id: 'M1', contract_id: 'ctr-1', contract_machine_id: null,
    reading_date: `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`,
    year: y, month: m, day: d, counter_bw: bw, counter_color: color,
    status: 'actif', is_replacement_start: false, previous_machine_id: null,
    annulation_reason: null, annule_at: null, notes: null,
    recorded_at: `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}T10:00:00Z`,
  })
  const adminWith = (counters: unknown[]) => makeAdmin({
    contract_machines: { data: [cmRow], error: null },
    machine_counters:  { data: counters, error: null },
    invoices:          { data: [], error: null },
    contracts:         { data: contractRow, error: null },
    billing_plan_versions: { data: [], error: null },
    contract_machine_override_versions: { data: [], error: null },
  })

  it('ofrece el primer mes (mayo) cuando hay base + cierre y el mes ya pasó', async () => {
    vi.useFakeTimers(); vi.setSystemTime(new Date('2026-06-17T08:00:00Z'))
    vi.mocked(createAdminClient).mockReturnValue(adminWith([
      mkRow('base', 2026, 4, 30, 1000, 200),
      mkRow('clo',  2026, 6, 3,  1500, 260),
    ]))
    const list = await listReadyToBill()
    vi.useRealTimers()
    expect(list).toHaveLength(1)
    expect(list[0].contract_id).toBe('ctr-1')
    expect(list[0].period_year).toBe(2026)
    expect(list[0].period_month).toBe(5)
  })

  it('NO ofrece un mes futuro (mes actual en hora de Dakar/UTC)', async () => {
    // Hoy = 15-abr-2026; el primer cierre (03-jun, día 1) anclaría mayo → mes futuro → no se ofrece.
    vi.useFakeTimers(); vi.setSystemTime(new Date('2026-04-15T08:00:00Z'))
    vi.mocked(createAdminClient).mockReturnValue(adminWith([
      mkRow('base', 2026, 4, 30, 1000, 200),
      mkRow('clo',  2026, 6, 3,  1500, 260),
    ]))
    const list = await listReadyToBill()
    vi.useRealTimers()
    expect(list).toHaveLength(0)
  })

  it('contrato sin lecturas de cierre (solo base) → no se ofrece nada', async () => {
    vi.useFakeTimers(); vi.setSystemTime(new Date('2026-06-17T08:00:00Z'))
    vi.mocked(createAdminClient).mockReturnValue(adminWith([mkRow('base', 2026, 4, 30, 1000, 200)]))
    const list = await listReadyToBill()
    vi.useRealTimers()
    expect(list).toHaveLength(0)
  })
})
