import { describe, it, expect } from 'vitest'
import { resolveQuartierCode, groupByVille, type Quartier } from './quartiers'

const QUARTIERS: Quartier[] = [
  { code: 'plateau',  label: 'Plateau',  ville: 'Dakar', lat: 14.669, lng: -17.43,  sortOrder: 10 },
  { code: 'almadies', label: 'Almadies', ville: 'Dakar', lat: 14.744, lng: -17.514, sortOrder: 70 },
  { code: 'mbour',    label: 'Mbour',    ville: 'Mbour', lat: 14.42,  lng: -16.96,  sortOrder: 220 },
]

describe('resolveQuartierCode', () => {
  it('usa el quartier de la máquina cuando lo tiene (sede distinta)', () => {
    expect(resolveQuartierCode('almadies', 'plateau')).toBe('almadies')
  })

  it('cae al quartier del cliente cuando la máquina no tiene', () => {
    expect(resolveQuartierCode(null, 'plateau')).toBe('plateau')
  })

  it('devuelve null cuando no hay ninguno', () => {
    expect(resolveQuartierCode(null, null)).toBeNull()
  })

  it('trata undefined igual que null', () => {
    expect(resolveQuartierCode(undefined, undefined)).toBeNull()
    expect(resolveQuartierCode(undefined, 'mbour')).toBe('mbour')
  })
})

describe('groupByVille', () => {
  it('agrupa por ciudad conservando el orden de sortOrder', () => {
    expect(groupByVille(QUARTIERS)).toEqual([
      { ville: 'Dakar', quartiers: [QUARTIERS[0], QUARTIERS[1]] },
      { ville: 'Mbour', quartiers: [QUARTIERS[2]] },
    ])
  })

  it('ordena los quartiers dentro de cada ciudad aunque lleguen desordenados', () => {
    const groups = groupByVille([QUARTIERS[1], QUARTIERS[0]])
    expect(groups[0].quartiers.map((q) => q.code)).toEqual(['plateau', 'almadies'])
  })

  it('no muta el array recibido', () => {
    const input = [QUARTIERS[1], QUARTIERS[0]]
    groupByVille(input)
    expect(input.map((q) => q.code)).toEqual(['almadies', 'plateau'])
  })

  it('con lista vacía devuelve lista vacía', () => {
    expect(groupByVille([])).toEqual([])
  })
})
