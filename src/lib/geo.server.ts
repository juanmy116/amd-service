import 'server-only'

import { createAdminClient } from './supabase/admin'
import { getQuartiers } from './quartiers.server'
import { resolveQuartierCode } from './quartiers'
import { destinationText, type LatLng, type TaskCoords } from './geo'

/**
 * Coordenadas de un conjunto de máquinas, para ordenar tareas del técnico por cercanía
 * («Plus proche», Fase 3 §Task 8). Para cada máquina:
 *   1. sus propias coordenadas si las tiene (`machines.lat/lng`, primer escaneo o admin);
 *   2. si no, el centro de su barrio EFECTIVO (`resolveQuartierCode`: el de la máquina, o si
 *      no el del cliente de su línea abierta), marcado `approx` — la tarjeta lo dice;
 *   3. si no hay ninguno, `null` (la tarea se queda al final de «Plus proche»).
 *
 * Usa el cliente admin porque el técnico no ve por RLS todos los clientes de las máquinas de
 * su lista (solo los suyos propios) — este helper solo devuelve coordenadas, ningún dato
 * personal del cliente sale de aquí.
 *
 * Dos consultas + el catálogo de barrios, nunca una por máquina.
 */
export async function coordsForMachines(series: string[]): Promise<Map<string, TaskCoords | null>> {
  const result = new Map<string, TaskCoords | null>()
  const uniqueSeries = [...new Set(series.filter(Boolean))]
  if (uniqueSeries.length === 0) return result

  const admin = createAdminClient()

  const [{ data: machines, error: machinesError }, { data: lines, error: linesError }, quartiers] =
    await Promise.all([
      admin.from('machines').select('numero_serie, lat, lng, quartier_code').in('numero_serie', uniqueSeries),
      admin
        .from('contract_machines')
        .select('machine_id, contracts(clients(quartier_code))')
        .in('machine_id', uniqueSeries)
        .is('date_fin', null),
      getQuartiers().catch((error) => {
        console.error('[coordsForMachines.quartiers]', error)
        return []
      }),
    ])
  if (machinesError) console.error('[coordsForMachines.machines]', machinesError)
  if (linesError) console.error('[coordsForMachines.lines]', linesError)

  const machineBySerie = new Map((machines ?? []).map((m) => [m.numero_serie, m]))
  const quartierCoords = new Map(quartiers.map((q) => [q.code, { lat: q.lat, lng: q.lng }]))
  const clientQuartierBySerie = new Map(
    (lines ?? []).map((line) => [line.machine_id, line.contracts?.clients?.quartier_code ?? null])
  )

  for (const serie of uniqueSeries) {
    const machine = machineBySerie.get(serie) ?? null
    if (machine?.lat != null && machine?.lng != null) {
      result.set(serie, { coords: { lat: machine.lat, lng: machine.lng }, approx: false })
      continue
    }
    const effectiveCode = resolveQuartierCode(machine?.quartier_code ?? null, clientQuartierBySerie.get(serie) ?? null)
    const centroid = effectiveCode ? quartierCoords.get(effectiveCode) : undefined
    result.set(serie, centroid ? { coords: centroid, approx: true } : null)
  }

  return result
}

/**
 * Destino del botón «Itinéraire» (fichas de avería y de escaneo del técnico): las coordenadas
 * de la máquina si las tiene; si no, la dirección del cliente en texto (adresse + barrio
 * efectivo + ville, ver `destinationText`). El catálogo de barrios solo se lee en ese caso.
 */
export async function itineraryDestination(
  machine: { lat: number | null; lng: number | null; quartier_code: string | null } | null,
  client: { adresse: string | null; ville: string | null; quartier_code: string | null } | null,
): Promise<{ coords: LatLng | null; text: string | null }> {
  if (machine?.lat != null && machine.lng != null) {
    return { coords: { lat: machine.lat, lng: machine.lng }, text: null }
  }
  const quartierCode = resolveQuartierCode(machine?.quartier_code ?? null, client?.quartier_code ?? null)
  const quartier = quartierCode
    ? (await getQuartiers()).find((q) => q.code === quartierCode)?.label ?? null
    : null
  return {
    coords: null,
    text: destinationText({ adresse: client?.adresse ?? null, quartier, ville: client?.ville ?? null }),
  }
}
