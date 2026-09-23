/**
 * Geolocalización (Fase 3 de la PWA de técnicos). Lógica pura, sin red ni navegador:
 * distancia entre dos puntos, veredicto de presencia del técnico, enlaces de itinerario,
 * lectura de coordenadas pegadas por el admin, formato y orden por cercanía.
 */

export type LatLng = { lat: number; lng: number }

/**
 * near = técnico a ≤ PRESENCE_RADIUS_M de la máquina · far = más lejos ·
 * no_position = sin permiso o sin GPS · no_machine_position = la máquina aún no tiene ubicación.
 */
export type Presence = 'near' | 'far' | 'no_position' | 'no_machine_position'

/** Radio dentro del cual el técnico cuenta como «sur place». */
export const PRESENCE_RADIUS_M = 200
/** El primer escaneo solo fija la ubicación de la máquina si el GPS es al menos así de preciso. */
export const FIRST_SCAN_MAX_ACCURACY_M = 100

// Radio medio de la Tierra (IUGG).
const EARTH_RADIUS_M = 6_371_008

const toRad = (deg: number) => (deg * Math.PI) / 180

/** Distancia en metros sobre la esfera (haversine). Sobra precisión para una ciudad. */
export function distanceMeters(a: LatLng, b: LatLng): number {
  const dLat = toRad(b.lat - a.lat)
  const dLng = toRad(b.lng - a.lng)
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2
  return 2 * EARTH_RADIUS_M * Math.asin(Math.min(1, Math.sqrt(h)))
}

/** Veredicto de presencia. Sin posición del técnico manda eso, aunque la máquina tampoco tenga. */
export function presenceFor({ tech, machine }: { tech: LatLng | null; machine: LatLng | null }): {
  presence: Presence
  distance: number | null
} {
  if (!tech) return { presence: 'no_position', distance: null }
  if (!machine) return { presence: 'no_machine_position', distance: null }
  const distance = Math.round(distanceMeters(tech, machine))
  return { presence: distance <= PRESENCE_RADIUS_M ? 'near' : 'far', distance }
}

function inRange(lat: number, lng: number): boolean {
  return Number.isFinite(lat) && Number.isFinite(lng) && Math.abs(lat) <= 90 && Math.abs(lng) <= 180
}

function toLatLng(lat: string, lng: string): LatLng | null {
  const la = Number(lat)
  const ln = Number(lng)
  return inRange(la, ln) ? { lat: la, lng: ln } : null
}

const NUM = '(-?\\d+(?:\\.\\d+)?)'
const PLAIN_RE = new RegExp(`^${NUM}\\s*,\\s*${NUM}$`)
const PLACE_RE = new RegExp(`!3d${NUM}!4d${NUM}`)
const QUERY_RE = new RegExp(`[?&](?:q|query)=${NUM}\\s*,\\s*${NUM}`)
const AT_RE = new RegExp(`@${NUM},${NUM}`)
const SHORT_LINK_RE = /(^|\/\/)(maps\.app\.goo\.gl|goo\.gl\/maps)\b/i

/**
 * Coordenadas a partir de lo que pega el admin: «lat, lng» o un enlace de Google Maps.
 * En un enlace de lugar, `!3d…!4d…` es el punto del lugar y `@…` solo el centro de la vista:
 * se prefiere el primero, luego `?q=` / `query=`, y `@` en último lugar. Los enlaces cortos
 * (maps.app.goo.gl, goo.gl/maps) no llevan las coordenadas y resolverlos exigiría red ⇒ null.
 */
export function parseLatLng(text: string): LatLng | null {
  const t = text.trim()
  if (!t) return null

  const plain = PLAIN_RE.exec(t)
  if (plain) return toLatLng(plain[1], plain[2])

  if (SHORT_LINK_RE.test(t)) return null

  let url = t
  try { url = decodeURIComponent(t) } catch { /* enlace mal codificado: se usa tal cual */ }

  for (const re of [PLACE_RE, QUERY_RE, AT_RE]) {
    const m = re.exec(url)
    if (m) return toLatLng(m[1], m[2])
  }
  return null
}

/**
 * Posición del técnico tal como la manda el navegador en un FormData (`pos_lat`, `pos_lng`,
 * `pos_accuracy`, ver `appendPosition` en `src/lib/pwa/geolocation.ts`). Viene del cliente:
 * no se fía de nada. Falta algo, no es un número finito, está fuera de rango o la precisión es
 * negativa ⇒ null (se trata como «sans position»).
 */
export function readPosition(fd: FormData): (LatLng & { accuracy: number }) | null {
  const num = (key: string): number => {
    const v = fd.get(key)
    // Number('') y Number(' ') valen 0: un campo vacío no es una coordenada.
    return typeof v === 'string' && v.trim() !== '' ? Number(v) : NaN
  }
  const lat = num('pos_lat')
  const lng = num('pos_lng')
  const accuracy = num('pos_accuracy')
  if (!inRange(lat, lng) || !Number.isFinite(accuracy) || accuracy < 0) return null
  return { lat, lng, accuracy }
}

export type ItineraryLinks ={ google: string; waze: string; apple: string }

/** Enlaces «Itinéraire» para las tres apps. Prefiere coordenadas; si no, la dirección en texto. */
export function itineraryLinks({ coords, text }: { coords: LatLng | null; text: string | null }): ItineraryLinks | null {
  if (coords) {
    const ll = `${coords.lat},${coords.lng}`
    return {
      google: `https://www.google.com/maps/dir/?api=1&destination=${ll}`,
      waze: `https://waze.com/ul?ll=${ll}&navigate=yes`,
      apple: `https://maps.apple.com/?daddr=${ll}`,
    }
  }
  const q = text?.trim()
  if (!q) return null
  const e = encodeURIComponent(q)
  return {
    google: `https://www.google.com/maps/dir/?api=1&destination=${e}`,
    waze: `https://waze.com/ul?q=${e}&navigate=yes`,
    apple: `https://maps.apple.com/?daddr=${e}`,
  }
}

/** Dirección legible para buscar en el mapa cuando la máquina no tiene coordenadas. */
export function destinationText({ adresse, quartier, ville }: {
  adresse: string | null
  quartier: string | null
  ville: string | null
}): string | null {
  const parts = [adresse, quartier, ville].map((p) => p?.trim()).filter((p): p is string => !!p)
  return parts.length ? [...parts, 'Sénégal'].join(', ') : null
}

/** «45 m», «1,2 km», «12 km». */
export function formatDistance(m: number): string {
  const meters = Math.round(m)
  if (meters < 1000) return `${meters} m`
  const km = Math.round(m / 100) / 10
  return km < 10 ? `${km.toFixed(1).replace('.', ',')} km` : `${Math.round(m / 1000)} km`
}

/**
 * Copia ordenada por distancia a `origin`. Lo que no tiene coordenadas va al final conservando
 * su orden relativo (sort estable).
 */
export function sortByDistance<T>(items: T[], origin: LatLng, getCoords: (item: T) => LatLng | null): T[] {
  return items
    .map((item) => {
      const c = getCoords(item)
      return { item, d: c ? distanceMeters(origin, c) : Infinity }
    })
    .sort((a, b) => (a.d === b.d ? 0 : a.d - b.d))
    .map(({ item }) => item)
}
