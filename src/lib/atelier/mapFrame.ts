/**
 * Encuadres de las dos fotos del mapa del kiosko y conversión de coordenadas a posición dentro
 * de la imagen.
 *
 * Las fotos (Esri World Imagery tratada) se descargaron UNA vez con un encuadre fijo. El
 * servicio ajusta el bbox pedido al aspecto de la imagen, así que lo que vale es el `extent`
 * que devolvió él, no el que se pidió: son las constantes de abajo. Si algún día se regenera
 * una imagen, hay que actualizar su frame con el nuevo extent (pedir la exportación con
 * `f=json` y copiar xmin/ymin/xmax/ymax).
 *
 * ⚠️ Las dos son **1100 × 1000** a propósito. Las burbujas se colocan en porcentaje sobre la
 * caja de la foto, así que esa caja tiene que tener la proporción de la imagen o los números
 * dejan de caer sobre su barrio (pasaba con las fotos apaisadas de la primera versión: el hueco
 * del mapa en la TV mide entre 1,04 y 1,19 de ancho por alto, `object-cover` recortaba un tercio
 * del ancho y los pines se iban hasta 200 px). De ahí una proporción casi cuadrada, que llena el
 * hueco, y `aspectRatio` fijado en el componente.
 *
 * Proyección: Web Mercator (EPSG:3857), la de todos los mapas web.
 */

export type MapFrame = {
  xmin: number
  ymin: number
  xmax: number
  ymax: number
}

/** Extent de `public/images/atelier/dakar.jpg` (1100×1000, ~34 × 31 km): el casco urbano. */
export const DAKAR_FRAME: MapFrame = {
  xmin: -1952908.9964000003,
  ymin: 1642161.412695455,
  xmax: -1919228.1713000003,
  ymax: 1672780.3446045457,
}

/**
 * Extent de `public/images/atelier/region.jpg` (1100×1000, ~79 × 71 km).
 *
 * Segunda vista del mapa: la península de Dakar entera más Rufisque, Diamniadio, **Diass**
 * (donde está el aeropuerto AIBD, y con él las máquinas de 2AS), Thiès y Mbour. Sin ella esas
 * zonas solo existían como chip y no se veía dónde caen. Las ciudades lejanas —Touba, Kaolack,
 * Saint-Louis, Ziguinchor— siguen fuera de cualquier foto y se quedan en chips.
 */
export const REGION_FRAME: MapFrame = {
  xmin: -1956195.14782,
  ymin: 1608082.7623000005,
  xmax: -1877648.1150800001,
  ymax: 1679489.1557000005,
}

/** Radio de la Tierra usado por Web Mercator. */
const EARTH_RADIUS = 6378137

export type Point = { x: number; y: number }

/**
 * Posición de unas coordenadas dentro de la imagen, en porcentaje (0–100).
 * El CSS las usa tal cual con `left: x%` / `top: y%`.
 *
 * Se redondea a 4 decimales a propósito: sin ello React avisa de desajuste al hidratar, porque
 * el servidor escribe «40.62499999999898%» y el navegador lo reescribe como «40.625%». Cuatro
 * decimales son 0,0001 % de 1100 px, o sea un diezmilésimo de píxel: no se pierde precisión.
 */
export function latLngToPercent(lat: number, lng: number, frame: MapFrame): Point {
  const x = EARTH_RADIUS * (lng * Math.PI / 180)
  const y = EARTH_RADIUS * Math.log(Math.tan(Math.PI / 4 + (lat * Math.PI / 180) / 2))

  const round = (n: number) => Math.round(n * 10_000) / 10_000

  return {
    x: round(((x - frame.xmin) / (frame.xmax - frame.xmin)) * 100),
    y: round(((frame.ymax - y) / (frame.ymax - frame.ymin)) * 100),
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
