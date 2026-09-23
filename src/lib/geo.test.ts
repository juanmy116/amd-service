import { describe, it, expect } from 'vitest'
import {
  distanceMeters, presenceFor, parseLatLng, itineraryLinks, destinationText, formatDistance,
  sortByDistance, PRESENCE_RADIUS_M, FIRST_SCAN_MAX_ACCURACY_M, type LatLng,
} from './geo'

const PLATEAU: LatLng = { lat: 14.6708, lng: -17.4381 }
const ALMADIES: LatLng = { lat: 14.7447, lng: -17.5130 }

describe('distanceMeters', () => {
  it('mismo punto ⇒ 0', () => {
    expect(distanceMeters(PLATEAU, PLATEAU)).toBe(0)
  })

  it('Plateau → Almadies ≈ 11,5 km (haversine calculado aparte: 11 507 m)', () => {
    const d = distanceMeters(PLATEAU, ALMADIES)
    expect(d).toBeGreaterThan(11_507 * 0.995)
    expect(d).toBeLessThan(11_507 * 1.005)
  })

  it('es simétrica', () => {
    expect(distanceMeters(PLATEAU, ALMADIES)).toBeCloseTo(distanceMeters(ALMADIES, PLATEAU), 6)
  })
})

describe('umbrales', () => {
  it('radio de presencia 200 m y precisión máxima del primer escaneo 100 m', () => {
    expect(PRESENCE_RADIUS_M).toBe(200)
    expect(FIRST_SCAN_MAX_ACCURACY_M).toBe(100)
  })
})

describe('presenceFor', () => {
  it('sin posición del técnico ⇒ no_position', () => {
    expect(presenceFor({ tech: null, machine: PLATEAU })).toEqual({ presence: 'no_position', distance: null })
  })

  it('sin posición del técnico ni de la máquina ⇒ no_position (manda lo del técnico)', () => {
    expect(presenceFor({ tech: null, machine: null })).toEqual({ presence: 'no_position', distance: null })
  })

  it('máquina sin ubicación ⇒ no_machine_position', () => {
    expect(presenceFor({ tech: PLATEAU, machine: null })).toEqual({ presence: 'no_machine_position', distance: null })
  })

  it('a ≤ 200 m ⇒ near, distancia redondeada al metro', () => {
    // ~0,001° de latitud ≈ 111 m.
    const r = presenceFor({ tech: { lat: 14.6718, lng: -17.4381 }, machine: PLATEAU })
    expect(r.presence).toBe('near')
    expect(Number.isInteger(r.distance)).toBe(true)
    expect(r.distance).toBeGreaterThan(100)
    expect(r.distance).toBeLessThan(120)
  })

  it('justo en el borde (200 m) cuenta como near', () => {
    // 200 m hacia el norte: 200 / 6 371 008 rad.
    const dLat = (200 / 6_371_008) * (180 / Math.PI)
    const r = presenceFor({ tech: { lat: PLATEAU.lat + dLat * 0.999, lng: PLATEAU.lng }, machine: PLATEAU })
    expect(r.presence).toBe('near')
  })

  it('a > 200 m ⇒ far', () => {
    const r = presenceFor({ tech: ALMADIES, machine: PLATEAU })
    expect(r.presence).toBe('far')
    expect(r.distance).toBe(Math.round(distanceMeters(ALMADIES, PLATEAU)))
  })
})

describe('parseLatLng', () => {
  it('«lat, lng» con y sin espacio', () => {
    expect(parseLatLng('14.6928, -17.4467')).toEqual({ lat: 14.6928, lng: -17.4467 })
    expect(parseLatLng('14.6928,-17.4467')).toEqual({ lat: 14.6928, lng: -17.4467 })
    expect(parseLatLng('  14.6928 ,  -17.4467  ')).toEqual({ lat: 14.6928, lng: -17.4467 })
  })

  it('enlace de Google Maps con @lat,lng', () => {
    expect(parseLatLng('https://www.google.com/maps/@14.6928,-17.4467,17z')).toEqual({ lat: 14.6928, lng: -17.4467 })
  })

  it('enlace de un lugar: prefiere !3d/!4d (el punto del lugar) sobre @ (el centro de la vista)', () => {
    expect(parseLatLng('https://www.google.com/maps/place/X/@14.69,-17.44,17z/data=!3d14.6931!4d-17.4471'))
      .toEqual({ lat: 14.6931, lng: -17.4471 })
  })

  it('?q=lat,lng y query=lat,lng', () => {
    expect(parseLatLng('https://maps.google.com/?q=14.69,-17.44')).toEqual({ lat: 14.69, lng: -17.44 })
    expect(parseLatLng('https://www.google.com/maps/search/?api=1&query=14.69%2C-17.44'))
      .toEqual({ lat: 14.69, lng: -17.44 })
  })

  it('enlaces cortos ⇒ null (no se pueden resolver sin red)', () => {
    expect(parseLatLng('https://maps.app.goo.gl/abc')).toBeNull()
    expect(parseLatLng('https://goo.gl/maps/abc')).toBeNull()
  })

  it('fuera de rango ⇒ null', () => {
    expect(parseLatLng('95, -17.44')).toBeNull()
    expect(parseLatLng('14.69, -190')).toBeNull()
    expect(parseLatLng('https://www.google.com/maps/@91.1,-17.44,17z')).toBeNull()
  })

  it('texto cualquiera ⇒ null', () => {
    expect(parseLatLng('Rue 10, Plateau')).toBeNull()
    expect(parseLatLng('')).toBeNull()
    expect(parseLatLng('https://www.google.com/maps/place/AMD+Service')).toBeNull()
  })
})

describe('itineraryLinks', () => {
  it('con coordenadas', () => {
    expect(itineraryLinks({ coords: { lat: 14.69, lng: -17.44 }, text: 'ignoré' })).toEqual({
      google: 'https://www.google.com/maps/dir/?api=1&destination=14.69,-17.44',
      waze: 'https://waze.com/ul?ll=14.69,-17.44&navigate=yes',
      apple: 'https://maps.apple.com/?daddr=14.69,-17.44',
    })
  })

  it('con texto (codificado)', () => {
    const t = 'Rue 10, Plateau, Dakar, Sénégal'
    const e = encodeURIComponent(t)
    expect(itineraryLinks({ coords: null, text: t })).toEqual({
      google: `https://www.google.com/maps/dir/?api=1&destination=${e}`,
      waze: `https://waze.com/ul?q=${e}&navigate=yes`,
      apple: `https://maps.apple.com/?daddr=${e}`,
    })
  })

  it('sin coordenadas ni texto ⇒ null', () => {
    expect(itineraryLinks({ coords: null, text: null })).toBeNull()
    expect(itineraryLinks({ coords: null, text: '   ' })).toBeNull()
  })
})

describe('destinationText', () => {
  it('une lo que haya y añade Sénégal', () => {
    expect(destinationText({ adresse: 'Rue 10', quartier: 'Plateau', ville: 'Dakar' })).toBe('Rue 10, Plateau, Dakar, Sénégal')
    expect(destinationText({ adresse: null, quartier: 'Almadies', ville: null })).toBe('Almadies, Sénégal')
    expect(destinationText({ adresse: '  ', quartier: null, ville: 'Thiès' })).toBe('Thiès, Sénégal')
  })

  it('null si no hay nada', () => {
    expect(destinationText({ adresse: null, quartier: null, ville: null })).toBeNull()
    expect(destinationText({ adresse: '', quartier: ' ', ville: null })).toBeNull()
  })
})

describe('formatDistance', () => {
  it('metros, km con un decimal (coma) y km enteros', () => {
    expect(formatDistance(45)).toBe('45 m')
    expect(formatDistance(1234)).toBe('1,2 km')
    expect(formatDistance(12345)).toBe('12 km')
  })

  it('redondea sin saltos raros en los bordes', () => {
    expect(formatDistance(999.6)).toBe('1,0 km')
    expect(formatDistance(9_980)).toBe('10 km')
  })
})

describe('sortByDistance', () => {
  type Item = { id: string; c: LatLng | null }
  const items: Item[] = [
    { id: 'sin-1', c: null },
    { id: 'almadies', c: ALMADIES },
    { id: 'sin-2', c: null },
    { id: 'plateau', c: PLATEAU },
  ]

  it('ordena por distancia al origen; los sin coordenadas al final en su orden', () => {
    const sorted = sortByDistance(items, { lat: 14.672, lng: -17.44 }, (i) => i.c)
    expect(sorted.map((i) => i.id)).toEqual(['plateau', 'almadies', 'sin-1', 'sin-2'])
  })

  it('no modifica el array original', () => {
    sortByDistance(items, PLATEAU, (i) => i.c)
    expect(items.map((i) => i.id)).toEqual(['sin-1', 'almadies', 'sin-2', 'plateau'])
  })
})
