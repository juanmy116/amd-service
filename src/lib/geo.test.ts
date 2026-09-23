import { describe, it, expect } from 'vitest'
import {
  distanceMeters, presenceFor, parseLatLng, itineraryLinks, destinationText, formatDistance,
  sortByDistance, readPosition, presenceLabel, isValidLatLng,
  PRESENCE_RADIUS_M, FIRST_SCAN_MAX_ACCURACY_M, NEAR_MAX_ACCURACY_M, type LatLng,
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
  it('radio de presencia 200 m, precisión máxima del primer escaneo 100 m y de «sur place» 150 m', () => {
    expect(PRESENCE_RADIUS_M).toBe(200)
    expect(FIRST_SCAN_MAX_ACCURACY_M).toBe(100)
    expect(NEAR_MAX_ACCURACY_M).toBe(150)
  })
})

describe('presenceFor', () => {
  // Posición del técnico con una precisión dada (por defecto, un GPS bueno: ± 10 m).
  const at = (p: LatLng, accuracy = 10) => ({ ...p, accuracy })
  // Punto a `m` metros al norte de PLATEAU.
  const north = (m: number): LatLng => ({ lat: PLATEAU.lat + (m / 6_371_008) * (180 / Math.PI), lng: PLATEAU.lng })

  it('sin posición del técnico ⇒ no_position', () => {
    expect(presenceFor({ tech: null, machine: PLATEAU })).toEqual({ presence: 'no_position', distance: null })
  })

  it('sin posición del técnico ni de la máquina ⇒ no_position (manda lo del técnico)', () => {
    expect(presenceFor({ tech: null, machine: null })).toEqual({ presence: 'no_position', distance: null })
  })

  it('máquina sin ubicación ⇒ no_machine_position', () => {
    expect(presenceFor({ tech: at(PLATEAU), machine: null })).toEqual({ presence: 'no_machine_position', distance: null })
  })

  it('a ≤ 200 m con buena precisión ⇒ near, distancia redondeada al metro', () => {
    // ~0,001° de latitud ≈ 111 m.
    const r = presenceFor({ tech: at({ lat: 14.6718, lng: -17.4381 }), machine: PLATEAU })
    expect(r.presence).toBe('near')
    expect(Number.isInteger(r.distance)).toBe(true)
    expect(r.distance).toBeGreaterThan(100)
    expect(r.distance).toBeLessThan(120)
  })

  it('justo en el borde (200 m, precisión 150 m) cuenta como near', () => {
    const r = presenceFor({ tech: at(north(200 * 0.999), NEAR_MAX_ACCURACY_M), machine: PLATEAU })
    expect(r.presence).toBe('near')
  })

  it('a > 200 m y lejos aunque se reste la precisión ⇒ far', () => {
    const r = presenceFor({ tech: at(ALMADIES), machine: PLATEAU })
    expect(r.presence).toBe('far')
    expect(r.distance).toBe(Math.round(distanceMeters(ALMADIES, PLATEAU)))
    expect(presenceFor({ tech: at(north(250), 20), machine: PLATEAU }).presence).toBe('far')
  })

  it('cerca pero con mala precisión ⇒ imprecise (no se da por «sur place»)', () => {
    const r = presenceFor({ tech: at(north(50), 151), machine: PLATEAU })
    expect(r.presence).toBe('imprecise')
    expect(r.distance).toBe(50)
  })

  it('lejos pero dentro del margen de error ⇒ imprecise (no se acusa de «loin»)', () => {
    // 400 m con ± 300 m: podría estar a 100 m.
    expect(presenceFor({ tech: at(north(400), 300), machine: PLATEAU }).presence).toBe('imprecise')
    // 250 m con ± 60 m: podría estar a 190 m.
    expect(presenceFor({ tech: at(north(250), 60), machine: PLATEAU }).presence).toBe('imprecise')
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

  it('«lat lng» separados por espacios o por punto y coma', () => {
    expect(parseLatLng('14.6928 -17.4467')).toEqual({ lat: 14.6928, lng: -17.4467 })
    expect(parseLatLng('14.6928   -17.4467')).toEqual({ lat: 14.6928, lng: -17.4467 })
    expect(parseLatLng('14.6928;-17.4467')).toEqual({ lat: 14.6928, lng: -17.4467 })
    expect(parseLatLng('14.6928 ; -17.4467')).toEqual({ lat: 14.6928, lng: -17.4467 })
  })

  it('decimales con coma, separados por espacio o por punto y coma', () => {
    expect(parseLatLng('14,69 -17,44')).toEqual({ lat: 14.69, lng: -17.44 })
    expect(parseLatLng('14,6928;-17,4467')).toEqual({ lat: 14.6928, lng: -17.4467 })
    expect(parseLatLng('14,6928 ; -17,4467')).toEqual({ lat: 14.6928, lng: -17.4467 })
  })

  it('decimales con coma separados por coma es ambiguo ⇒ null', () => {
    expect(parseLatLng('14,69,-17,44')).toBeNull()
  })

  it('acepta un + delante', () => {
    expect(parseLatLng('+14.69, -17.44')).toEqual({ lat: 14.69, lng: -17.44 })
    expect(parseLatLng('+14,69 -17,44')).toEqual({ lat: 14.69, lng: -17.44 })
  })

  it('enlace de itinerario (/maps/dir/) ⇒ null: su @ es la vista, no el destino', () => {
    expect(parseLatLng('https://www.google.com/maps/dir/Plateau/Almadies/@14.7,-17.47,13z')).toBeNull()
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

  it('no finito o negativo ⇒ «—»', () => {
    expect(formatDistance(NaN)).toBe('—')
    expect(formatDistance(Infinity)).toBe('—')
    expect(formatDistance(-5)).toBe('—')
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

describe('readPosition', () => {
  function fd(fields: Record<string, string>): FormData {
    const f = new FormData()
    for (const [k, v] of Object.entries(fields)) f.set(k, v)
    return f
  }

  it('lee una posición válida', () => {
    expect(readPosition(fd({ pos_lat: '14.6928', pos_lng: '-17.4467', pos_accuracy: '12.5' })))
      .toEqual({ lat: 14.6928, lng: -17.4467, accuracy: 12.5 })
    expect(readPosition(fd({ pos_lat: '0', pos_lng: '0', pos_accuracy: '0' })))
      .toEqual({ lat: 0, lng: 0, accuracy: 0 })
  })

  it('sin posición (el navegador no la dio) ⇒ null', () => {
    expect(readPosition(new FormData())).toBeNull()
  })

  it('falta algún campo o viene vacío ⇒ null', () => {
    expect(readPosition(fd({ pos_lat: '14.69', pos_lng: '-17.44' }))).toBeNull()
    expect(readPosition(fd({ pos_lat: '14.69', pos_accuracy: '10' }))).toBeNull()
    expect(readPosition(fd({ pos_lat: '', pos_lng: '-17.44', pos_accuracy: '10' }))).toBeNull()
    expect(readPosition(fd({ pos_lat: '14.69', pos_lng: '-17.44', pos_accuracy: ' ' }))).toBeNull()
  })

  it('NaN o Infinity ⇒ null', () => {
    expect(readPosition(fd({ pos_lat: 'abc', pos_lng: '-17.44', pos_accuracy: '10' }))).toBeNull()
    expect(readPosition(fd({ pos_lat: 'NaN', pos_lng: '-17.44', pos_accuracy: '10' }))).toBeNull()
    expect(readPosition(fd({ pos_lat: '14.69', pos_lng: 'Infinity', pos_accuracy: '10' }))).toBeNull()
    expect(readPosition(fd({ pos_lat: '14.69', pos_lng: '-17.44', pos_accuracy: 'Infinity' }))).toBeNull()
  })

  it('fuera de rango ⇒ null', () => {
    expect(readPosition(fd({ pos_lat: '90.5', pos_lng: '-17.44', pos_accuracy: '10' }))).toBeNull()
    expect(readPosition(fd({ pos_lat: '14.69', pos_lng: '-180.1', pos_accuracy: '10' }))).toBeNull()
  })

  it('precisión negativa ⇒ null', () => {
    expect(readPosition(fd({ pos_lat: '14.69', pos_lng: '-17.44', pos_accuracy: '-1' }))).toBeNull()
  })

  it('solo decimales estrictos: hex, exponentes, espacios o «14.» ⇒ null', () => {
    expect(readPosition(fd({ pos_lat: '0x10', pos_lng: '-17.44', pos_accuracy: '10' }))).toBeNull()
    expect(readPosition(fd({ pos_lat: '14.69', pos_lng: '-17.44', pos_accuracy: '1e2' }))).toBeNull()
    expect(readPosition(fd({ pos_lat: ' 14.69', pos_lng: '-17.44', pos_accuracy: '10' }))).toBeNull()
    expect(readPosition(fd({ pos_lat: '14.', pos_lng: '-17.44', pos_accuracy: '10' }))).toBeNull()
    expect(readPosition(fd({ pos_lat: '+14.69', pos_lng: '-17.44', pos_accuracy: '10' }))).toBeNull()
  })
})

describe('isValidLatLng', () => {
  it('en rango y finito', () => {
    expect(isValidLatLng(14.69, -17.44)).toBe(true)
    expect(isValidLatLng(90, 180)).toBe(true)
    expect(isValidLatLng(-90, -180)).toBe(true)
  })

  it('fuera de rango o no finito', () => {
    expect(isValidLatLng(90.1, 0)).toBe(false)
    expect(isValidLatLng(0, -180.1)).toBe(false)
    expect(isValidLatLng(NaN, 0)).toBe(false)
    expect(isValidLatLng(0, Infinity)).toBe(false)
  })
})

describe('presenceLabel', () => {
  it('near ⇒ vert, distance en mètres', () => {
    expect(presenceLabel('near', 45)).toEqual({ tone: 'green', text: 'Sur place (à 45 m)' })
  })

  it('far ⇒ ambre, distance en km', () => {
    expect(presenceLabel('far', 2300)).toEqual({ tone: 'amber', text: 'Loin de la machine (à 2,3 km)' })
  })

  it('imprecise ⇒ ambre, avec la précision', () => {
    expect(presenceLabel('imprecise', 120, 1234)).toEqual({ tone: 'amber', text: 'Position imprécise (± 1,2 km)' })
    expect(presenceLabel('imprecise', 120, 180)).toEqual({ tone: 'amber', text: 'Position imprécise (± 180 m)' })
  })

  it('imprecise sans précision connue ⇒ ambre, texte seul', () => {
    expect(presenceLabel('imprecise', 120, null)).toEqual({ tone: 'amber', text: 'Position imprécise' })
    expect(presenceLabel('imprecise', 120)).toEqual({ tone: 'amber', text: 'Position imprécise' })
  })

  it('no_position ⇒ ambre, sans distance', () => {
    expect(presenceLabel('no_position', null)).toEqual({ tone: 'amber', text: 'Position non transmise' })
  })

  it('no_machine_position ⇒ gris, sans distance', () => {
    expect(presenceLabel('no_machine_position', null))
      .toEqual({ tone: 'grey', text: 'Machine sans position enregistrée' })
  })

  it('null (tâche antérieure à la phase) ⇒ null, rien à afficher', () => {
    expect(presenceLabel(null, null)).toBeNull()
  })
})
