import { describe, it, expect } from 'vitest'
import {
  validateTiers, pickVersionAsOf, resolveEffectiveTariffAsOf,
  type TariffVersion, type OverrideVersion,
} from '@/lib/billing'

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

// ─────────────────────────────────────────────────────────────────────────────
// P1-5 — vigencia temporal de tarifas.
// ─────────────────────────────────────────────────────────────────────────────
describe('pickVersionAsOf', () => {
  const versions = [
    { effective_from: '2026-01-01', v: 'A' },
    { effective_from: '2026-06-15', v: 'B' },
    { effective_from: '2026-09-01', v: 'C' },
  ]
  it('elige la versión vigente (mayor effective_from <= asOf)', () => {
    expect(pickVersionAsOf(versions, '2026-05-31')?.v).toBe('A')
    expect(pickVersionAsOf(versions, '2026-06-15')?.v).toBe('B')   // límite inclusivo
    expect(pickVersionAsOf(versions, '2026-08-31')?.v).toBe('B')
    expect(pickVersionAsOf(versions, '2027-01-01')?.v).toBe('C')
  })
  it('cae a la más antigua si asOf es anterior a todas', () => {
    expect(pickVersionAsOf(versions, '2025-01-01')?.v).toBe('A')
  })
  it('devuelve null si no hay versiones', () => {
    expect(pickVersionAsOf([] as { effective_from: string }[], '2026-06-01')).toBeNull()
  })
  it('modo estricto (fallbackToEarliest=false): null si asOf es anterior a todas', () => {
    expect(pickVersionAsOf(versions, '2025-01-01', false)).toBeNull()
    expect(pickVersionAsOf(versions, '2026-06-15', false)?.v).toBe('B')   // sí aplica si hay una <= asOf
  })
})

describe('resolveEffectiveTariffAsOf — facturar con los precios de AQUEL mes', () => {
  // Plan per_copy: precio B&N 10 desde ene; subido a 12 desde el 15-jun.
  const planVersions: TariffVersion[] = [
    { effective_from: '2026-01-01', type: 'per_copy', fixed_fee: null, price_bw: 10, price_color: 50, tiers: null },
    { effective_from: '2026-06-15', type: 'per_copy', fixed_fee: null, price_bw: 12, price_color: 60, tiers: null },
  ]

  it('un ciclo ANTERIOR a la subida usa el precio viejo', () => {
    const t = resolveEffectiveTariffAsOf(planVersions, [], '2026-05-04')
    expect(t?.price_bw).toBe(10)
    expect(t?.price_color).toBe(50)
  })
  it('un ciclo POSTERIOR a la subida usa el precio nuevo', () => {
    const t = resolveEffectiveTariffAsOf(planVersions, [], '2026-07-04')
    expect(t?.price_bw).toBe(12)
    expect(t?.price_color).toBe(60)
  })
  it('un ciclo iniciado ANTES de la subida (mismo mes) conserva el precio viejo de inicio de ciclo', () => {
    const t = resolveEffectiveTariffAsOf(planVersions, [], '2026-06-04')
    expect(t?.price_bw).toBe(10)
  })

  it('el override vigente gana al precio del plan; un override posterior no afecta a ciclos previos', () => {
    const ovVersions: OverrideVersion[] = [
      { effective_from: '2026-06-15', price_bw_override: 7, price_color_override: null, fixed_fee_override: null },
    ]
    // Ciclo de mayo: aún sin override → precio del plan (10).
    expect(resolveEffectiveTariffAsOf(planVersions, ovVersions, '2026-05-04')?.price_bw).toBe(10)
    // Ciclo de julio: override vigente (7) gana al plan (12).
    expect(resolveEffectiveTariffAsOf(planVersions, ovVersions, '2026-07-04')?.price_bw).toBe(7)
  })

  it('coerciona strings numéricos (numeric de supabase) y respeta el tipo de plan', () => {
    const tiered: TariffVersion[] = [
      { effective_from: '2026-01-01', type: 'hybrid_tiered', fixed_fee: '30000', price_bw: null, price_color: null,
        tiers: [{ up_to: 1000, price_bw: 10, price_color: 50 }, { up_to: null, price_bw: 8, price_color: 40 }] },
    ]
    const t = resolveEffectiveTariffAsOf(tiered, [], '2026-03-01')
    expect(t?.type).toBe('hybrid_tiered')
    expect(t?.fixed_fee).toBe(30000)
    expect(t?.price_bw).toBeNull()       // tiered no usa precio plano
    expect(t?.tiers?.length).toBe(2)
  })

  it('sin versiones de plan → null (el caller decide el fallback)', () => {
    expect(resolveEffectiveTariffAsOf([], [], '2026-06-01')).toBeNull()
  })
})
