import 'server-only'

import { createAdminClient } from './supabase/admin'
import { getQuartiers } from './quartiers.server'
import { resolveQuartierCode } from './quartiers'
import type { LatLng } from './geo'

/**
 * Coordenadas de un conjunto de máquinas, para ordenar tareas del técnico por cercanía
 * («Plus proche», Fase 3 §Task 8). Para cada máquina:
 *   1. sus propias coordenadas si las tiene (`machines.lat/lng`, primer escaneo o admin);
 *   2. si no, el centro de su barrio EFECTIVO (`resolveQuartierCode`: el de la máquina, o si
 *      no el del cliente de su línea abierta);
 *   3. si no hay ninguno, `null` (la tarea se queda al final de «Plus proche»).
 *
 * Usa el cliente admin porque el técnico no ve por RLS todos los clientes de las máquinas de
 * su lista (solo los suyos propios) — este helper solo devuelve coordenadas, ningún dato
 * personal del cliente sale de aquí.
 *
 * Dos consultas + el catálogo de barrios, nunca una por máquina.
 */
export async function coordsForMachines(series: string[]): Promise<Map<string, LatLng | null>> {
  const result = new Map<string, LatLng | null>()
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

  const quartierCoords = new Map(quartiers.map((q) => [q.code, { lat: q.lat, lng: q.lng }]))
  const clientQuartierBySerie = new Map(
    (lines ?? []).map((line) => [line.machine_id, line.contracts?.clients?.quartier_code ?? null])
  )

  for (const serie of uniqueSeries) {
    const machine = (machines ?? []).find((m) => m.numero_serie === serie) ?? null
    if (machine?.lat != null && machine?.lng != null) {
      result.set(serie, { lat: machine.lat, lng: machine.lng })
      continue
    }
    const effectiveCode = resolveQuartierCode(machine?.quartier_code ?? null, clientQuartierBySerie.get(serie) ?? null)
    result.set(serie, effectiveCode ? quartierCoords.get(effectiveCode) ?? null : null)
  }

  return result
}
