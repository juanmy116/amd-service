/**
 * Resumen del mantenimiento de cada máquina de un cliente (ficha `/admin/clients/[id]`).
 *
 * Solo existe la PRÓXIMA visita de cada máquina: la siguiente la crea `close_maintenance_visit`
 * al cerrar la anterior. Mismo criterio que `/admin/maintenance`, pero por máquina en vez de por
 * plan: próxima = la `scheduled_date` más temprana no hecha; última = la hecha más reciente.
 * En retard = alguna visita `en_retard` o una pendiente con fecha pasada: el cron que marca
 * `en_retard` corre de noche, y la agenda lateral ya cuenta los días de retraso por la fecha.
 */

export type MaintenanceVisitLite = {
  id: string
  scheduled_date: string
  status: string
  contract_machine_id: string
}

export type MachineMaintenance<V extends MaintenanceVisitLite = MaintenanceVisitLite> = {
  next: V | null
  lastDone: V | null
  overdue: boolean
}

export function summarizeMachineMaintenance<V extends MaintenanceVisitLite>(
  visits: V[],
  today: string, // YYYY-MM-DD
): Map<string, MachineMaintenance<V>> {
  const byLine = new Map<string, MachineMaintenance<V>>()
  for (const v of visits) {
    const s = byLine.get(v.contract_machine_id) ?? { next: null, lastDone: null, overdue: false }
    if (v.status === 'fait') {
      if (!s.lastDone || v.scheduled_date > s.lastDone.scheduled_date) s.lastDone = v
    } else if (!s.next || v.scheduled_date < s.next.scheduled_date) {
      s.next = v
    }
    if (v.status === 'en_retard' || (v.status !== 'fait' && v.scheduled_date < today)) s.overdue = true
    byLine.set(v.contract_machine_id, s)
  }
  return byLine
}

/**
 * Orden de las filas: lo que pide acción primero. En retard → con plan pero sin visita
 * programada (la máquina se quedó fuera) → próxima visita más cercana → sin plan.
 */
export function maintenanceRowRank(row: { hasPlan: boolean; summary: MachineMaintenance | null }): [number, string] {
  if (!row.hasPlan) return [3, '']
  if (row.summary?.overdue) return [0, row.summary.next?.scheduled_date ?? '']
  if (!row.summary?.next) return [1, '']
  return [2, row.summary.next.scheduled_date]
}
