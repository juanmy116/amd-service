// src/lib/counters.ts

export interface Counter {
  id:                   string
  year:                 number
  month:                number
  day:                  number
  /** Fecha real de la lectura (YYYY-MM-DD), generada de year/month/day. Fuente de orden/atribución. */
  reading_date:         string
  /** Línea/puesto (contract_machines.id) vigente en la fecha de la lectura. */
  contract_machine_id:  string | null
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
 * Primitiva ÚNICA del consumo de copias: resta `final − inicial` con guard de null.
 * Devuelve `null` si falta cualquiera de los dos puntos.
 *
 * Decisión consciente (ver architecture.md §Facturación): aquí vive SOLO la aritmética,
 * que es idéntica para Contadores y facturación. La POLÍTICA sobre el resultado diverge a
 * propósito y se queda en cada caller:
 *   - Contadores muestra el delta tal cual, negativos incluidos (anomalía visible al humano).
 *   - Facturación trata null/negativo como "estimado" (factura solo el forfait).
 * Para una línea normal (sin reemplazo) ambos caminos DEBEN dar el mismo número.
 */
export function counterDelta(finalVal: number | null, initialVal: number | null): number | null {
  if (finalVal === null || initialVal === null) return null
  return finalVal - initialVal
}

/**
 * Orden canónico de relevés por FECHA REAL: (reading_date, recorded_at, id). Spec v3.1 §6.
 * reading_date (year/month/day) es la fuente de verdad del orden; recorded_at desempata dos
 * lecturas del mismo día (corrección same-day) y el id da un orden total determinista final.
 * recorded_at queda solo como auditoría de registro, NO como criterio principal (una lectura
 * importada tarde no debe colocarse fuera de su sitio cronológico real).
 */
export function compareCountersByReading(a: Counter, b: Counter): number {
  // Comparación por CODE POINT (no localeCompare): orden determinista en cualquier locale.
  const cmp = (x: string, y: string) => (x < y ? -1 : x > y ? 1 : 0)
  return cmp(a.reading_date, b.reading_date) || cmp(a.recorded_at, b.recorded_at) || cmp(a.id, b.id)
}

/**
 * Calcula el delta de cada relevé respecto al relevé activo inmediatamente anterior.
 * - Solo relevés con status 'actif'.
 * - Orden canónico por FECHA REAL (reading_date, recorded_at, id) — spec v3.1 §6.
 * - El primer relevé y los `is_replacement_start` tienen delta null (no facturable).
 */
export function calcDeltas(counters: Counter[]): Map<string, CounterDelta> {
  const active = [...counters]
    .filter(c => c.status === 'actif')
    .sort(compareCountersByReading)

  const deltaMap = new Map<string, CounterDelta>()
  active.forEach((c, i) => {
    if (i === 0 || c.is_replacement_start) {
      deltaMap.set(c.id, { delta_bw: null, delta_color: null })
    } else {
      const prev = active[i - 1]
      deltaMap.set(c.id, {
        delta_bw:    counterDelta(c.counter_bw,    prev.counter_bw),
        delta_color: counterDelta(c.counter_color, prev.counter_color),
      })
    }
  })
  return deltaMap
}
