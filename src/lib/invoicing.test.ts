import { describe, it, expect, vi } from 'vitest'
import { calcDeltas, counterDelta, type Counter } from '@/lib/counters'
import {
  computeLineConsumption, countersForLine, BillingDataError, isLineBillable,
  computeBillingCycle, computeLineConsumptionCycle, buildContractInvoiceDraft,
  type LineCounters,
} from '@/lib/invoicing'

// Mock del admin client de Supabase para los tests de buildContractInvoiceDraft (P0-7).
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: vi.fn() }))
import { createAdminClient } from '@/lib/supabase/admin'

// Helper: construye un relevé con valores por defecto razonables.
function mkCounter(p: Partial<Counter> & { id: string; year: number; month: number }): Counter {
  return {
    day: null,
    counter_bw: 0,
    counter_color: 0,
    status: 'actif',
    is_replacement_start: false,
    previous_machine_id: null,
    annulation_reason: null,
    annule_at: null,
    notes: null,
    recorded_at: `${p.year}-${String(p.month).padStart(2, '0')}-15T10:00:00Z`,
    ...p,
  }
}

// Línea de contrato "normal" (sin reemplazo): abierta desde antes del periodo, sin cerrar,
// sin puntos start/end propios. Es el caso donde factura y Contadores DEBEN coincidir.
const NORMAL_LINE: LineCounters = {
  date_debut: '2026-04-01',
  date_fin: null,
  start_counter_bw: null,
  start_counter_color: null,
  end_counter_bw: null,
  end_counter_color: null,
}

const PERIOD_START = '2026-06-01'
const PERIOD_END = '2026-06-30'

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

describe('coincidencia factura ↔ Contadores (línea normal)', () => {
  // Dos relevés mensuales consecutivos de la misma máquina.
  const counters: Counter[] = [
    mkCounter({ id: 'c-may', year: 2026, month: 5, counter_bw: 1000, counter_color: 200 }),
    mkCounter({ id: 'c-jun', year: 2026, month: 6, counter_bw: 1500, counter_color: 260 }),
  ]

  it('ambos caminos dan el mismo delta para el mes', () => {
    // Camino Contadores: delta del relevé de junio contra el de mayo.
    const deltaMap = calcDeltas(counters)
    const screen = deltaMap.get('c-jun')!

    // Camino facturación: consumo de la línea normal en junio.
    const billing = computeLineConsumption(NORMAL_LINE, counters, 2026, 6, PERIOD_START, PERIOD_END)

    expect(screen.delta_bw).toBe(500)
    expect(screen.delta_color).toBe(60)
    expect(billing.is_estimated).toBe(false)
    expect(billing.delta_bw).toBe(screen.delta_bw)     // ← invariante que protege este test
    expect(billing.delta_color).toBe(screen.delta_color)
  })
})

describe('divergencia INTENCIONAL de política sobre el delta', () => {
  // Relevé que retrocede (reset de contador): mayo 1000 → junio 900.
  const counters: Counter[] = [
    mkCounter({ id: 'c-may', year: 2026, month: 5, counter_bw: 1000, counter_color: 200 }),
    mkCounter({ id: 'c-jun', year: 2026, month: 6, counter_bw: 900, counter_color: 200 }),
  ]

  it('Contadores muestra el negativo; facturación lo trata como estimado', () => {
    const screen = calcDeltas(counters).get('c-jun')!
    const billing = computeLineConsumption(NORMAL_LINE, counters, 2026, 6, PERIOD_START, PERIOD_END)

    expect(screen.delta_bw).toBe(-100)        // pantalla: anomalía visible
    expect(billing.is_estimated).toBe(true)   // factura: no cobra consumo negativo
    expect(billing.delta_bw).toBe(0)
  })
})

describe('H-D7 — cierre por reemplazo exige AMBOS contadores', () => {
  // Relevés normales del mes presentes, por si hay que caer al camino normal.
  const counters: Counter[] = [
    mkCounter({ id: 'c-may', year: 2026, month: 5, counter_bw: 1000, counter_color: 200 }),
    mkCounter({ id: 'c-jun', year: 2026, month: 6, counter_bw: 1500, counter_color: 260 }),
  ]

  it('cierre con bw seteado pero color NULL NO se trata como reemplazo: cae al relevé normal', () => {
    const partialLine: LineCounters = {
      date_debut: '2026-04-01',
      date_fin: '2026-06-20',
      start_counter_bw: null,
      start_counter_color: null,
      end_counter_bw: 1400,        // solo bw
      end_counter_color: null,     // color ausente → NO es cierre de reemplazo válido
    }
    const r = computeLineConsumption(partialLine, counters, 2026, 6, PERIOD_START, PERIOD_END)

    // Con el fix: usa el relevé normal de junio (1500/260) − mayo (1000/200) = 500/60.
    // Sin el fix tomaba end_counter_bw=1400 con color null → toda la línea estimada.
    expect(r.is_estimated).toBe(false)
    expect(r.delta_bw).toBe(500)
    expect(r.delta_color).toBe(60)
  })

  it('cierre por reemplazo con AMBOS contadores sí usa los puntos de la línea', () => {
    const replLine: LineCounters = {
      date_debut: '2026-04-01',
      date_fin: '2026-06-20',
      start_counter_bw: null,
      start_counter_color: null,
      end_counter_bw: 1400,
      end_counter_color: 250,
    }
    // init = relevé normal de mayo (1000/200); final = end_counter de la línea (1400/250).
    const r = computeLineConsumption(replLine, counters, 2026, 6, PERIOD_START, PERIOD_END)
    expect(r.is_estimated).toBe(false)
    expect(r.delta_bw).toBe(400)
    expect(r.delta_color).toBe(50)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// BLOQUE A — Ciclo de vida parque/stock a nivel de motor.
// Las RPC return_machine_to_stock / assign_machine_from_stock graban los puntos de corte
// (end_counter / start_counter) en la propia línea contract_machines. Estos tests verifican
// que computeLineConsumption produce el importe correcto para cada lado del corte, incluso
// cuando ambas líneas comparten el mismo array de relevés de la máquina (mismo numero_serie).
// ─────────────────────────────────────────────────────────────────────────────
describe('Bloque A — retirada a stock (return_machine_to_stock)', () => {
  // El relevé normal de junio (1800/400) pertenece YA al cliente siguiente (la máquina se
  // reasignó dentro del mes). El cliente saliente NO debe pagar ese consumo: como su retirada
  // capturó end_counter real, factura solo hasta ahí. (Demuestra el fix de P1-3.)
  const counters: Counter[] = [
    mkCounter({ id: 'c-may', year: 2026, month: 5, counter_bw: 1000, counter_color: 200 }),
    mkCounter({ id: 'c-jun', year: 2026, month: 6, counter_bw: 1800, counter_color: 400 }),
  ]

  it('factura hasta el end_counter de la retirada, NO el relevé del mes (que es del cliente siguiente)', () => {
    const retiredLine: LineCounters = {
      date_debut: '2026-04-01',
      date_fin: '2026-06-10',
      start_counter_bw: null,
      start_counter_color: null,
      end_counter_bw: 1200,    // lectura real al retirar
      end_counter_color: 220,
    }
    const r = computeLineConsumption(retiredLine, counters, 2026, 6, PERIOD_START, PERIOD_END)
    expect(r.is_estimated).toBe(false)
    expect(r.delta_bw).toBe(200)     // 1200 − 1000 (relevé de mayo), NO 1800
    expect(r.delta_color).toBe(20)   // 220 − 200
  })
})

describe('Bloque A — asignar desde stock (assign_machine_from_stock)', () => {
  it('primer mes de máquina usada: factura lectura − start_counter (copias de prueba del taller)', () => {
    // La máquina salió del stock con 15/5 copias de prueba; al asignarla se capturó esa lectura
    // como start_counter. A fin de mes el relevé normal es 200/40.
    const counters: Counter[] = [
      mkCounter({ id: 'c-jun', year: 2026, month: 6, counter_bw: 200, counter_color: 40 }),
    ]
    const newLine: LineCounters = {
      date_debut: '2026-06-11',
      date_fin: null,
      start_counter_bw: 15,
      start_counter_color: 5,
      end_counter_bw: null,
      end_counter_color: null,
    }
    const r = computeLineConsumption(newLine, counters, 2026, 6, PERIOD_START, PERIOD_END)
    expect(r.is_estimated).toBe(false)
    expect(r.delta_bw).toBe(185)     // 200 − 15
    expect(r.delta_color).toBe(35)   // 40 − 5
  })

  it('por qué la RPC exige la lectura: una línea nueva SIN start_counter en su primer mes queda estimada (consumo perdido)', () => {
    const counters: Counter[] = [
      mkCounter({ id: 'c-jun', year: 2026, month: 6, counter_bw: 200, counter_color: 40 }),
    ]
    const lineNoStart: LineCounters = {
      date_debut: '2026-06-11',
      date_fin: null,
      start_counter_bw: null,   // sin punto inicial → no se puede calcular el consumo real
      start_counter_color: null,
      end_counter_bw: null,
      end_counter_color: null,
    }
    const r = computeLineConsumption(lineNoStart, counters, 2026, 6, PERIOD_START, PERIOD_END)
    expect(r.is_estimated).toBe(true)   // por eso assign_machine_from_stock lo hace obligatorio
    expect(r.delta_bw).toBe(0)
  })
})

describe('Bloque A — escenario del dueño: máquina reseteada A → stock → B en el mismo mes', () => {
  // Ambas líneas comparten el MISMO array de relevés de la máquina física (mismo numero_serie):
  //   mayo 1000/200 (registrado bajo A)  ·  junio 200/40 (registrado bajo B tras el reset a 15/5).
  // Cada línea factura su parte correctamente sin cruzar el historial del otro cliente.
  const sharedCounters: Counter[] = [
    mkCounter({ id: 'c-may', year: 2026, month: 5, counter_bw: 1000, counter_color: 200 }),
    mkCounter({ id: 'c-jun', year: 2026, month: 6, counter_bw: 200,  counter_color: 40 }),
  ]

  it('A factura hasta su end_counter; B factura desde su start_counter real — sin negativos ni cruces', () => {
    const lineA: LineCounters = {
      date_debut: '2026-04-01', date_fin: '2026-06-10',
      start_counter_bw: null, start_counter_color: null,
      end_counter_bw: 1200, end_counter_color: 220,   // lectura real al devolver a stock
    }
    const lineB: LineCounters = {
      date_debut: '2026-06-11', date_fin: null,
      start_counter_bw: 15, start_counter_color: 5,    // copias de prueba del taller
      end_counter_bw: null, end_counter_color: null,
    }

    const a = computeLineConsumption(lineA, sharedCounters, 2026, 6, PERIOD_START, PERIOD_END)
    const b = computeLineConsumption(lineB, sharedCounters, 2026, 6, PERIOD_START, PERIOD_END)

    // A: 1200 (end_counter) − 1000 (mayo) = 200/20. Ignora el relevé 200/40 de junio (es de B).
    expect(a.is_estimated).toBe(false)
    expect(a.delta_bw).toBe(200)
    expect(a.delta_color).toBe(20)

    // B: 200 (relevé de junio) − 15 (start_counter) = 185/35. Ignora el 1000 de mayo (es de A).
    expect(b.is_estimated).toBe(false)
    expect(b.delta_bw).toBe(185)
    expect(b.delta_color).toBe(35)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// BLOQUE B — atribución por línea/contrato (P0-3) y bloqueo por fallo técnico (P0-7).
// ─────────────────────────────────────────────────────────────────────────────

// Relevé con las columnas de atribución (CounterRow): Counter + machine_id + contract_id.
function mkRow(
  p: Partial<Counter> & { id: string; year: number; month: number },
  machine_id: string,
  contract_id: string | null,
) {
  return { ...mkCounter(p), machine_id, contract_id }
}

describe('Bloque B — countersForLine (P0-3): cada línea solo ve los relevés de SU contrato', () => {
  // Una misma máquina física rotó: contrato A (cA) y, tras pasar por stock, contrato B (cB).
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
    // El relevé heredado del 2026-06-05 cae en la vigencia de A [04-01, 06-10], no en la de B [06-11, …].
    const forA = countersForLine('cA', '2026-04-01', '2026-06-10', withLegacy)
    const forB = countersForLine('cB', '2026-06-11', null,        withLegacy)
    expect(forA.map(c => c.id).sort()).toEqual(['a-may', 'legacy-jun'])
    expect(forB.map(c => c.id)).toEqual(['b-jun'])
  })

  it('invariante de no-solapamiento: un relevé legacy en el día-frontera (date_fin=X=date_debut) cuenta en UNA sola línea', () => {
    const X = '2026-06-10'
    // Misma máquina: línea A cierra en X, línea B abre en X. Relevé heredado fechado exactamente en X.
    const onFrontier = [
      mkRow({ id: 'legacy-X', year: 2026, month: 6, day: 10, counter_bw: 500, counter_color: 100 }, 'M1', null),
    ]
    const forA = countersForLine('cA', '2026-04-01', X,   onFrontier)  // (date_debut, date_fin=X]
    const forB = countersForLine('cB', X,          null, onFrontier)  // (date_debut=X, …]

    // Se atribuye SOLO a la línea que cierra (X <= date_fin), nunca a la que abre (X no es > date_debut).
    expect(forA.map(c => c.id)).toEqual(['legacy-X'])
    expect(forB).toEqual([])
    // Y nunca en ambas (sin doble cobro).
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
describe('Bloque D — isLineBillable (P1-6): suspendu excluido; terminé gobernado por date_fin', () => {
  it('contrato suspendu → NO factura', () => {
    expect(isLineBillable('actif', 'suspendu', null)).toBe(false)
  })
  it('línea suspendu → NO factura', () => {
    expect(isLineBillable('suspendu', 'actif', null)).toBe(false)
  })
  it('contrato terminé con línea aún abierta (date_fin NULL) → NO factura (huérfana, no factura sin fin)', () => {
    expect(isLineBillable('actif', 'terminé', null)).toBe(false)
  })
  it('contrato terminé con línea bien cerrada (date_fin) → SÍ factura su mes de cierre', () => {
    expect(isLineBillable('terminé', 'terminé', '2026-06-10')).toBe(true)
  })
  it('línea terminé por retirada/reemplazo (date_fin), contrato actif → SÍ factura (H-D6)', () => {
    expect(isLineBillable('terminé', 'actif', '2026-06-10')).toBe(true)
  })
  it('todo actif → factura', () => {
    expect(isLineBillable('actif', 'actif', null)).toBe(true)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// BLOQUE E / regla 9 — ciclo de aniversario por contrato (con clamp de fin de mes).
// ─────────────────────────────────────────────────────────────────────────────
describe('Bloque E — computeBillingCycle (regla 9)', () => {
  it('día 4, ancla enero → [04 ene, 03 feb]', () => {
    expect(computeBillingCycle(4, 2026, 1)).toEqual({ start: '2026-01-04', end: '2026-02-03' })
  })
  it('día 1 → coincide con el mes natural completo', () => {
    expect(computeBillingCycle(1, 2026, 1)).toEqual({ start: '2026-01-01', end: '2026-01-31' })
  })
  it('día 31 anclado en enero → fin recortado al billing_day clamped de febrero (27, día anterior a feb 28)', () => {
    expect(computeBillingCycle(31, 2026, 1)).toEqual({ start: '2026-01-31', end: '2026-02-27' })
  })
  it('día 31 anclado en febrero → inicio clamped a feb 28; fin = 30 mar (día anterior a mar 31)', () => {
    expect(computeBillingCycle(31, 2026, 2)).toEqual({ start: '2026-02-28', end: '2026-03-30' })
  })
  it('día 31 en año bisiesto: ancla febrero 2024 → inicio feb 29', () => {
    expect(computeBillingCycle(31, 2024, 2)).toEqual({ start: '2024-02-29', end: '2024-03-30' })
  })
  it('cruce de año: día 31 anclado en diciembre → [31 dic, 30 ene del año siguiente]', () => {
    expect(computeBillingCycle(31, 2026, 12)).toEqual({ start: '2026-12-31', end: '2027-01-30' })
  })
  it('día 15, ancla noviembre → [15 nov, 14 dic]', () => {
    expect(computeBillingCycle(15, 2026, 11)).toEqual({ start: '2026-11-15', end: '2026-12-14' })
  })
})

describe('Bloque E — computeLineConsumptionCycle: consumo por rango de fechas del ciclo', () => {
  // Ciclo de aniversario [2026-01-04, 2026-02-03]. Relevés capturados en los billing_day:
  //   03 ene (base del ciclo previo) = 1000/200 ; 03 feb (fin de este ciclo) = 1500/260.
  const cycleStart = '2026-01-04'
  const cycleEnd   = '2026-02-03'
  const counters: Counter[] = [
    mkCounter({ id: 'c-prev', year: 2026, month: 1, day: 3, counter_bw: 1000, counter_color: 200 }),
    mkCounter({ id: 'c-fin',  year: 2026, month: 2, day: 3, counter_bw: 1500, counter_color: 260 }),
  ]
  const NL: LineCounters = {
    date_debut: '2025-12-01', date_fin: null,
    start_counter_bw: null, start_counter_color: null, end_counter_bw: null, end_counter_color: null,
  }

  it('consumo = lectura(fin del ciclo) − lectura(anterior al inicio del ciclo)', () => {
    const r = computeLineConsumptionCycle(NL, counters, cycleStart, cycleEnd)
    expect(r.is_estimated).toBe(false)
    expect(r.delta_bw).toBe(500)     // 1500 − 1000
    expect(r.delta_color).toBe(60)   // 260 − 200
  })

  it('NO cuenta un relevé posterior al fin del ciclo (pertenece al ciclo siguiente)', () => {
    const withNext = [
      ...counters,
      mkCounter({ id: 'c-next', year: 2026, month: 2, day: 10, counter_bw: 9999, counter_color: 999 }),
    ]
    const r = computeLineConsumptionCycle(NL, withNext, cycleStart, cycleEnd)
    expect(r.delta_bw).toBe(500)     // ignora el 9999 del 10 feb (fuera del ciclo)
    expect(r.delta_color).toBe(60)
  })

  it('línea que arranca dentro del ciclo con start_counter: factura desde su lectura real', () => {
    const newLine: LineCounters = {
      date_debut: '2026-01-15', date_fin: null,
      start_counter_bw: 15, start_counter_color: 5, end_counter_bw: null, end_counter_color: null,
    }
    // Relevé del fin del ciclo bajo esta línea: 200/40.
    const cs: Counter[] = [mkCounter({ id: 'x', year: 2026, month: 2, day: 3, counter_bw: 200, counter_color: 40 })]
    const r = computeLineConsumptionCycle(newLine, cs, cycleStart, cycleEnd)
    expect(r.is_estimated).toBe(false)
    expect(r.delta_bw).toBe(185)     // 200 − 15
    expect(r.delta_color).toBe(35)
  })

  it('falta la lectura de cierre del ciclo → estimada', () => {
    const onlyBase: Counter[] = [
      mkCounter({ id: 'c-prev', year: 2026, month: 1, day: 3, counter_bw: 1000, counter_color: 200 }),
    ]
    const r = computeLineConsumptionCycle(NL, onlyBase, cycleStart, cycleEnd)
    expect(r.is_estimated).toBe(true)
    expect(r.delta_bw).toBe(0)
  })
})

describe('Bloque E — buildContractInvoiceDraft: factura por contrato y ciclo', () => {
  // contrato day=4; ciclo ancla enero → [2026-01-04, 2026-02-03]. Una máquina, plan per_copy.
  const contractRow = {
    id: 'ctr-1', numero_contrat: 'CT-2026-001', client_id: 7, billing_day: 4, statut: 'actif',
    clients: { id: 7, nom_client: 'ACME' },
  }
  const lineRow = {
    id: 'cm-1', machine_id: 'M1', billing_plan_id: 'plan-1',
    date_debut: '2025-12-01', date_fin: null, statut: 'actif',
    replaces_contract_machine_id: null,
    start_counter_bw: null, start_counter_color: null, end_counter_bw: null, end_counter_color: null,
    price_bw_override: null, price_color_override: null, fixed_fee_override: null,
    billing_plans: { id: 'plan-1', name: 'Par copie', type: 'per_copy', fixed_fee: null, price_bw: 10, price_color: 50, tiers: null },
    machines: { numero_serie: 'M1', marque: 'HP', modele: 'X' },
  }
  const counterRows = [
    { id: 'c-prev', machine_id: 'M1', contract_id: 'ctr-1', year: 2026, month: 1, day: 3, counter_bw: 1000, counter_color: 200, status: 'actif', is_replacement_start: false, previous_machine_id: null, annulation_reason: null, annule_at: null, notes: null, recorded_at: '2026-01-03T10:00:00Z' },
    { id: 'c-fin',  machine_id: 'M1', contract_id: 'ctr-1', year: 2026, month: 2, day: 3, counter_bw: 1500, counter_color: 260, status: 'actif', is_replacement_start: false, previous_machine_id: null, annulation_reason: null, annule_at: null, notes: null, recorded_at: '2026-02-03T10:00:00Z' },
  ]

  it('deriva el ciclo del billing_day y factura consumo = fin − base del ciclo', async () => {
    vi.mocked(createAdminClient).mockReturnValue(
      makeAdmin({
        contracts:         { data: contractRow,   error: null },
        contract_machines: { data: [lineRow],     error: null },
        machine_counters:  { data: counterRows,   error: null },
      }),
    )
    const draft = await buildContractInvoiceDraft('ctr-1', 2026, 1)
    expect(draft).not.toBeNull()
    expect(draft!.period_start).toBe('2026-01-04')
    expect(draft!.period_end).toBe('2026-02-03')
    expect(draft!.lines).toHaveLength(1)
    expect(draft!.lines[0].delta_bw).toBe(500)        // 1500 − 1000
    expect(draft!.lines[0].delta_color).toBe(60)      // 260 − 200
    expect(draft!.lines[0].amount_total).toBe(500 * 10 + 60 * 50)   // 8000
    expect(draft!.total_amount).toBe(8000)
    expect(draft!.has_estimated).toBe(false)
  })

  it('contrato inexistente → null (no error técnico)', async () => {
    vi.mocked(createAdminClient).mockReturnValue(makeAdmin({ contracts: { data: null, error: null } }))
    await expect(buildContractInvoiceDraft('nope', 2026, 1)).resolves.toBeNull()
  })

  it('error técnico al leer el contrato → BillingDataError', async () => {
    vi.mocked(createAdminClient).mockReturnValue(makeAdmin({ contracts: { data: null, error: { message: 'boom' } } }))
    await expect(buildContractInvoiceDraft('ctr-1', 2026, 1)).rejects.toBeInstanceOf(BillingDataError)
  })

  it('dos contratos del MISMO cliente y mes-ancla: misma terna (client_id, year, month) pero distinto contract_id', async () => {
    // Invariante que motiva restringir el índice legacy a contract_id IS NULL (fix migración 150000):
    // la unicidad de factura emise NO puede ir por (client_id, period_year, period_month) — dos
    // contratos del mismo cliente anclados al mismo mes comparten esa terna. Debe ir por contrato.
    const mkContract = (id: string) => ({
      id, numero_contrat: `CT-${id}`, client_id: 7, billing_day: 4, statut: 'actif',
      clients: { id: 7, nom_client: 'ACME' },
    })
    const mkLine = (cmId: string) => ({
      id: cmId, machine_id: `M-${cmId}`, billing_plan_id: 'plan-1',
      date_debut: '2025-12-01', date_fin: null, statut: 'actif', replaces_contract_machine_id: null,
      start_counter_bw: null, start_counter_color: null, end_counter_bw: null, end_counter_color: null,
      price_bw_override: null, price_color_override: null, fixed_fee_override: null,
      billing_plans: { id: 'plan-1', name: 'Forfait', type: 'hybrid', fixed_fee: 5000, price_bw: 10, price_color: 50, tiers: null },
      machines: { numero_serie: `M-${cmId}`, marque: 'HP', modele: 'X' },
    })
    const noCounters = { data: [] as unknown[], error: null }

    vi.mocked(createAdminClient).mockReturnValue(
      makeAdmin({ contracts: { data: mkContract('A'), error: null }, contract_machines: { data: [mkLine('a1')], error: null }, machine_counters: noCounters }),
    )
    const dA = await buildContractInvoiceDraft('A', 2026, 1)

    vi.mocked(createAdminClient).mockReturnValue(
      makeAdmin({ contracts: { data: mkContract('B'), error: null }, contract_machines: { data: [mkLine('b1')], error: null }, machine_counters: noCounters }),
    )
    const dB = await buildContractInvoiceDraft('B', 2026, 1)

    // Misma terna legacy (chocaría con el índice viejo)…
    expect(dA!.client_id).toBe(dB!.client_id)
    expect([dA!.period_year, dA!.period_month, dA!.period_start])
      .toEqual([dB!.period_year, dB!.period_month, dB!.period_start])
    // …pero contratos distintos → el índice por (contract_id, period_start) NO colisiona.
    expect(dA!.contract_id).not.toBe(dB!.contract_id)
  })
})

describe('P1-5 — buildContractInvoiceDraft usa la tarifa VIGENTE al inicio del ciclo', () => {
  // contrato day=4. Plan per_copy: 10/50 desde ene; SUBIDO a 20/100 desde el 15-jun.
  const contractRow = {
    id: 'ctr-1', numero_contrat: 'CT-2026-001', client_id: 7, billing_day: 4, statut: 'actif',
    clients: { id: 7, nom_client: 'ACME' },
  }
  const lineRow = {
    id: 'cm-1', machine_id: 'M1', billing_plan_id: 'plan-1',
    date_debut: '2025-12-01', date_fin: null, statut: 'actif', replaces_contract_machine_id: null,
    start_counter_bw: null, start_counter_color: null, end_counter_bw: null, end_counter_color: null,
    price_bw_override: null, price_color_override: null, fixed_fee_override: null,
    // El plan embebido refleja el precio ACTUAL (nuevo); el historial es la fuente de verdad temporal.
    billing_plans: { id: 'plan-1', name: 'Par copie', type: 'per_copy', fixed_fee: null, price_bw: 20, price_color: 100, tiers: null },
    machines: { numero_serie: 'M1', marque: 'HP', modele: 'X' },
  }
  const planVersions = [
    { plan_id: 'plan-1', effective_from: '2026-01-01', type: 'per_copy', fixed_fee: null, price_bw: 10, price_color: 50, tiers: null },
    { plan_id: 'plan-1', effective_from: '2026-06-15', type: 'per_copy', fixed_fee: null, price_bw: 20, price_color: 100, tiers: null },
  ]
  const mk = (year: number, month: number, day: number, bw: number, color: number) => ({
    id: `c-${year}-${month}-${day}`, machine_id: 'M1', contract_id: 'ctr-1', year, month, day,
    counter_bw: bw, counter_color: color, status: 'actif', is_replacement_start: false,
    previous_machine_id: null, annulation_reason: null, annule_at: null, notes: null,
    recorded_at: `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}T10:00:00Z`,
  })
  const counterRows = [
    mk(2026, 5, 3, 1000, 200), mk(2026, 6, 3, 1500, 260),   // ciclo mayo: base 05-03, fin 06-03
    mk(2026, 7, 3, 2000, 300), mk(2026, 8, 3, 2500, 360),   // ciclo julio: base 07-03, fin 08-03
  ]
  const admin = () => makeAdmin({
    contracts:             { data: contractRow,  error: null },
    contract_machines:     { data: [lineRow],    error: null },
    machine_counters:      { data: counterRows,  error: null },
    billing_plan_versions: { data: planVersions, error: null },
    contract_machine_override_versions: { data: [], error: null },
  })

  it('ciclo de MAYO (antes de la subida) factura con el precio viejo 10/50', async () => {
    vi.mocked(createAdminClient).mockReturnValue(admin())
    const draft = await buildContractInvoiceDraft('ctr-1', 2026, 5)   // [2026-05-04, 2026-06-03]
    expect(draft!.period_start).toBe('2026-05-04')
    expect(draft!.lines[0].delta_bw).toBe(500)
    expect(draft!.lines[0].price_bw).toBe(10)                          // precio vigente en mayo
    expect(draft!.lines[0].amount_total).toBe(500 * 10 + 60 * 50)      // 8 000
  })

  it('ciclo de JULIO (tras la subida) factura con el precio nuevo 20/100', async () => {
    vi.mocked(createAdminClient).mockReturnValue(admin())
    const draft = await buildContractInvoiceDraft('ctr-1', 2026, 7)   // [2026-07-04, 2026-08-03]
    expect(draft!.period_start).toBe('2026-07-04')
    expect(draft!.lines[0].delta_bw).toBe(500)
    expect(draft!.lines[0].price_bw).toBe(20)                          // precio vigente en julio
    expect(draft!.lines[0].amount_total).toBe(500 * 20 + 60 * 100)     // 16 000
  })

  it('sin historial (tablas vacías) cae al precio actual del plan embebido (robustez)', async () => {
    vi.mocked(createAdminClient).mockReturnValue(makeAdmin({
      contracts:         { data: contractRow,  error: null },
      contract_machines: { data: [lineRow],    error: null },
      machine_counters:  { data: counterRows,  error: null },
      // billing_plan_versions sin entrada → fallback a resolveEffectiveTariff(line) (precio actual 20/100)
    }))
    const draft = await buildContractInvoiceDraft('ctr-1', 2026, 5)
    expect(draft!.lines[0].price_bw).toBe(20)
  })
})
