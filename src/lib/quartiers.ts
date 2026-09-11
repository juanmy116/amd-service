/**
 * Catálogo de barrios (tabla `quartiers`) y resolución de la ubicación de un aviso.
 *
 * La ubicación de una incidencia o de una visita es la de SU MÁQUINA si la máquina tiene
 * quartier propio (sede distinta a la del cliente), y si no la del CLIENTE. Si no hay
 * ninguno, el aviso aparece en el kiosko bajo «Sans quartier» y no se pinta en el mapa.
 */

export type Quartier = {
  code: string
  label: string
  ville: string
  lat: number
  lng: number
  sortOrder: number
  /** Una zona desactivada ya no se ofrece para asignar, pero las que la tienen la conservan. */
  active: boolean
}

/** Fila tal cual viene de la tabla `quartiers` (snake_case). */
export type QuartierRow = {
  code: string
  label: string
  ville: string
  lat: number
  lng: number
  sort_order: number
  active: boolean
}

export function toQuartiers(rows: QuartierRow[] | null): Quartier[] {
  return (rows ?? []).map((r) => ({
    code: r.code,
    label: r.label,
    ville: r.ville,
    lat: r.lat,
    lng: r.lng,
    sortOrder: r.sort_order,
    active: r.active,
  }))
}

export type QuartierGroup = {
  ville: string
  quartiers: Quartier[]
}

export function resolveQuartierCode(
  machineQuartierCode: string | null | undefined,
  clientQuartierCode: string | null | undefined
): string | null {
  return machineQuartierCode ?? clientQuartierCode ?? null
}

/**
 * Opciones que debe ofrecer el desplegable: las zonas activas MÁS la que el registro tiene
 * asignada aunque esté desactivada.
 *
 * Sin esto, editar un cliente cuya zona se desactivó borraría su `quartier_code` en silencio:
 * el `<select>` no tendría esa opción, enviaría '' y el UPDATE guardaría null.
 */
export function selectableQuartiers(all: Quartier[], currentCode: string | null | undefined): Quartier[] {
  const active = all.filter((q) => q.active)
  if (!currentCode || active.some((q) => q.code === currentCode)) return active
  const current = all.find((q) => q.code === currentCode)
  return current ? [...active, current] : active
}

/** Agrupa por ciudad para pintar los `<optgroup>` del desplegable, respetando `sortOrder`. */
export function groupByVille(quartiers: Quartier[]): QuartierGroup[] {
  const byVille = new Map<string, Quartier[]>()
  for (const q of [...quartiers].sort((a, b) => a.sortOrder - b.sortOrder)) {
    const list = byVille.get(q.ville)
    if (list) list.push(q)
    else byVille.set(q.ville, [q])
  }
  return [...byVille.entries()].map(([ville, list]) => ({ ville, quartiers: list }))
}
