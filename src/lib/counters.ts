// src/lib/counters.ts

export interface Counter {
  id:                   string
  year:                 number
  month:                number
  day:                  number | null
  counter_bw:           number
  counter_color:        number
  status:               string
  is_replacement_start: boolean
  previous_machine_id:  string | null
  annulation_reason:    string | null
  annule_at:            string | null
  notes:                string | null
  recorded_at:          string
}

export interface CounterDelta {
  delta_bw: number | null
  delta_color: number | null
}

/**
 * Calcula el delta de cada relevé respecto al relevé activo inmediatamente anterior.
 * - Solo relevés con status 'actif'.
 * - Orden: year, month y `recorded_at` como desempate determinista (fix #4: no hay UNIQUE).
 * - El primer relevé y los `is_replacement_start` tienen delta null (no facturable).
 */
export function calcDeltas(counters: Counter[]): Map<string, CounterDelta> {
  const active = [...counters]
    .filter(c => c.status === 'actif')
    .sort((a, b) =>
      a.year !== b.year   ? a.year - b.year :
      a.month !== b.month ? a.month - b.month :
      a.recorded_at.localeCompare(b.recorded_at)
    )

  const deltaMap = new Map<string, CounterDelta>()
  active.forEach((c, i) => {
    if (i === 0 || c.is_replacement_start) {
      deltaMap.set(c.id, { delta_bw: null, delta_color: null })
    } else {
      const prev = active[i - 1]
      deltaMap.set(c.id, {
        delta_bw:    c.counter_bw    - prev.counter_bw,
        delta_color: c.counter_color - prev.counter_color,
      })
    }
  })
  return deltaMap
}
