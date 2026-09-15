/**
 * Qué se pinta en cada una de las dos vistas del mapa del kiosko.
 *
 * El mapa tiene dos fotos: `dakar.jpg` (el casco urbano, la de siempre) y `region.jpg`, que se
 * añadió porque Diass —el aeropuerto AIBD, donde están las máquinas de 2AS— no cabía en la
 * primera y solo existía como chip: se veía el número, no el sitio.
 *
 * Regla de reparto, una sola y geométrica: **una zona lleva burbuja propia en la vista en la que
 * cabe**. En la vista región, todo lo que ya tiene burbuja en la vista Dakar se junta en un único
 * círculo «Dakar», porque a 81 km de ancho Plateau, Médina y Point E se dibujarían encima unos de
 * otros. Lo que no cabe en ninguna foto (Touba, Kaolack, Saint-Louis, Ziguinchor) se queda en
 * chips, como antes.
 *
 * Todo es puro para poder probarlo sin navegador: entran zonas y cuentas, salen burbujas y chips.
 */

import { DAKAR_FRAME, REGION_FRAME, isInsideFrame, latLngToPercent, type MapFrame } from './mapFrame'
import type { Quartier } from '@/lib/quartiers'

export type MapViewId = 'dakar' | 'region'

/** Id de la burbuja que agrupa el casco urbano cuando se mira la región. */
export const DAKAR_CLUSTER = 'dakar-agglo'

export type MapBubble = {
  /** Identidad de la selección. Es el código de la zona, o `DAKAR_CLUSTER` si agrupa varias. */
  id: string
  label: string
  /** Zonas por las que filtra al pulsarla. */
  codes: string[]
  /** Posición dentro de la foto, en porcentaje. */
  x: number
  y: number
  pannes: number
  maints: number
}

export type MapChip = { id: string; label: string; codes: string[]; count: number }

const FRAME: Record<MapViewId, MapFrame> = { dakar: DAKAR_FRAME, region: REGION_FRAME }

/** Ciudad del catálogo que da nombre al casco urbano. Solo se usa para agrupar chips. */
const DAKAR = 'Dakar'

/**
 * Centro de la burbuja «Dakar» en la vista región: el centro del encuadre que ella representa.
 * Es fijo a propósito —no se mueve con los datos— para que el despachador la busque siempre en
 * el mismo sitio.
 */
function dakarClusterPoint(): { x: number; y: number } {
  const cx = (DAKAR_FRAME.xmin + DAKAR_FRAME.xmax) / 2
  const cy = (DAKAR_FRAME.ymin + DAKAR_FRAME.ymax) / 2
  const round = (n: number) => Math.round(n * 10_000) / 10_000
  return {
    x: round(((cx - REGION_FRAME.xmin) / (REGION_FRAME.xmax - REGION_FRAME.xmin)) * 100),
    y: round(((REGION_FRAME.ymax - cy) / (REGION_FRAME.ymax - REGION_FRAME.ymin)) * 100),
  }
}

/** ¿Esta zona tiene burbuja propia en la vista de Dakar? */
export function fitsInDakar(quartier: Quartier): boolean {
  return isInsideFrame(latLngToPercent(quartier.lat, quartier.lng, DAKAR_FRAME))
}

export function buildMapItems(
  quartiers: Quartier[],
  pannes: ReadonlyMap<string, number>,
  maints: ReadonlyMap<string, number>,
  view: MapViewId
): { bubbles: MapBubble[]; chips: MapChip[] } {
  const frame = FRAME[view]
  const bubbles: MapBubble[] = []
  const placed = new Set<string>()

  const zones = quartiers.map((quartier) => ({
    quartier,
    inDakar: fitsInDakar(quartier),
    point: latLngToPercent(quartier.lat, quartier.lng, frame),
    pannes: pannes.get(quartier.code) ?? 0,
    maints: maints.get(quartier.code) ?? 0,
  }))

  if (view === 'region') {
    const cluster = zones.filter((z) => z.inDakar)
    for (const z of cluster) placed.add(z.quartier.code)

    const p = cluster.reduce((n, z) => n + z.pannes, 0)
    const m = cluster.reduce((n, z) => n + z.maints, 0)
    if (p + m > 0) {
      bubbles.push({
        id: DAKAR_CLUSTER,
        label: DAKAR,
        codes: cluster.map((z) => z.quartier.code),
        ...dakarClusterPoint(),
        pannes: p,
        maints: m,
      })
    }
  }

  for (const z of zones) {
    if (placed.has(z.quartier.code)) continue
    // En la vista de Dakar solo se pintan las zonas del casco urbano: el resto no está en la foto.
    if (view === 'dakar' && !z.inDakar) continue
    if (!isInsideFrame(z.point)) continue
    if (z.pannes + z.maints === 0) continue

    bubbles.push({
      id: z.quartier.code,
      label: z.quartier.label,
      codes: [z.quartier.code],
      x: z.point.x,
      y: z.point.y,
      pannes: z.pannes,
      maints: z.maints,
    })
    placed.add(z.quartier.code)
  }

  // Chips: lo que tiene avisos y no ha entrado en ninguna burbuja. Se agrupan por ciudad (si
  // Thiès tuviera dos barrios, un solo chip los suma). La clave agrupa y la etiqueta solo se
  // pinta: son espacios distintos, porque una ciudad puede llamarse igual que el barrio de otra.
  const groups = new Map<string, MapChip>()
  for (const z of zones) {
    const count = z.pannes + z.maints
    if (count === 0 || placed.has(z.quartier.code)) continue

    // Una zona de Dakar que no cabe en su propia foto va con su nombre, no bajo «Dakar»:
    // llamarla «Dakar» la confundiría con el resto del casco urbano.
    const isLooseDakar = z.quartier.ville === DAKAR && !z.inDakar
    const key = isLooseDakar ? z.quartier.code : z.quartier.ville
    const entry = groups.get(key) ?? {
      id: key,
      label: isLooseDakar ? z.quartier.label : z.quartier.ville,
      codes: [],
      count: 0,
    }
    entry.codes.push(z.quartier.code)
    entry.count += count
    groups.set(key, entry)
  }

  return { bubbles, chips: [...groups.values()].sort((a, b) => b.count - a.count) }
}

/**
 * ¿Esta burbuja está dentro de lo que se ha filtrado?
 *
 * No se compara por identidad porque la misma zona se puede haber seleccionado desde sitios que
 * la nombran distinto: el chip «Diass» filtra por ciudad y la burbuja se llama por su código. Lo
 * que decide es el contenido: una burbuja se resalta cuando todas sus zonas están en el filtro.
 */
export function isBubbleActive(bubble: MapBubble, selectedCodes: string[] | null): boolean {
  if (!selectedCodes) return false
  return bubble.codes.every((code) => selectedCodes.includes(code))
}

/**
 * Vista en la que hay que mirar para VER una zona.
 *
 * La usa el chip: si pulsas «Diass» desde la vista de Dakar, el mapa salta solo a la región y
 * allí la zona ya es una burbuja. Si no cabe en ninguna foto (Touba), devuelve `null` y la vista
 * se queda como está.
 */
export function viewForQuartier(quartier: Quartier): MapViewId | null {
  if (fitsInDakar(quartier)) return 'dakar'
  if (isInsideFrame(latLngToPercent(quartier.lat, quartier.lng, REGION_FRAME))) return 'region'
  return null
}
