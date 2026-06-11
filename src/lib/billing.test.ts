import { describe, it, expect } from 'vitest'
import {
  validateTiers, pickVersionAsOf, resolveEffectiveTariffAsOf,
  roundFcfa, calculateMonthlyAmount,
  type TariffVersion, type OverrideVersion, type EffectiveTariff,
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

// P2-1: el dinero se redondea a entero FCFA. `Math.round` directo sobre un
// producto en coma flotante sufre el error binario (Math.round(1.005*100) === 100,
// no 101). roundFcfa colapsa el ruido binario con toFixed(6) antes de redondear.
describe('roundFcfa (P2-1 — redondeo entero robusto)', () => {
  it('corrige el caso binario clásico: 1.005 * 100 → 101 (no 100)', () => {
    expect(Math.round(1.005 * 100)).toBe(100) // el bug que evitamos
    expect(roundFcfa(1.005 * 100)).toBe(101)  // resultado correcto
  })

  it('redondea .5 hacia arriba y deja los enteros intactos', () => {
    expect(roundFcfa(100.5)).toBe(101)
    expect(roundFcfa(100.4)).toBe(100)
    expect(roundFcfa(1000)).toBe(1000)
    expect(roundFcfa(0)).toBe(0)
  })
})

describe('calculateMonthlyAmount — redondeo por componente', () => {
  const perCopy = (price_bw: number, price_color: number, fixed_fee = 0): EffectiveTariff => ({
    type: 'per_copy', fixed_fee, price_bw, price_color, tiers: null,
  })

  it('per_copy con precio decimal problemático factura el entero correcto', () => {
    // price_bw = 1.005, delta = 100 → 100.5 real → 101 (no 100 por el float)
    const r = calculateMonthlyAmount(perCopy(1.005, 0), 100, 0)
    expect(r.amount_bw).toBe(101)
    expect(r.amount_total).toBe(101)
  })

  it('caso entero normal: sin cambios de importe', () => {
    const r = calculateMonthlyAmount(perCopy(10, 50, 5000), 1000, 200)
    expect(r.amount_fixed).toBe(5000)
    expect(r.amount_bw).toBe(10000)
    expect(r.amount_color).toBe(10000)
    expect(r.amount_total).toBe(25000)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// tiered_total — tarifa REAL de AMD: precio ÚNICO según el VOLUMEN TOTAL del canal.
// El volumen total del mes determina el precio por copia, aplicado a TODAS las copias.
// La tabla es la UNIÓN de los cortes B&N (cada 2.500) y color (cientos), con el precio
// que toca a cada canal en cada sub-tramo → reproduce exactamente las dos escalas de AMD.
// ─────────────────────────────────────────────────────────────────────────────
describe('calculateMonthlyAmount — tiered_total (volumen total, tarifa AMD)', () => {
  // up_to INCLUSIVO; último ilimitado. Fijo 25.000 por máquina.
  const AMD: EffectiveTariff = {
    type: 'tiered_total', fixed_fee: 25000, price_bw: null, price_color: null,
    tiers: [
      { up_to: 500,   price_bw: 10,  price_color: 65 },
      { up_to: 1500,  price_bw: 10,  price_color: 60 },
      { up_to: 2500,  price_bw: 10,  price_color: 55 },
      { up_to: 3000,  price_bw: 9.5, price_color: 55 },
      { up_to: 5000,  price_bw: 9.5, price_color: 50 },
      { up_to: 10000, price_bw: 9,   price_color: 45 },
      { up_to: 15000, price_bw: 8.5, price_color: 40 },
      { up_to: 20000, price_bw: 8,   price_color: 40 },
      { up_to: null,  price_bw: 7,   price_color: 40 },
    ],
  }

  it('B&N: el precio lo fija el volumen total y se aplica a todas las copias', () => {
    // 6.000 copias → tramo "5.001-10.000" → 9 → 6.000×9 = 54.000
    expect(calculateMonthlyAmount(AMD, 6000, 0).amount_bw).toBe(54000)
    // 12.000 → "10.001-15.000" → 8,5 → 102.000
    expect(calculateMonthlyAmount(AMD, 12000, 0).amount_bw).toBe(102000)
  })

  it('B&N: fronteras de tramo (umbral superior inclusivo)', () => {
    expect(calculateMonthlyAmount(AMD, 2500, 0).amount_bw).toBe(25000)  // 2.500 → 10
    expect(calculateMonthlyAmount(AMD, 2501, 0).amount_bw).toBe(23760)  // 2.501 → 9,5 → 23.759,5 → 23.760
    expect(calculateMonthlyAmount(AMD, 20000, 0).amount_bw).toBe(160000) // 20.000 → 8
    expect(calculateMonthlyAmount(AMD, 20001, 0).amount_bw).toBe(140007) // 20.001 → 7 (efecto salto)
  })

  it('Color: usa su propia escala aunque comparta la tabla con B&N', () => {
    expect(calculateMonthlyAmount(AMD, 0, 2000).amount_color).toBe(110000) // 2.000 → "1.501-3.000" → 55
    expect(calculateMonthlyAmount(AMD, 0, 500).amount_color).toBe(32500)   // 500 → 65
    expect(calculateMonthlyAmount(AMD, 0, 501).amount_color).toBe(30060)   // 501 → 60
    expect(calculateMonthlyAmount(AMD, 0, 3001).amount_color).toBe(150050) // 3.001 → 50
    expect(calculateMonthlyAmount(AMD, 0, 12000).amount_color).toBe(480000) // >10.001 → 40
  })

  it('máquina color: B&N + color + un solo forfait (ejemplo de referencia)', () => {
    // 6.000 B&N (54.000) + 2.000 color (110.000) + forfait 25.000 = 189.000
    const r = calculateMonthlyAmount(AMD, 6000, 2000)
    expect(r.amount_fixed).toBe(25000)
    expect(r.amount_bw).toBe(54000)
    expect(r.amount_color).toBe(110000)
    expect(r.amount_total).toBe(189000)
  })

  it('máquina B&N sin copias color: solo forfait + B&N', () => {
    const r = calculateMonthlyAmount(AMD, 6000, 0)
    expect(r.amount_color).toBe(0)
    expect(r.amount_total).toBe(79000) // 54.000 + 25.000
  })

  it('cero copias: solo el forfait', () => {
    const r = calculateMonthlyAmount(AMD, 0, 0)
    expect(r.amount_bw).toBe(0)
    expect(r.amount_color).toBe(0)
    expect(r.amount_total).toBe(25000)
  })
})
