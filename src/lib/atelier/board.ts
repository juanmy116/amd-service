/**
 * Lógica del tablero del kiosko `/atelier`: qué se muestra, en qué orden y cómo se agrupa.
 *
 * Todo aquí es puro (entra un array, sale otro) para poder probarlo sin base de datos ni
 * navegador. Las consultas viven en `src/app/atelier/data.ts` y los componentes solo pintan.
 */

/** Estados de trabajo vivo. Las resueltas y cerradas no ocupan sitio en la columna. */
export const LIVE_STATUSES = ['nouveau', 'assigné', 'en_cours'] as const
export type LiveStatus = (typeof LIVE_STATUSES)[number]

/** Pseudo-zona para los avisos que no se pueden situar en el mapa. */
export const NO_QUARTIER = 'none'

export type BoardIncident = {
  id: string
  numeroIncident: string
  title: string
  description: string | null
  status: string
  priority: string
  createdAt: string
  clientName: string | null
  machineLabel: string | null
  contactPhone: string | null
  quartierCode: string | null
  quartierLabel: string | null
  technicianId: string | null
  technicianName: string | null
  photoUrl: string | null
}

export type BoardMaintenance = {
  id: string
  scheduledDate: string
  status: string
  clientName: string | null
  machineLabel: string | null
  quartierCode: string | null
  quartierLabel: string | null
  technicianId: string | null
  technicianName: string | null
}

// ─── Columna de pannes ────────────────────────────────────────────────────────

/** Cola de trabajo: primero la que más lleva esperando. */
export function sortByOldestFirst(incidents: BoardIncident[]): BoardIncident[] {
  return [...incidents].sort(
    (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
  )
}

export function filterByStatus(incidents: BoardIncident[], status: string | null): BoardIncident[] {
  if (!status) return incidents
  return incidents.filter((i) => i.status === status)
}

/**
 * Filtra por una o varias zonas. Acepta lista porque un chip de ciudad agrupa todas las zonas
 * de esa ciudad: si Thiès llegara a tener dos barrios, el chip debe enseñar los avisos de ambos.
 */
export function filterByQuartier<T extends { quartierCode: string | null }>(
  items: T[],
  codes: string[] | null
): T[] {
  if (!codes || codes.length === 0) return items
  const wanted = new Set(codes)
  return items.filter((i) => wanted.has(i.quartierCode ?? NO_QUARTIER))
}

/** Cuántos avisos hay por zona, para el tamaño de las burbujas y los chips. */
export function countByQuartier(items: { quartierCode: string | null }[]): Map<string, number> {
  const counts = new Map<string, number>()
  for (const item of items) {
    const key = item.quartierCode ?? NO_QUARTIER
    counts.set(key, (counts.get(key) ?? 0) + 1)
  }
  return counts
}

// ─── Columna de maintenances ──────────────────────────────────────────────────

/**
 * Una visita pasada solo es «atrasada» si además sigue sin hacerse.
 * Valores reales de la columna (CHECK en BD): 'planifié' · 'fait' · 'en_retard'.
 */
const DONE_STATUSES = new Set(['fait'])

/**
 * ¿Sigue pendiente esta visita? Lo usan la columna (para agrupar) y el mapa (para contar).
 * Sin esto el mapa pintaba burbujas con visitas ya hechas de los últimos 90 días: al pulsarlas,
 * las columnas salían vacías.
 */
export function isPendingMaintenance(visit: BoardMaintenance): boolean {
  return !DONE_STATUSES.has(visit.status)
}

function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10)
}

function shiftDays(d: Date, days: number): Date {
  const copy = new Date(d)
  copy.setUTCDate(copy.getUTCDate() + days)
  return copy
}

/**
 * Ventana que se consulta: 7 días hacia delante y 90 hacia atrás.
 *
 * Los 90 días de atrás son para recoger las visitas atrasadas sin hacer, no para mostrar
 * historial: `groupMaintenancesByDay` descarta las que ya están hechas. El tope
 * evita arrastrar visitas olvidadas de hace un año, que no dicen nada al despachador.
 */
export function maintenanceWindow(today: Date): { from: string; to: string } {
  return { from: isoDate(shiftDays(today, -90)), to: isoDate(shiftDays(today, 7)) }
}

export type MaintenanceGroup = {
  kind: 'retard' | 'today' | 'day'
  /** Fecha del bloque; el de atrasadas no tiene una sola. */
  date: string | null
  visits: BoardMaintenance[]
}

/**
 * Agrupa las visitas en bloques para la columna: primero las atrasadas (en rojo),
 * luego hoy, y después un bloque por día.
 */
export function groupMaintenancesByDay(
  visits: BoardMaintenance[],
  today: string
): MaintenanceGroup[] {
  const pending = visits.filter(isPendingMaintenance)

  const late = pending
    .filter((v) => v.scheduledDate < today)
    .sort((a, b) => a.scheduledDate.localeCompare(b.scheduledDate))

  const upcoming = pending.filter((v) => v.scheduledDate >= today)

  const byDate = new Map<string, BoardMaintenance[]>()
  for (const v of upcoming) {
    const list = byDate.get(v.scheduledDate)
    if (list) list.push(v)
    else byDate.set(v.scheduledDate, [v])
  }

  const groups: MaintenanceGroup[] = []
  if (late.length > 0) groups.push({ kind: 'retard', date: null, visits: late })

  for (const date of [...byDate.keys()].sort()) {
    groups.push({
      kind: date === today ? 'today' : 'day',
      date,
      visits: byDate.get(date)!,
    })
  }

  return groups
}

// ─── Antigüedad ───────────────────────────────────────────────────────────────

const MINUTE = 60_000
const HOUR = 60 * MINUTE
const DAY = 24 * HOUR

/**
 * Cuánto lleva esperando una incidencia, en francés y abreviado para que quepa en la tarjeta.
 * A partir de 24 h se marca como urgente (la tarjeta lo pinta en rojo).
 */
export function waitingLabel(createdAt: string, now: Date): { text: string; urgent: boolean } {
  const elapsed = now.getTime() - new Date(createdAt).getTime()
  const urgent = elapsed >= DAY

  if (elapsed >= DAY) return { text: `il y a ${Math.floor(elapsed / DAY)} j`, urgent }
  if (elapsed >= HOUR) return { text: `il y a ${Math.floor(elapsed / HOUR)} h`, urgent }
  return { text: `il y a ${Math.max(0, Math.floor(elapsed / MINUTE))} min`, urgent }
}
