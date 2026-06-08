import { describe, it, expect } from 'vitest'
import { calcDeltas, counterDelta, type Counter } from '@/lib/counters'
import { computeLineConsumption, type LineCounters } from '@/lib/invoicing'

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
