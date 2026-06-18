import { describe, it, expect } from 'vitest'
import { calcDeltas, type Counter } from '@/lib/counters'

// Caso 13 del gate (§9): tres lecturas el MISMO mes (días 2, 15, 28) → deltas correctos
// entre consecutivas, ordenadas por FECHA REAL aunque lleguen desordenadas. También fija
// que el primer relevé y un is_replacement_start cortan el delta (null).

function mk(over: Partial<Counter> & { id: string; reading_date: string; counter_bw: number; counter_color: number }): Counter {
  return {
    year: Number(over.reading_date.slice(0, 4)),
    month: Number(over.reading_date.slice(5, 7)),
    day: Number(over.reading_date.slice(8, 10)),
    contract_machine_id: null,
    status: 'actif',
    is_replacement_start: false,
    previous_machine_id: null,
    annulation_reason: null,
    annule_at: null,
    notes: null,
    recorded_at: `${over.reading_date}T10:00:00Z`,
    ...over,
  }
}

describe('calcDeltas — tres lecturas el mismo mes (§9.13)', () => {
  it('empareja consecutivas por reading_date (aunque lleguen desordenadas) y da deltas correctos', () => {
    // Insertadas DESordenadas: 28, 2, 15. El orden canónico es por reading_date.
    const counters = [
      mk({ id: 'c28', reading_date: '2026-04-28', counter_bw: 600, counter_color: 160 }),
      mk({ id: 'c02', reading_date: '2026-04-02', counter_bw: 100, counter_color: 20 }),
      mk({ id: 'c15', reading_date: '2026-04-15', counter_bw: 250, counter_color: 60 }),
    ]
    const d = calcDeltas(counters)
    expect(d.get('c02')).toEqual({ delta_bw: null, delta_color: null }) // primera → sin anterior
    expect(d.get('c15')).toEqual({ delta_bw: 150, delta_color: 40 })    // 250−100, 60−20
    expect(d.get('c28')).toEqual({ delta_bw: 350, delta_color: 100 })   // 600−250, 160−60
  })

  it('un is_replacement_start corta el delta (null) y la siguiente parte de él', () => {
    const counters = [
      mk({ id: 'a', reading_date: '2026-04-02', counter_bw: 100, counter_color: 20 }),
      mk({ id: 'reset', reading_date: '2026-04-15', counter_bw: 5, counter_color: 0, is_replacement_start: true }),
      mk({ id: 'b', reading_date: '2026-04-28', counter_bw: 80, counter_color: 10 }),
    ]
    const d = calcDeltas(counters)
    expect(d.get('a')).toEqual({ delta_bw: null, delta_color: null })   // primera
    expect(d.get('reset')).toEqual({ delta_bw: null, delta_color: null }) // reinicio → sin delta
    expect(d.get('b')).toEqual({ delta_bw: 75, delta_color: 10 })        // 80−5, parte del reinicio
  })

  it('los relevés anulados no participan en el orden ni en los deltas', () => {
    const counters = [
      mk({ id: 'a', reading_date: '2026-04-02', counter_bw: 100, counter_color: 20 }),
      mk({ id: 'x', reading_date: '2026-04-15', counter_bw: 9999, counter_color: 999, status: 'annule' }),
      mk({ id: 'b', reading_date: '2026-04-28', counter_bw: 300, counter_color: 80 }),
    ]
    const d = calcDeltas(counters)
    expect(d.has('x')).toBe(false)
    expect(d.get('b')).toEqual({ delta_bw: 200, delta_color: 60 }) // 300−100 (ignora el anulado)
  })
})
