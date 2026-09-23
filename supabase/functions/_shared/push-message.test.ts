import { describe, expect, it } from 'vitest'
import { buildPushMessage, type PushContext } from './push-message'

const base: PushContext = {
  kind: 'assigned', entityType: 'incident', entityId: 'inc-1',
  clientName: 'Axa', quartier: 'Plateau',
  incidentTitle: 'Bourrage papier', incidentNumero: 'SAV-2026-0042', priority: 'normale',
  scheduledDate: null, machineSerie: 'V9314505033',
}

describe('buildPushMessage', () => {
  it('avería asignada: cliente + barrio + problema, abre la avería', () => {
    expect(buildPushMessage(base)).toEqual({
      title: 'Nouvelle panne — Axa, Plateau',
      body: 'Bourrage papier · SAV-2026-0042',
      url: '/tech/incidents/inc-1',
      tag: 'incident-inc-1',
    })
  })

  it('avería urgente: lo dice en el título', () => {
    expect(buildPushMessage({ ...base, priority: 'urgente' }).title).toBe('Urgent · Nouvelle panne — Axa, Plateau')
  })

  it('sin barrio ni cliente: no deja comas colgando', () => {
    expect(buildPushMessage({ ...base, quartier: null }).title).toBe('Nouvelle panne — Axa')
    expect(buildPushMessage({ ...base, clientName: null, quartier: null }).title).toBe('Nouvelle panne — Client inconnu')
  })

  it('mantenimiento asignado: fecha en formato francés, abre la visita en su máquina', () => {
    expect(buildPushMessage({
      ...base, entityType: 'visit', entityId: 'vis-1', scheduledDate: '2026-09-30',
      incidentTitle: null, incidentNumero: null, priority: null,
    })).toEqual({
      title: 'Maintenance assignée — Axa, Plateau',
      body: 'Prévue le 30/09/2026',
      url: '/tech/scan/V9314505033/maintenance/vis-1',
      tag: 'visit-vis-1',
    })
  })

  it('mantenimiento sin serie conocida: abre el planning', () => {
    expect(buildPushMessage({ ...base, entityType: 'visit', entityId: 'vis-1', machineSerie: null, scheduledDate: '2026-09-30' }).url)
      .toBe('/tech/planning')
  })

  it('tarea retirada (avería y mantenimiento): abre el inicio', () => {
    expect(buildPushMessage({ ...base, kind: 'unassigned' })).toEqual({
      title: 'Tâche retirée — Axa',
      body: 'La panne SAV-2026-0042 a été réassignée.',
      url: '/tech',
      tag: 'incident-inc-1',
    })
    expect(buildPushMessage({ ...base, kind: 'unassigned', entityType: 'visit', entityId: 'vis-1', scheduledDate: '2026-09-30' }).body)
      .toBe('La maintenance du 30/09/2026 a été réassignée.')
  })

  it('el serie se codifica en la URL', () => {
    expect(buildPushMessage({ ...base, entityType: 'visit', entityId: 'v', machineSerie: 'A B/1', scheduledDate: '2026-01-02' }).url)
      .toBe('/tech/scan/A%20B%2F1/maintenance/v')
  })
})
