import { describe, it, expect, vi } from 'vitest'
import { calcDeltas, counterDelta, type Counter } from '@/lib/counters'
import {
  computeLineConsumption, countersForLine, buildClientInvoiceDraft, BillingDataError,
  type LineCounters,
} from '@/lib/invoicing'

// Mock del admin client de Supabase para los tests de buildClientInvoiceDraft (P0-7).
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

describe('Bloque B — P0-7: un fallo técnico de query bloquea (NO factura 0 estimado)', () => {
  it('error en la query de clientes → lanza BillingDataError', async () => {
    vi.mocked(createAdminClient).mockReturnValue(
      makeAdmin({ clients: { data: null, error: { message: 'boom' } } }),
    )
    await expect(buildClientInvoiceDraft(5, 2026, 6)).rejects.toBeInstanceOf(BillingDataError)
  })

  it('error en la query de contadores (clientes y líneas OK) → lanza BillingDataError', async () => {
    vi.mocked(createAdminClient).mockReturnValue(
      makeAdmin({
        clients:           { data: { id: 5, nom_client: 'ACME' }, error: null },
        contract_machines: { data: [{ machine_id: 'M1' }],        error: null },
        machine_counters:  { data: null, error: { message: 'boom' } },
      }),
    )
    await expect(buildClientInvoiceDraft(5, 2026, 6)).rejects.toBeInstanceOf(BillingDataError)
  })

  it('cliente inexistente (sin error técnico) NO lanza: devuelve null', async () => {
    vi.mocked(createAdminClient).mockReturnValue(
      makeAdmin({ clients: { data: null, error: null } }),
    )
    await expect(buildClientInvoiceDraft(999, 2026, 6)).resolves.toBeNull()
  })
})
