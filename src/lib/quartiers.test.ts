import { describe, it, expect } from 'vitest'
import {
  resolveQuartierCode, groupByVille, toQuartiers, selectableQuartiers, type Quartier,
} from './quartiers'

const QUARTIERS: Quartier[] = [
  { code: 'plateau',  label: 'Plateau',  ville: 'Dakar', lat: 14.669, lng: -17.43,  sortOrder: 10,  active: true },
  { code: 'almadies', label: 'Almadies', ville: 'Dakar', lat: 14.744, lng: -17.514, sortOrder: 70,  active: true },
  { code: 'mbour',    label: 'Mbour',    ville: 'Mbour', lat: 14.42,  lng: -16.96,  sortOrder: 220, active: true },
]

const RETIRADO: Quartier = {
  code: 'vieux-quartier', label: 'Vieux quartier', ville: 'Dakar',
  lat: 14.7, lng: -17.45, sortOrder: 300, active: false,
}

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

describe('toQuartiers', () => {
  it('convierte sort_order a sortOrder', () => {
    expect(toQuartiers([
      { code: 'plateau', label: 'Plateau', ville: 'Dakar', lat: 14.669, lng: -17.43, sort_order: 10, active: true },
    ])).toEqual([
      { code: 'plateau', label: 'Plateau', ville: 'Dakar', lat: 14.669, lng: -17.43, sortOrder: 10, active: true },
    ])
  })

  it('con null devuelve lista vacía (la consulta puede fallar)', () => {
    expect(toQuartiers(null)).toEqual([])
  })
})

describe('selectableQuartiers', () => {
  const TODOS = [...QUARTIERS, RETIRADO]

  it('ofrece solo las zonas activas cuando no hay ninguna asignada', () => {
    expect(selectableQuartiers(TODOS, null).map((q) => q.code)).toEqual(['plateau', 'almadies', 'mbour'])
  })

  it('conserva la zona asignada aunque esté desactivada (si no, guardar la borraría)', () => {
    expect(selectableQuartiers(TODOS, 'vieux-quartier').map((q) => q.code))
      .toEqual(['plateau', 'almadies', 'mbour', 'vieux-quartier'])
  })

  it('no duplica la zona asignada cuando está activa', () => {
    expect(selectableQuartiers(TODOS, 'plateau').map((q) => q.code)).toEqual(['plateau', 'almadies', 'mbour'])
  })

  it('ignora un código que ya no existe en el catálogo', () => {
    expect(selectableQuartiers(TODOS, 'inexistente').map((q) => q.code)).toEqual(['plateau', 'almadies', 'mbour'])
  })
})
