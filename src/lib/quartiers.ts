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
}

/** Fila tal cual viene de la tabla `quartiers` (snake_case). */
export type QuartierRow = {
  code: string
  label: string
  ville: string
  lat: number
  lng: number
  sort_order: number
}

export function toQuartiers(rows: QuartierRow[] | null): Quartier[] {
  return (rows ?? []).map((r) => ({
    code: r.code,
    label: r.label,
    ville: r.ville,
    lat: r.lat,
    lng: r.lng,
    sortOrder: r.sort_order,
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
