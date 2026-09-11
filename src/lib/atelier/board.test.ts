import { describe, it, expect } from 'vitest'
import {
  LIVE_STATUSES,
  sortByOldestFirst,
  filterByStatus,
  filterByQuartier,
  countByQuartier,
  maintenanceWindow,
  groupMaintenancesByDay,
  waitingLabel,
  type BoardIncident,
  type BoardMaintenance,
} from './board'

const inc = (over: Partial<BoardIncident>): BoardIncident => ({
  id: 'i1',
  numeroIncident: 'SAV-2026-0001',
  title: 'Bourrage papier',
  description: null,
  status: 'nouveau',
  priority: 'normale',
  createdAt: '2026-09-10T08:00:00Z',
  clientName: 'Client',
  machineLabel: null,
  contactPhone: null,
  quartierCode: 'plateau',
  quartierLabel: 'Plateau',
  technicianId: null,
  technicianName: null,
  photoUrl: null,
  ...over,
})

const visit = (over: Partial<BoardMaintenance>): BoardMaintenance => ({
  id: 'v1',
  scheduledDate: '2026-09-11',
  status: 'planifié',
  clientName: 'Client',
  machineLabel: 'Ricoh MP C2051',
  quartierCode: 'plateau',
  quartierLabel: 'Plateau',
  technicianId: null,
  technicianName: null,
  ...over,
})

describe('sortByOldestFirst', () => {
  it('pone arriba la que más lleva esperando', () => {
    const result = sortByOldestFirst([
      inc({ id: 'nueva', createdAt: '2026-09-11T10:00:00Z' }),
      inc({ id: 'vieja', createdAt: '2026-09-01T10:00:00Z' }),
      inc({ id: 'media', createdAt: '2026-09-05T10:00:00Z' }),
    ])
    expect(result.map((i) => i.id)).toEqual(['vieja', 'media', 'nueva'])
  })

  it('no muta el array recibido', () => {
    const input = [inc({ id: 'b', createdAt: '2026-09-11T10:00:00Z' }), inc({ id: 'a', createdAt: '2026-09-01T10:00:00Z' })]
    sortByOldestFirst(input)
    expect(input.map((i) => i.id)).toEqual(['b', 'a'])
  })
})

describe('filterByStatus', () => {
  const lista = [
    inc({ id: 'n', status: 'nouveau' }),
    inc({ id: 'a', status: 'assigné' }),
    inc({ id: 'c', status: 'en_cours' }),
  ]

  it('sin filtro devuelve todas', () => {
    expect(filterByStatus(lista, null).map((i) => i.id)).toEqual(['n', 'a', 'c'])
  })

  it('filtra por un estado', () => {
    expect(filterByStatus(lista, 'en_cours').map((i) => i.id)).toEqual(['c'])
  })
})

describe('filterByQuartier', () => {
  const lista = [
    inc({ id: 'p', quartierCode: 'plateau' }),
    inc({ id: 'm', quartierCode: 'mermoz' }),
    inc({ id: 'sin', quartierCode: null }),
  ]

  it('sin zona seleccionada devuelve todas', () => {
    expect(filterByQuartier(lista, null)).toHaveLength(3)
  })

  it('filtra por zona', () => {
    expect(filterByQuartier(lista, 'plateau').map((i) => i.id)).toEqual(['p'])
  })

  it('la pseudo-zona «sin quartier» devuelve las que no tienen ubicación', () => {
    expect(filterByQuartier(lista, 'none').map((i) => i.id)).toEqual(['sin'])
  })
})

describe('countByQuartier', () => {
  it('cuenta avisos por zona', () => {
    const counts = countByQuartier([
      inc({ quartierCode: 'plateau' }),
      inc({ quartierCode: 'plateau' }),
      inc({ quartierCode: 'mermoz' }),
    ])
    expect(counts.get('plateau')).toBe(2)
    expect(counts.get('mermoz')).toBe(1)
  })

  it('agrupa bajo «none» las que no tienen zona', () => {
    const counts = countByQuartier([inc({ quartierCode: null }), inc({ quartierCode: null })])
    expect(counts.get('none')).toBe(2)
  })
})

describe('maintenanceWindow', () => {
  const hoy = new Date('2026-09-11T09:00:00Z')

  it('incluye las de hoy', () => {
    const { from, to } = maintenanceWindow(hoy)
    expect(from <= '2026-09-11').toBe(true)
    expect(to >= '2026-09-11').toBe(true)
  })

  it('llega hasta 7 días después', () => {
    expect(maintenanceWindow(hoy).to).toBe('2026-09-18')
  })

  it('mira 90 días atrás para recoger las atrasadas sin hacer', () => {
    expect(maintenanceWindow(hoy).from).toBe('2026-06-13')
  })
})

describe('groupMaintenancesByDay', () => {
  const hoy = '2026-09-11'

  it('separa las atrasadas en su propio bloque, arriba del todo', () => {
    const groups = groupMaintenancesByDay([
      visit({ id: 'manana', scheduledDate: '2026-09-12' }),
      visit({ id: 'tarde', scheduledDate: '2026-09-08' }),
      visit({ id: 'hoy', scheduledDate: hoy }),
    ], hoy)
    expect(groups[0].kind).toBe('retard')
    expect(groups[0].visits.map((v) => v.id)).toEqual(['tarde'])
    expect(groups[1].kind).toBe('today')
    expect(groups[2].date).toBe('2026-09-12')
  })

  it('una visita pasada YA HECHA no cuenta como atrasada', () => {
    const groups = groupMaintenancesByDay([
      visit({ id: 'hecha', scheduledDate: '2026-09-08', status: 'fait' }),
    ], hoy)
    expect(groups).toHaveLength(0)
  })

  it('sin visitas no devuelve bloques', () => {
    expect(groupMaintenancesByDay([], hoy)).toEqual([])
  })
})

describe('waitingLabel', () => {
  const ahora = new Date('2026-09-11T12:00:00Z')

  it('minutos cuando es reciente', () => {
    expect(waitingLabel('2026-09-11T11:20:00Z', ahora)).toEqual({ text: 'il y a 40 min', urgent: false })
  })

  it('horas dentro del mismo día', () => {
    expect(waitingLabel('2026-09-11T07:00:00Z', ahora)).toEqual({ text: 'il y a 5 h', urgent: false })
  })

  it('marca como urgente a partir de 24 h', () => {
    expect(waitingLabel('2026-09-09T12:00:00Z', ahora)).toEqual({ text: 'il y a 2 j', urgent: true })
  })

  it('justo en el límite de 24 h ya es urgente', () => {
    expect(waitingLabel('2026-09-10T12:00:00Z', ahora).urgent).toBe(true)
  })
})

describe('LIVE_STATUSES', () => {
  it('son las tres de trabajo vivo: ni résolu ni fermé', () => {
    expect(LIVE_STATUSES).toEqual(['nouveau', 'assigné', 'en_cours'])
  })
})
