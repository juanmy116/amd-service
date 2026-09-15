import { describe, it, expect } from 'vitest'
import { DAKAR_CLUSTER, buildMapItems, fitsInDakar, isBubbleActive, viewForQuartier } from './mapView'
import type { Quartier } from '@/lib/quartiers'

// Coordenadas reales del catálogo (migración 20260911150000_quartiers.sql).
const Q = (code: string, label: string, ville: string, lat: number, lng: number): Quartier =>
  ({ code, label, ville, lat, lng, sortOrder: 10, active: true })

const PLATEAU = Q('plateau', 'Plateau · Centre-ville', 'Dakar', 14.669, -17.43)
const MERMOZ = Q('mermoz', 'Mermoz · Sacré-Cœur', 'Dakar', 14.706, -17.472)
const RUFISQUE = Q('rufisque', 'Rufisque · Bargny', 'Dakar', 14.715, -17.27)
const DIASS = Q('diass', 'Diass', 'Diass', 14.64, -17.07)
const THIES = Q('thies', 'Thiès', 'Thiès', 14.791, -16.926)
const MBOUR = Q('mbour', 'Mbour · Saly', 'Mbour', 14.42, -16.96)
const TOUBA = Q('touba', 'Touba', 'Touba', 14.85, -15.88)

const ALL = [PLATEAU, MERMOZ, RUFISQUE, DIASS, THIES, MBOUR, TOUBA]

const counts = (entries: Record<string, number>) => new Map(Object.entries(entries))
const NONE = new Map<string, number>()

describe('fitsInDakar', () => {
  it('el casco urbano cabe en la foto de Dakar', () => {
    expect(fitsInDakar(PLATEAU)).toBe(true)
    expect(fitsInDakar(RUFISQUE)).toBe(true)
  })

  it('Diass, Thiès y Mbour no caben: por eso existe la vista región', () => {
    expect(fitsInDakar(DIASS)).toBe(false)
    expect(fitsInDakar(THIES)).toBe(false)
    expect(fitsInDakar(MBOUR)).toBe(false)
  })
})

describe('buildMapItems · vista Dakar', () => {
  it('pinta burbuja por barrio y deja Diass en un chip', () => {
    const { bubbles, chips } = buildMapItems(ALL, counts({ plateau: 2, diass: 3 }), NONE, 'dakar')

    expect(bubbles.map((b) => b.id)).toEqual(['plateau'])
    expect(bubbles[0]!.pannes).toBe(2)
    expect(chips.map((c) => c.id)).toEqual(['Diass'])
    expect(chips[0]!.count).toBe(3)
  })

  it('una zona sin avisos no se pinta de ninguna de las dos formas', () => {
    const { bubbles, chips } = buildMapItems(ALL, counts({ plateau: 1 }), NONE, 'dakar')
    expect(bubbles).toHaveLength(1)
    expect(chips).toHaveLength(0)
  })

  it('suma pannes y maintenances de la misma zona', () => {
    const { bubbles } = buildMapItems(ALL, counts({ mermoz: 1 }), counts({ mermoz: 4 }), 'dakar')
    expect(bubbles[0]!.pannes).toBe(1)
    expect(bubbles[0]!.maints).toBe(4)
  })
})

describe('buildMapItems · vista région', () => {
  it('Diass ya es una burbuja, no un chip', () => {
    const { bubbles, chips } = buildMapItems(ALL, counts({ diass: 3 }), NONE, 'region')

    const diass = bubbles.find((b) => b.id === 'diass')
    expect(diass?.pannes).toBe(3)
    expect(chips.map((c) => c.id)).not.toContain('Diass')
  })

  it('el casco urbano se junta en una sola burbuja «Dakar» con la suma', () => {
    const { bubbles } = buildMapItems(
      ALL,
      counts({ plateau: 2, mermoz: 1, rufisque: 1 }),
      counts({ plateau: 3 }),
      'region'
    )

    const cluster = bubbles.find((b) => b.id === DAKAR_CLUSTER)
    expect(cluster?.pannes).toBe(4)
    expect(cluster?.maints).toBe(3)
    // Al pulsarla filtra por todas las zonas que agrupa
    expect(cluster?.codes).toEqual(expect.arrayContaining(['plateau', 'mermoz', 'rufisque']))
    // y esas zonas no se pintan además por separado
    expect(bubbles.filter((b) => b.id === 'plateau')).toHaveLength(0)
  })

  it('sin avisos en el casco urbano no aparece la burbuja «Dakar»', () => {
    const { bubbles } = buildMapItems(ALL, counts({ thies: 1 }), NONE, 'region')
    expect(bubbles.map((b) => b.id)).toEqual(['thies'])
  })

  it('Touba sigue siendo un chip: no cabe en ninguna de las dos fotos', () => {
    const { bubbles, chips } = buildMapItems(ALL, counts({ touba: 2 }), NONE, 'region')
    expect(bubbles).toHaveLength(0)
    expect(chips.map((c) => c.id)).toEqual(['Touba'])
  })

  it('la burbuja «Dakar» cae dentro de la foto, en su mitad noroeste', () => {
    const { bubbles } = buildMapItems(ALL, counts({ plateau: 1 }), NONE, 'region')
    const cluster = bubbles.find((b) => b.id === DAKAR_CLUSTER)!
    expect(cluster.x).toBeGreaterThan(0)
    expect(cluster.x).toBeLessThan(50)
    expect(cluster.y).toBeGreaterThan(0)
    expect(cluster.y).toBeLessThan(50)
  })
})

describe('buildMapItems · chips', () => {
  it('ordena los chips de más avisos a menos', () => {
    const { chips } = buildMapItems(ALL, counts({ touba: 1, mbour: 5 }), NONE, 'dakar')
    expect(chips.map((c) => c.id)).toEqual(['Mbour', 'Touba'])
  })

  it('un chip de ciudad agrupa todos sus barrios', () => {
    const thiesNord = Q('thies-nord', 'Thiès Nord', 'Thiès', 14.81, -16.94)
    const { chips } = buildMapItems(
      [...ALL, thiesNord],
      counts({ thies: 1, 'thies-nord': 2 }),
      NONE,
      'dakar'
    )
    const chip = chips.find((c) => c.id === 'Thiès')!
    expect(chip.count).toBe(3)
    expect(chip.codes).toEqual(expect.arrayContaining(['thies', 'thies-nord']))
  })
})

describe('viewForQuartier', () => {
  it('lleva a la vista donde la zona se ve', () => {
    expect(viewForQuartier(PLATEAU)).toBe('dakar')
    expect(viewForQuartier(DIASS)).toBe('region')
    expect(viewForQuartier(MBOUR)).toBe('region')
  })

  it('devuelve null si la zona no está en ninguna foto', () => {
    expect(viewForQuartier(TOUBA)).toBeNull()
  })
})

describe('isBubbleActive', () => {
  const bubble = (id: string, codes: string[]) =>
    ({ id, label: id, codes, x: 0, y: 0, pannes: 1, maints: 0 })

  it('sin filtro no hay ninguna resaltada', () => {
    expect(isBubbleActive(bubble('diass', ['diass']), null)).toBe(false)
  })

  it('resalta la burbuja aunque el filtro venga del chip de la ciudad', () => {
    // El chip «Diass» filtra por ciudad; la burbuja se llama por su código. Es la misma zona.
    expect(isBubbleActive(bubble('diass', ['diass']), ['diass'])).toBe(true)
  })

  it('no resalta una zona que el filtro no incluye', () => {
    expect(isBubbleActive(bubble('thies', ['thies']), ['diass'])).toBe(false)
  })

  it('el grupo «Dakar» solo se resalta si el filtro trae todas sus zonas', () => {
    const cluster = bubble(DAKAR_CLUSTER, ['plateau', 'mermoz'])
    expect(isBubbleActive(cluster, ['plateau'])).toBe(false)
    expect(isBubbleActive(cluster, ['plateau', 'mermoz'])).toBe(true)
  })
})
