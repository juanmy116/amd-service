import { describe, it, expect } from 'vitest'
import { CLOSE_SCAN_WINDOW_MINUTES, SCAN_DEDUPE_SECONDS, closeGate } from './scanGate'

const NOW = new Date('2026-10-21T12:00:00Z')
const minAgo = (m: number) => new Date(NOW.getTime() - m * 60_000)

describe('constantes', () => {
  it('ventana de cierre 60 min y dedupe 60 s', () => {
    expect(CLOSE_SCAN_WINDOW_MINUTES).toBe(60)
    expect(SCAN_DEDUPE_SECONDS).toBe(60)
  })
})

describe('closeGate', () => {
  it('sin escaneos no se puede cerrar', () => {
    expect(closeGate([], null, NOW)).toEqual({ canClose: false, closeUntil: null })
  })

  it('un solo escaneo no basta', () => {
    expect(closeGate([minAgo(5)], null, NOW).canClose).toBe(false)
  })

  it('dos escaneos, el último hace 10 min: se puede cerrar hasta último + 60 min', () => {
    const last = minAgo(10)
    const r = closeGate([minAgo(90), last], null, NOW)
    expect(r.canClose).toBe(true)
    expect(r.closeUntil).toEqual(new Date(last.getTime() + 60 * 60_000))
  })

  it('dos escaneos, el último hace 61 min: la ventana caducó', () => {
    expect(closeGate([minAgo(120), minAgo(61)], null, NOW).canClose).toBe(false)
  })

  it('dos escaneos anteriores a resolvedAt (reabierta): no cuentan', () => {
    expect(closeGate([minAgo(50), minAgo(40)], minAgo(30), NOW).canClose).toBe(false)
  })

  it('uno antes y uno después de resolvedAt: no basta; dos después: sí', () => {
    expect(closeGate([minAgo(50), minAgo(10)], minAgo(30), NOW).canClose).toBe(false)
    expect(closeGate([minAgo(50), minAgo(20), minAgo(10)], minAgo(30), NOW).canClose).toBe(true)
  })

  it('escaneos desordenados: la ventana usa el más reciente', () => {
    const r = closeGate([minAgo(5), minAgo(100), minAgo(70)], null, NOW)
    expect(r.canClose).toBe(true)
    expect(r.closeUntil).toEqual(new Date(minAgo(5).getTime() + 60 * 60_000))
  })
})
