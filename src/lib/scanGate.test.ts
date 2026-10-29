import { describe, it, expect } from 'vitest'
import {
  CLOSE_SCAN_WINDOW_MINUTES, SCAN_DEDUPE_SECONDS, closeGate, requiresScan,
  sameMachine, interventionStarted, closeAction, scanDestination,
} from './scanGate'

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
    expect(closeGate([], null, NOW)).toMatchObject({ canClose: false, closeUntil: null })
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

  it('último escaneo hace exactamente 60 min: todavía se puede cerrar', () => {
    expect(closeGate([minAgo(120), minAgo(60)], null, NOW).canClose).toBe(true)
  })

  it('último escaneo hace 60 min + 1 ms: la ventana caducó', () => {
    const last = new Date(minAgo(60).getTime() - 1)
    expect(closeGate([minAgo(120), last], null, NOW).canClose).toBe(false)
  })

  it('dos escaneos separados por 1 s: doble disparo del lector, no cuenta como empezar + terminar', () => {
    const a = minAgo(10)
    expect(closeGate([a, new Date(a.getTime() + 1000)], null, NOW).canClose).toBe(false)
  })

  it('dos escaneos separados por exactamente 60 s: se puede cerrar', () => {
    const a = minAgo(10)
    expect(closeGate([a, new Date(a.getTime() + SCAN_DEDUPE_SECONDS * 1000)], null, NOW).canClose).toBe(true)
  })

  it('la separación se mide dentro del ciclo actual, no con escaneos anteriores a resolvedAt', () => {
    const a = minAgo(10)
    const pair = [a, new Date(a.getTime() + 1000)]
    expect(closeGate([minAgo(50), ...pair], minAgo(30), NOW).canClose).toBe(false)
  })
})

describe('closeGate — por qué no se puede cerrar y cuándo', () => {
  it('sin escaneos: no_scans, sin horas', () => {
    expect(closeGate([], null, NOW)).toEqual({
      canClose: false, closeUntil: null, reason: 'no_scans', firstScanAt: null, nextScanAfter: null,
    })
  })

  it('un escaneo: one_scan, el siguiente vale desde ese escaneo + 60 s', () => {
    const first = minAgo(5)
    expect(closeGate([first], null, NOW)).toEqual({
      canClose: false, closeUntil: null, reason: 'one_scan',
      firstScanAt: first, nextScanAfter: new Date(first.getTime() + SCAN_DEDUPE_SECONDS * 1000),
    })
  })

  it('dos escaneos a 1 s: too_close, el siguiente vale desde el ÚLTIMO + 60 s (el rebote se mide contra el último)', () => {
    const first = minAgo(5)
    const last = new Date(first.getTime() + 1000)
    expect(closeGate([last, first], null, NOW)).toEqual({
      canClose: false, closeUntil: null, reason: 'too_close',
      firstScanAt: first, nextScanAfter: new Date(last.getTime() + SCAN_DEDUPE_SECONDS * 1000),
    })
  })

  it('ventana vencida: expired, conserva closeUntil para saber cuándo venció', () => {
    const last = minAgo(61)
    expect(closeGate([minAgo(120), last], null, NOW)).toEqual({
      canClose: false, closeUntil: new Date(last.getTime() + 60 * 60_000), reason: 'expired',
      firstScanAt: minAgo(120), nextScanAfter: null,
    })
  })

  it('se puede cerrar: reason null', () => {
    const r = closeGate([minAgo(30), minAgo(5)], null, NOW)
    expect(r).toMatchObject({ canClose: true, reason: null, firstScanAt: minAgo(30), nextScanAfter: null })
  })

  it('reabierta: los escaneos anteriores a resolvedAt no cuentan ni para el motivo', () => {
    expect(closeGate([minAgo(50), minAgo(40)], minAgo(30), NOW).reason).toBe('no_scans')
    expect(closeGate([minAgo(50), minAgo(10)], minAgo(30), NOW)).toMatchObject({ reason: 'one_scan', firstScanAt: minAgo(10) })
  })
})

describe('requiresScan', () => {
  it('el técnico de campo debe escanear', () => {
    expect(requiresScan({ role: 'technician', is_dispatcher: false })).toBe(true)
  })
  it('el técnico con is_dispatcher null (sin marcar) debe escanear', () => {
    expect(requiresScan({ role: 'technician', is_dispatcher: null })).toBe(true)
  })
  it('el Atelier (técnico dispatcher) queda excluido', () => {
    expect(requiresScan({ role: 'technician', is_dispatcher: true })).toBe(false)
  })
  it('el admin queda excluido', () => {
    expect(requiresScan({ role: 'admin', is_dispatcher: false })).toBe(false)
  })
})

describe('sameMachine', () => {
  it('ignora mayúsculas y espacios', () => {
    expect(sameMachine('ab-12 ', 'AB-12')).toBe(true)
  })
  it('series distintas no coinciden', () => {
    expect(sameMachine('AB-12', 'AB-13')).toBe(false)
  })
  it('sin serie esperada no coincide', () => {
    expect(sameMachine('AB-12', null)).toBe(false)
  })
  it('vacío contra vacío no coincide', () => {
    expect(sameMachine('', '')).toBe(false)
  })
})

describe('interventionStarted', () => {
  const at = new Date('2026-10-21T11:00:00Z')
  it('en curso con escaneo: empezada', () => {
    expect(interventionStarted('en_cours', at)).toBe(true)
  })
  it('en curso sin escaneo (la oficina la puso): no empezada', () => {
    expect(interventionStarted('en_cours', null)).toBe(false)
  })
  it('asignada con escaneo de antes de asignarla: no empezada', () => {
    expect(interventionStarted('assigné', at)).toBe(false)
  })
  it('nueva con escaneo: no empezada', () => {
    expect(interventionStarted('nouveau', at)).toBe(false)
  })
  it('resuelta cuenta como empezada aunque no haya escaneo', () => {
    expect(interventionStarted('résolu', null)).toBe(true)
  })
})

describe('closeAction', () => {
  it('2º escaneo vigente: confirmar hasta último + 60 min', () => {
    const last = minAgo(10)
    expect(closeAction(closeGate([minAgo(30), last], null, NOW), NOW)).toEqual({
      kind: 'confirm', until: new Date(last.getTime() + 60 * 60_000),
    })
  })
  it('un escaneo hace 20 s: esperar hasta escaneo + 60 s', () => {
    const scan = new Date(NOW.getTime() - 20_000)
    expect(closeAction(closeGate([scan], null, NOW), NOW)).toEqual({
      kind: 'wait', from: new Date(scan.getTime() + 60_000),
    })
  })
  it('un escaneo hace 5 min: escanear', () => {
    expect(closeAction(closeGate([minAgo(5)], null, NOW), NOW)).toEqual({ kind: 'scan' })
  })
  it('ventana vencida: escanear', () => {
    expect(closeAction(closeGate([minAgo(120), minAgo(61)], null, NOW), NOW)).toEqual({ kind: 'scan' })
  })
  it('sin escaneos: escanear', () => {
    expect(closeAction(closeGate([], null, NOW), NOW)).toEqual({ kind: 'scan' })
  })
})

describe('scanDestination', () => {
  const base = { serie: 'A B', recorded: false, myIncidentIds: ['x'], visitDue: false }
  it('escaneo no grabado: pantalla del escáner con aviso de fallo', () => {
    expect(scanDestination(base)).toBe('/tech/scan/A%20B?scan=echec')
  })
  it('grabado y una sola avería mía: directo a su ficha', () => {
    expect(scanDestination({ ...base, recorded: true })).toBe('/tech/incidents/x?scan=1')
  })
  it('varias averías mías: pantalla del escáner', () => {
    expect(scanDestination({ ...base, recorded: true, myIncidentIds: ['x', 'y'] })).toBe('/tech/scan/A%20B')
  })
  it('una avería pero visita pendiente: pantalla del escáner', () => {
    expect(scanDestination({ ...base, recorded: true, visitDue: true })).toBe('/tech/scan/A%20B')
  })
  it('ninguna avería mía: pantalla del escáner', () => {
    expect(scanDestination({ ...base, recorded: true, myIncidentIds: [] })).toBe('/tech/scan/A%20B')
  })
})
