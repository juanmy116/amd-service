import { describe, it, expect } from 'vitest'
import { latLngToPercent, isInsideFrame, bubbleRadius, DAKAR_FRAME, REGION_FRAME } from './mapFrame'

// Puntos de control tomados del propio encuadre de las imágenes (Esri World Imagery, EPSG:3857).
// Los porcentajes esperados se verificaron dibujando las zonas sobre la foto y mirándola: cada
// una cae sobre su sitio real (Almadies en la punta oeste, Plateau en la punta sur, Rufisque al
// este; y en la región, Diass sobre el aeropuerto y Mbour en la Petite Côte).

describe('latLngToPercent', () => {
  it('sitúa el Plateau en la mitad izquierda y abajo', () => {
    const { x, y } = latLngToPercent(14.669, -17.43, DAKAR_FRAME)
    expect(x).toBeCloseTo(37.4, 0)
    expect(y).toBeCloseTo(70.9, 0)
  })

  it('sitúa Almadies a la izquierda del Plateau (punta oeste)', () => {
    const almadies = latLngToPercent(14.744, -17.514, DAKAR_FRAME)
    const plateau = latLngToPercent(14.669, -17.43, DAKAR_FRAME)
    expect(almadies.x).toBeLessThan(plateau.x)
    expect(almadies.y).toBeLessThan(plateau.y) // más al norte = más arriba
  })

  it('sitúa Rufisque a la derecha del todo', () => {
    const { x } = latLngToPercent(14.715, -17.27, DAKAR_FRAME)
    expect(x).toBeGreaterThan(88)
    expect(x).toBeLessThan(100)
  })

  it('la longitud crece hacia la derecha y la latitud hacia arriba', () => {
    const oeste = latLngToPercent(14.70, -17.50, DAKAR_FRAME)
    const este = latLngToPercent(14.70, -17.30, DAKAR_FRAME)
    const sur = latLngToPercent(14.66, -17.40, DAKAR_FRAME)
    const norte = latLngToPercent(14.80, -17.40, DAKAR_FRAME)
    expect(este.x).toBeGreaterThan(oeste.x)
    expect(norte.y).toBeLessThan(sur.y)
  })

  it('redondea a 4 decimales (si no, React se queja al hidratar)', () => {
    const { x, y } = latLngToPercent(14.669, -17.43, DAKAR_FRAME)
    expect(String(x).split('.')[1]?.length ?? 0).toBeLessThanOrEqual(4)
    expect(String(y).split('.')[1]?.length ?? 0).toBeLessThanOrEqual(4)
  })
})

describe('isInsideFrame', () => {
  it('acepta un punto de Dakar', () => {
    expect(isInsideFrame(latLngToPercent(14.706, -17.472, DAKAR_FRAME))).toBe(true)
  })

  it('rechaza Mbour, que está fuera del encuadre', () => {
    expect(isInsideFrame(latLngToPercent(14.42, -16.96, DAKAR_FRAME))).toBe(false)
  })

  it('rechaza Thiès, que está al este del encuadre', () => {
    expect(isInsideFrame(latLngToPercent(14.791, -16.926, DAKAR_FRAME))).toBe(false)
  })
})

describe('REGION_FRAME', () => {
  it('sitúa Diass en el centro-derecha, sobre el aeropuerto', () => {
    const { x, y } = latLngToPercent(14.64, -17.07, REGION_FRAME)
    expect(x).toBeCloseTo(71.3, 0)
    expect(y).toBeCloseTo(44.5, 0)
  })

  it('recoge las zonas que no caben en la foto de Dakar', () => {
    for (const [lat, lng] of [[14.64, -17.07], [14.791, -16.926], [14.42, -16.96], [14.728, -17.183]]) {
      expect(isInsideFrame(latLngToPercent(lat!, lng!, REGION_FRAME))).toBe(true)
    }
  })

  it('sigue dejando fuera Touba, que se queda en un chip', () => {
    expect(isInsideFrame(latLngToPercent(14.85, -15.88, REGION_FRAME))).toBe(false)
  })

  it('coloca Thiès al noreste de Mbour', () => {
    const thies = latLngToPercent(14.791, -16.926, REGION_FRAME)
    const mbour = latLngToPercent(14.42, -16.96, REGION_FRAME)
    expect(thies.x).toBeGreaterThan(mbour.x)
    expect(thies.y).toBeLessThan(mbour.y)
  })
})

describe('bubbleRadius', () => {
  it('una sola incidencia da la burbuja mínima', () => {
    expect(bubbleRadius(1)).toBe(22)
  })

  it('crece con el número de avisos', () => {
    expect(bubbleRadius(5)).toBeGreaterThan(bubbleRadius(2))
  })

  it('nunca pasa del máximo, aunque haya muchos (Mermoz y Liberté se tocarían)', () => {
    expect(bubbleRadius(50)).toBe(44)
    expect(bubbleRadius(500)).toBe(44)
  })

  it('con cero devuelve cero: esa zona no se pinta', () => {
    expect(bubbleRadius(0)).toBe(0)
  })
})
