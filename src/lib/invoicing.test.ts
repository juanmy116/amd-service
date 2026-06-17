import { describe, it, expect, vi } from 'vitest'
import { calcDeltas, counterDelta, type Counter } from '@/lib/counters'
import {
  countersForLine, BillingDataError, isLineBillable,
  computeInvoiceMonth, computeLineConsumptionByReadings, buildContractInvoiceDraft,
  type LineCounters,
} from '@/lib/invoicing'

// Mock del admin client de Supabase para los tests de buildContractInvoiceDraft (P0-7).
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: vi.fn() }))
import { createAdminClient } from '@/lib/supabase/admin'

// Helper: construye un relevé con valores por defecto razonables. `recorded_at` deriva de la
// fecha (year-month-day) para que el desempate por recorded_at sea coherente con la fecha real.
function mkCounter(p: Partial<Counter> & { id: string; year: number; month: number }): Counter {
  const day = p.day ?? 1
  return {
    day,
    counter_bw: 0,
    counter_color: 0,
    status: 'actif',
    is_replacement_start: false,
    previous_machine_id: null,
    annulation_reason: null,
    annule_at: null,
    notes: null,
    recorded_at: `${p.year}-${String(p.month).padStart(2, '0')}-${String(day).padStart(2, '0')}T10:00:00Z`,
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
describe('Bloque B — countersForLine (P0-3): cada línea solo ve los relevés de SU contrato', () => {
  const all = [
    mkRow({ id: 'a-may', year: 2026, month: 5, counter_bw: 1000, counter_color: 200 }, 'M1', 'cA'),
    mkRow({ id: 'b-jun', year: 2026, month: 6, counter_bw: 200,  counter_color: 40  }, 'M1', 'cB'),
  ]

  it('la línea de A no ve el relevé de B y viceversa', () => {
    const forA = countersForLine('cA', '2026-04-01', '2026-06-10', all)
    const forB = countersForLine('cB', '2026-06-11', null,        all)
    expect(forA.map(c => c.id)).toEqual(['a-may'])
    expect(forB.map(c => c.id)).toEqual(['b-jun'])
  })

  it('un relevé heredado sin contract_id se atribuye por el intervalo de vigencia de la línea', () => {
    const withLegacy = [
      ...all,
      mkRow({ id: 'legacy-jun', year: 2026, month: 6, day: 5, counter_bw: 50, counter_color: 10 }, 'M1', null),
    ]
    const forA = countersForLine('cA', '2026-04-01', '2026-06-10', withLegacy)
    const forB = countersForLine('cB', '2026-06-11', null,        withLegacy)
    expect(forA.map(c => c.id).sort()).toEqual(['a-may', 'legacy-jun'])
    expect(forB.map(c => c.id)).toEqual(['b-jun'])
  })

  it('invariante de no-solapamiento: relevé legacy en el día-frontera cuenta en UNA sola línea', () => {
    const X = '2026-06-10'
    const onFrontier = [
      mkRow({ id: 'legacy-X', year: 2026, month: 6, day: 10, counter_bw: 500, counter_color: 100 }, 'M1', null),
    ]
    const forA = countersForLine('cA', '2026-04-01', X,   onFrontier)
    const forB = countersForLine('cB', X,          null, onFrontier)
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
  it('clamp de fin de mes: día 31, cierre 01-mar → enero (vencimiento 28-feb)', () => {
    expect(computeInvoiceMonth(31, '2026-03-01')).toEqual({ year: 2026, month: 1 })
  })
  it('B4: cierre equidistante entre dos vencimientos → mes PASADO (tie-break determinista)', () => {
    // día 15, cierre 30-abr: a 15 días tanto de 15-abr como de 15-may → gana el vencimiento pasado
    // (15-abr) → mes facturado = marzo.
    expect(computeInvoiceMonth(15, '2026-04-30')).toEqual({ year: 2026, month: 3 })
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// FORMA B — consumo por línea entre lecturas reales (computeLineConsumptionByReadings). §4.1.
// ─────────────────────────────────────────────────────────────────────────────
describe('FORMA B — computeLineConsumptionByReadings', () => {
  const NL: LineCounters = {
    date_debut: '2026-01-01', date_fin: null,
    start_counter_bw: null, start_counter_color: null, end_counter_bw: null, end_counter_color: null,
  }
  // Caso real 2AS (día 1): recogidas el 29-abr y el 03-jun.
  const counters: Counter[] = [
    mkCounter({ id: 'c-abr', year: 2026, month: 4, day: 29, counter_bw: 1000, counter_color: 200 }),
    mkCounter({ id: 'c-jun', year: 2026, month: 6, day: 3,  counter_bw: 1500, counter_color: 260 }),
  ]

  it('factura de MAYO = entre la recogida del 29-abr y la del 03-jun, con fechas reales', () => {
    const r = computeLineConsumptionByReadings(NL, counters, 2026, 5, 1)
    expect(r.is_estimated).toBe(false)
    expect(r.delta_bw).toBe(500)            // 1500 − 1000
    expect(r.delta_color).toBe(60)          // 260 − 200
    expect(r.open_date).toBe('2026-04-29')
    expect(r.close_date).toBe('2026-06-03')
  })

  it('B1: máquina instalada y leída el MISMO día factura con start_counter (no estimada)', () => {
    const sameDay: LineCounters = {
      date_debut: '2026-07-01', date_fin: null,
      start_counter_bw: 100, start_counter_color: 20, end_counter_bw: null, end_counter_color: null,
    }
    const cs: Counter[] = [mkCounter({ id: 'x', year: 2026, month: 7, day: 1, counter_bw: 250, counter_color: 60 })]
    const r = computeLineConsumptionByReadings(sameDay, cs, 2026, 6, 1)  // 01-jul cierra junio
    expect(r.is_estimated).toBe(false)
    expect(r.delta_bw).toBe(150)            // 250 − 100 (antes daba estimada por date_debut < closeDate estricto)
    expect(r.open_date).toBe('2026-07-01')
  })

  it('B2: dos lecturas el MISMO día calendario → apertura = la de recorded_at anterior', () => {
    // El 03-jun se toman dos lecturas: 08:00 (cierre del periodo previo) y 16:00 (cierre de mayo).
    const cs: Counter[] = [
      mkCounter({ id: 'am', year: 2026, month: 6, day: 3, counter_bw: 1000, counter_color: 200, recorded_at: '2026-06-03T08:00:00Z' }),
      mkCounter({ id: 'pm', year: 2026, month: 6, day: 3, counter_bw: 1500, counter_color: 260, recorded_at: '2026-06-03T16:00:00Z' }),
    ]
    const r = computeLineConsumptionByReadings(NL, cs, 2026, 5, 1)  // ambas (03-jun, día 1) etiquetan mayo
    expect(r.is_estimated).toBe(false)
    expect(r.delta_bw).toBe(500)            // 1500 − 1000 (antes se perdía la apertura del mismo día)
    expect(r.open_date).toBe('2026-06-03')
    expect(r.close_date).toBe('2026-06-03')
  })

  it('la primera recogida (29-abr) es la BASE: facturar abril queda estimado (sin apertura)', () => {
    const r = computeLineConsumptionByReadings(NL, counters, 2026, 4, 1)
    expect(r.is_estimated).toBe(true)
    expect(r.delta_bw).toBe(0)
    expect(r.close_date).toBe('2026-04-29')  // hay cierre etiquetado abril…
    expect(r.open_date).toBeNull()           // …pero no hay lectura anterior
  })

  it('mes sin recogida → close_date null (la línea no pertenece a la tanda de ese mes)', () => {
    const r = computeLineConsumptionByReadings(NL, counters, 2026, 6, 1)  // nadie cierra junio aún
    expect(r.close_date).toBeNull()
  })

  it('mes saltado (D4): la siguiente recogida factura el periodo doble', () => {
    const skipped: Counter[] = [
      ...counters,  // 29-abr (1000), 3-jun (1500) → 3-jun cierra mayo
      mkCounter({ id: 'c-ago', year: 2026, month: 8, day: 4, counter_bw: 2500, counter_color: 360 }),
    ]
    // No hubo recogida de "junio" (~1-jul). La del 4-ago etiqueta JULIO y empareja con la del 3-jun.
    const real = computeLineConsumptionByReadings(NL, skipped, 2026, 7, 1)
    expect(real.is_estimated).toBe(false)
    expect(real.delta_bw).toBe(1000)        // 2500 − 1500 (junio + julio juntos)
    expect(real.open_date).toBe('2026-06-03')
    expect(real.close_date).toBe('2026-08-04')
  })

  it('máquina nueva con start_counter: su lectura inicial es la apertura de la 1ª factura', () => {
    const newLine: LineCounters = {
      date_debut: '2026-06-15', date_fin: null,
      start_counter_bw: 15, start_counter_color: 5, end_counter_bw: null, end_counter_color: null,
    }
    const cs: Counter[] = [mkCounter({ id: 'x', year: 2026, month: 7, day: 1, counter_bw: 200, counter_color: 40 })]
    const r = computeLineConsumptionByReadings(newLine, cs, 2026, 6, 1)  // 01-jul cierra junio
    expect(r.is_estimated).toBe(false)
    expect(r.delta_bw).toBe(185)            // 200 − 15
    expect(r.open_date).toBe('2026-06-15')
  })

  it('cierre por reemplazo con AMBOS end_counter usa los puntos de la línea', () => {
    const replLine: LineCounters = {
      date_debut: '2026-01-01', date_fin: '2026-06-03',
      start_counter_bw: null, start_counter_color: null, end_counter_bw: 1400, end_counter_color: 250,
    }
    const r = computeLineConsumptionByReadings(replLine, counters, 2026, 5, 1)  // date_fin 03-jun → mayo
    expect(r.is_estimated).toBe(false)
    expect(r.delta_bw).toBe(400)            // end 1400 − apertura 1000 (29-abr)
    expect(r.delta_color).toBe(50)
    expect(r.close_date).toBe('2026-06-03')
  })

  it('relevé que retrocede (reset): delta negativo → estimada', () => {
    const reset: Counter[] = [
      mkCounter({ id: 'c-abr', year: 2026, month: 4, day: 29, counter_bw: 1000, counter_color: 200 }),
      mkCounter({ id: 'c-jun', year: 2026, month: 6, day: 3,  counter_bw: 900,  counter_color: 200 }),
    ]
    const r = computeLineConsumptionByReadings(NL, reset, 2026, 5, 1)
    expect(r.is_estimated).toBe(true)
    expect(r.delta_bw).toBe(0)
  })

  it('coincide con la pantalla de Contadores (mismo delta que calcDeltas) en línea normal', () => {
    const screen = calcDeltas(counters).get('c-jun')!
    const billing = computeLineConsumptionByReadings(NL, counters, 2026, 5, 1)
    expect(billing.delta_bw).toBe(screen.delta_bw)
    expect(billing.delta_color).toBe(screen.delta_color)
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
    id, machine_id: 'M1', contract_id: 'ctr-1', year, month, day, counter_bw: bw, counter_color: color,
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
    id, machine_id: 'M1', contract_id: 'ctr-1', year, month, day, counter_bw: bw, counter_color: color,
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
    vi.mocked(createAdminClient).mockReturnValue(admin())
    const draft = await buildContractInvoiceDraft('ctr-1', 2026, 6)
    expect(draft!.period_start).toBe('2026-06-03')
    expect(draft!.lines[0].delta_bw).toBe(500)    // 2000 − 1500
    expect(draft!.lines[0].price_bw).toBe(20)
    expect(draft!.lines[0].amount_total).toBe(500 * 20 + 40 * 100)  // 14000
  })
})
