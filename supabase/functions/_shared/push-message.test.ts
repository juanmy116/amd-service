import { describe, expect, it } from 'vitest'
import { buildPushMessage, type PushContext } from './push-message'

const base: PushContext = {
  kind: 'assigned', entityType: 'incident', entityId: 'inc-1',
  clientName: 'Axa', quartier: 'Plateau',
  incidentTitle: 'Bourrage papier', incidentNumero: 'SAV-2026-0042', priority: 'normale',
  scheduledDate: null,
}

describe('buildPushMessage', () => {
  it('avería asignada: cliente + barrio + problema, abre la avería', () => {
    expect(buildPushMessage(base)).toEqual({
      title: 'Nouvelle panne — Axa, Plateau',
      body: 'Bourrage papier · SAV-2026-0042',
      url: '/tech/incidents/inc-1',
      tag: 'incident-inc-1',
      kind: 'assigned',
    })
  })

  it('avería urgente: lo dice en el título', () => {
    expect(buildPushMessage({ ...base, priority: 'urgente' }).title).toBe('Urgent · Nouvelle panne — Axa, Plateau')
  })

  it('sin barrio ni cliente: no deja comas colgando', () => {
    expect(buildPushMessage({ ...base, quartier: null }).title).toBe('Nouvelle panne — Axa')
    expect(buildPushMessage({ ...base, clientName: null, quartier: null }).title).toBe('Nouvelle panne — Client inconnu')
  })

  it('mantenimiento asignado: fecha en formato francés, abre el planning (nunca el cierre de la visita)', () => {
    expect(buildPushMessage({
      ...base, entityType: 'visit', entityId: 'vis-1', scheduledDate: '2026-09-30',
      incidentTitle: null, incidentNumero: null, priority: null,
    })).toEqual({
      title: 'Maintenance assignée — Axa, Plateau',
      body: 'Prévue le 30/09/2026',
      url: '/tech/planning',
      tag: 'visit-vis-1',
      kind: 'assigned',
    })
  })

  it('tarea retirada (avería y mantenimiento): abre el inicio', () => {
    expect(buildPushMessage({ ...base, kind: 'unassigned' })).toEqual({
      title: 'Tâche retirée — Axa',
      body: 'La panne SAV-2026-0042 a été réassignée.',
      url: '/tech',
      tag: 'incident-inc-1',
      kind: 'unassigned',
    })
    expect(buildPushMessage({ ...base, kind: 'unassigned', entityType: 'visit', entityId: 'vis-1', scheduledDate: '2026-09-30' }).body)
      .toBe('La maintenance du 30/09/2026 a été réassignée.')
  })

  it('título largo: se trunca a 120 caracteres + …', () => {
    const long = 'A'.repeat(150)
    const body = buildPushMessage({ ...base, incidentTitle: long, incidentNumero: null }).body
    expect(body).toBe(`${'A'.repeat(120)}…`)
    expect(body.length).toBe(121)
  })

  it('barrio con espacios de sobra: se recorta', () => {
    expect(buildPushMessage({ ...base, quartier: '  Plateau  ' }).title).toBe('Nouvelle panne — Axa, Plateau')
  })
})
