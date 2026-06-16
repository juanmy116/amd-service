import { describe, it, expect } from 'vitest'
import { evaluateConsumption, MIN_HISTORICAL_SAMPLES } from './anomalies'

describe('evaluateConsumption — regla consumo_alto_sin_cambio', () => {
  it('devuelve null sin rendimiento esperado conocido', () => {
    expect(evaluateConsumption({ copiesSinceChange: 99999, expectedYield: null, source: null, samples: null })).toBeNull()
    expect(evaluateConsumption({ copiesSinceChange: 99999, expectedYield: 0, source: 'fabricant', samples: null })).toBeNull()
  })

  it('devuelve null si el baseline aprendido tiene pocas muestras', () => {
    const r = evaluateConsumption({
      copiesSinceChange: 20000, expectedYield: 10000, source: 'historique', samples: MIN_HISTORICAL_SAMPLES - 1,
    })
    expect(r).toBeNull()
  })

  it('SÍ evalúa un baseline con muestras suficientes', () => {
    const r = evaluateConsumption({
      copiesSinceChange: 20000, expectedYield: 10000, source: 'historique', samples: MIN_HISTORICAL_SAMPLES,
    })
    expect(r?.light).toBe('red')
  })

  it('fabricante no exige muestras mínimas', () => {
    const r = evaluateConsumption({
      copiesSinceChange: 9000, expectedYield: 10000, source: 'fabricant', samples: null,
    })
    expect(r?.light).toBe('amber')
  })

  it('ratio < 0.8 → sin anomalía (null)', () => {
    expect(evaluateConsumption({ copiesSinceChange: 7000, expectedYield: 10000, source: 'fabricant', samples: null })).toBeNull()
  })

  it('0.8 ≤ ratio < 1.0 → ámbar (fin de vida próximo)', () => {
    const r = evaluateConsumption({ copiesSinceChange: 8500, expectedYield: 10000, source: 'fabricant', samples: null })
    expect(r?.light).toBe('amber')
    expect(r?.type).toBe('consumo_alto_sin_cambio')
    expect(r?.reason).toContain('%')
  })

  it('ratio ≥ 1.0 → rojo (remplacement recommandé)', () => {
    const r = evaluateConsumption({ copiesSinceChange: 12000, expectedYield: 10000, source: 'fabricant', samples: null })
    expect(r?.light).toBe('red')
    expect(r?.reason).toContain('Remplacement')
  })

  it('frontera exacta 0.8 → ámbar', () => {
    expect(evaluateConsumption({ copiesSinceChange: 8000, expectedYield: 10000, source: 'fabricant', samples: null })?.light).toBe('amber')
  })

  it('copias no positivas → null (datos incompletos)', () => {
    expect(evaluateConsumption({ copiesSinceChange: 0, expectedYield: 10000, source: 'fabricant', samples: null })).toBeNull()
    expect(evaluateConsumption({ copiesSinceChange: -500, expectedYield: 10000, source: 'fabricant', samples: null })).toBeNull()
  })
})
