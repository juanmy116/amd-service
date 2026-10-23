import { describe, it, expect } from 'vitest'
import { summarizeMachineMaintenance, maintenanceRowRank, type MaintenanceVisitLite } from '@/lib/maintenanceSummary'

const v = (id: string, line: string, date: string, status: string): MaintenanceVisitLite =>
  ({ id, contract_machine_id: line, scheduled_date: date, status })

const TODAY = '2026-10-23'

describe('summarizeMachineMaintenance', () => {
  it('próxima = la no hecha más temprana; última = la hecha más reciente, por máquina', () => {
    const s = summarizeMachineMaintenance([
      v('a', 'L1', '2026-07-01', 'fait'),
      v('b', 'L1', '2026-10-01', 'fait'),
      v('c', 'L1', '2027-01-01', 'planifié'),
      v('d', 'L2', '2026-12-01', 'planifié'),
    ], TODAY)
    expect(s.get('L1')?.next?.id).toBe('c')
    expect(s.get('L1')?.lastDone?.id).toBe('b')
    expect(s.get('L1')?.overdue).toBe(false)
    expect(s.get('L2')?.next?.id).toBe('d')
    expect(s.get('L2')?.lastDone).toBeNull()
  })

  it('una visita en_retard marca la máquina en retard y cuenta como próxima', () => {
    const s = summarizeMachineMaintenance([v('a', 'L1', '2026-11-01', 'en_retard')], TODAY)
    expect(s.get('L1')).toEqual({ next: expect.objectContaining({ id: 'a' }), lastDone: null, overdue: true })
  })

  it('máquina sin visitas: no aparece', () => {
    expect(summarizeMachineMaintenance([], TODAY).size).toBe(0)
  })

  it('una visita planifiée con fecha pasada también está en retard (el cron aún no la marcó)', () => {
    const s = summarizeMachineMaintenance([v('a', 'L1', '2026-10-22', 'planifié')], TODAY)
    expect(s.get('L1')?.overdue).toBe(true)
    const hoy = summarizeMachineMaintenance([v('b', 'L1', TODAY, 'planifié')], TODAY)
    expect(hoy.get('L1')?.overdue).toBe(false)
  })

  it('una visita hecha con fecha pasada no cuenta como retard', () => {
    const s = summarizeMachineMaintenance([v('a', 'L1', '2026-01-01', 'fait')], TODAY)
    expect(s.get('L1')?.overdue).toBe(false)
  })
})

describe('maintenanceRowRank', () => {
  const summary = (next: string | null, overdue = false) => ({
    next: next ? v('x', 'L', next, overdue ? 'en_retard' : 'planifié') : null,
    lastDone: null,
    overdue,
  })

  it('ordena: en retard → sin visita → próxima más cercana → sin plan', () => {
    const rows = [
      { name: 'sin plan', hasPlan: false, summary: null },
      { name: 'diciembre', hasPlan: true, summary: summary('2026-12-01') },
      { name: 'sin visita', hasPlan: true, summary: null },
      { name: 'noviembre', hasPlan: true, summary: summary('2026-11-01') },
      { name: 'retard', hasPlan: true, summary: summary('2026-09-01', true) },
    ]
    const sorted = [...rows].sort((a, b) => {
      const [ra, da] = maintenanceRowRank(a)
      const [rb, db] = maintenanceRowRank(b)
      return ra - rb || da.localeCompare(db)
    })
    expect(sorted.map((r) => r.name)).toEqual(['retard', 'sin visita', 'noviembre', 'diciembre', 'sin plan'])
  })
})
