import { describe, it, expect } from 'vitest'
import { validateTiers } from '@/lib/billing'

// P2-2: validateTiers recibe JSON no confiable (JSON.parse del formulario / BD).
// Debe rechazar campos ausentes, no numéricos, NaN/Infinity, no enteros, etc.,
// además de las reglas de negocio (≥2 tramos, último ilimitado, crecientes).

describe('validateTiers — casos válidos', () => {
  it('acepta 2 tramos con último ilimitado', () => {
    expect(validateTiers([
      { up_to: 1000, price_bw: 10, price_color: 50 },
      { up_to: null, price_bw: 8, price_color: 40 },
    ])).toBeNull()
  })

  it('acepta 3 tramos crecientes', () => {
    expect(validateTiers([
      { up_to: 500, price_bw: 12, price_color: 60 },
      { up_to: 2000, price_bw: 10, price_color: 50 },
      { up_to: null, price_bw: 8, price_color: 40 },
    ])).toBeNull()
  })

  it('acepta precios cero', () => {
    expect(validateTiers([
      { up_to: 100, price_bw: 0, price_color: 0 },
      { up_to: null, price_bw: 0, price_color: 0 },
    ])).toBeNull()
  })
})

describe('validateTiers — reglas de negocio', () => {
  it('rechaza menos de 2 tramos', () => {
    expect(validateTiers([{ up_to: null, price_bw: 1, price_color: 1 }])).not.toBeNull()
  })

  it('rechaza no-array', () => {
    expect(validateTiers(null)).not.toBeNull()
    expect(validateTiers({} as unknown)).not.toBeNull()
    expect(validateTiers('tiers' as unknown)).not.toBeNull()
  })

  it('rechaza último tramo con up_to no nulo', () => {
    expect(validateTiers([
      { up_to: 1000, price_bw: 10, price_color: 50 },
      { up_to: 5000, price_bw: 8, price_color: 40 },
    ])).not.toBeNull()
  })

  it('rechaza tramo intermedio ilimitado', () => {
    expect(validateTiers([
      { up_to: null, price_bw: 10, price_color: 50 },
      { up_to: null, price_bw: 8, price_color: 40 },
    ])).not.toBeNull()
  })

  it('rechaza umbrales no estrictamente crecientes', () => {
    expect(validateTiers([
      { up_to: 1000, price_bw: 10, price_color: 50 },
      { up_to: 1000, price_bw: 9, price_color: 45 },
      { up_to: null, price_bw: 8, price_color: 40 },
    ])).not.toBeNull()
  })

  it('rechaza precios negativos', () => {
    expect(validateTiers([
      { up_to: 1000, price_bw: -1, price_color: 50 },
      { up_to: null, price_bw: 8, price_color: 40 },
    ])).not.toBeNull()
  })
})

describe('validateTiers — saneamiento de tipos (P2-2)', () => {
  it('rechaza price_bw como string', () => {
    expect(validateTiers([
      { up_to: 1000, price_bw: '10', price_color: 50 },
      { up_to: null, price_bw: 8, price_color: 40 },
    ])).not.toBeNull()
  })

  it('rechaza price_color NaN', () => {
    expect(validateTiers([
      { up_to: 1000, price_bw: 10, price_color: NaN },
      { up_to: null, price_bw: 8, price_color: 40 },
    ])).not.toBeNull()
  })

  it('rechaza precio Infinity', () => {
    expect(validateTiers([
      { up_to: 1000, price_bw: Infinity, price_color: 50 },
      { up_to: null, price_bw: 8, price_color: 40 },
    ])).not.toBeNull()
  })

  it('rechaza campo de precio ausente', () => {
    expect(validateTiers([
      { up_to: 1000, price_bw: 10 },
      { up_to: null, price_bw: 8, price_color: 40 },
    ])).not.toBeNull()
  })

  it('rechaza up_to no entero', () => {
    expect(validateTiers([
      { up_to: 100.5, price_bw: 10, price_color: 50 },
      { up_to: null, price_bw: 8, price_color: 40 },
    ])).not.toBeNull()
  })

  it('rechaza up_to como string', () => {
    expect(validateTiers([
      { up_to: '1000', price_bw: 10, price_color: 50 },
      { up_to: null, price_bw: 8, price_color: 40 },
    ])).not.toBeNull()
  })

  it('rechaza tramo no-objeto', () => {
    expect(validateTiers([
      null,
      { up_to: null, price_bw: 8, price_color: 40 },
    ])).not.toBeNull()
  })
})
