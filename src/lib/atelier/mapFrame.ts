/**
 * Encuadre del mapa del kiosko y conversión de coordenadas a posición dentro de la imagen.
 *
 * La foto (`public/images/atelier/dakar.jpg`, Esri World Imagery tratada) se descargó UNA vez
 * con un encuadre fijo. El servicio ajusta el bbox pedido al aspecto de la imagen, así que lo
 * que vale es el `extent` que devolvió él, no el que se pidió: son las constantes de abajo.
 * Si algún día se regenera la imagen, hay que actualizar `DAKAR_FRAME` con el nuevo extent
 * (pedir la exportación con `f=json` y copiar xmin/ymin/xmax/ymax).
 *
 * Proyección: Web Mercator (EPSG:3857), la de todos los mapas web.
 */

export type MapFrame = {
  xmin: number
  ymin: number
  xmax: number
  ymax: number
}

/** Extent devuelto por Esri para `public/images/atelier/dakar.jpg` (1200×760). */
export const DAKAR_FRAME: MapFrame = {
  xmin: -1954770.2583298835,
  ymin: 1647400.6480961184,
  xmax: -1919148.021276036,
  ymax: 1669961.3982302218,
}

/** Radio de la Tierra usado por Web Mercator. */
const EARTH_RADIUS = 6378137

export type Point = { x: number; y: number }

/**
 * Posición de unas coordenadas dentro de la imagen, en porcentaje (0–100).
 * El CSS las usa tal cual con `left: x%` / `top: y%`.
 */
export function latLngToPercent(lat: number, lng: number, frame: MapFrame): Point {
  const x = EARTH_RADIUS * (lng * Math.PI / 180)
  const y = EARTH_RADIUS * Math.log(Math.tan(Math.PI / 4 + (lat * Math.PI / 180) / 2))

  return {
    x: ((x - frame.xmin) / (frame.xmax - frame.xmin)) * 100,
    y: ((frame.ymax - y) / (frame.ymax - frame.ymin)) * 100,
  }
}

/** ¿El punto cae dentro de la foto? Mbour o Thiès no: esas ciudades van en los chips. */
export function isInsideFrame(point: Point): boolean {
  return point.x >= 0 && point.x <= 100 && point.y >= 0 && point.y <= 100
}

const MIN_RADIUS = 22
const MAX_RADIUS = 44

/**
 * Radio en píxeles de la burbuja de una zona, según cuántos avisos tenga.
 *
 * El tope existe por geografía: Mermoz, Liberté y Point E están a un par de kilómetros unos de
 * otros, así que en la foto sus burbujas se tocan en cuanto crecen. Mejor un número grande
 * dentro de un círculo acotado que tres círculos solapados.
 */
export function bubbleRadius(count: number): number {
  if (count <= 0) return 0
  return Math.min(MAX_RADIUS, MIN_RADIUS + (count - 1) * 3)
}
