import 'server-only'

import { createAdminClient } from './supabase/admin'
import { presenceFor, type LatLng, type Presence } from './geo'

/** Columnas de presencia comunes a `incidents` y `maintenance_visits`. */
export type PresenceColumns = {
  tech_lat: number | null
  tech_lng: number | null
  tech_accuracy_m: number | null
  tech_distance_m: number | null
  tech_position_at: string | null
  tech_presence: Presence
}

/**
 * Dónde estaba el técnico al resolver/cerrar y el veredicto contra la ubicación de la máquina.
 * El veredicto se calcula AQUÍ (servidor), nunca se acepta del navegador: el cliente solo manda
 * su posición (validada por `readPosition`). `numeroSerie = null` ⇒ la tarea no tiene máquina,
 * que para el veredicto es lo mismo que una máquina sin ubicación.
 *
 * Nunca lanza: un fallo al leer la máquina se registra y cuenta como máquina sin ubicación.
 */
export async function computePresence(
  numeroSerie: string | null,
  position: (LatLng & { accuracy: number }) | null,
): Promise<PresenceColumns> {
  let machine: LatLng | null = null
  if (position && numeroSerie) {
    const { data, error } = await createAdminClient()
      .from('machines')
      .select('lat, lng')
      .eq('numero_serie', numeroSerie)
      .maybeSingle()
    if (error) console.error('[computePresence.machine]', error)
    if (data?.lat != null && data.lng != null) machine = { lat: data.lat, lng: data.lng }
  }

  const { presence, distance } = presenceFor({ tech: position, machine })
  return {
    tech_lat: position?.lat ?? null,
    tech_lng: position?.lng ?? null,
    tech_accuracy_m: position?.accuracy ?? null,
    tech_distance_m: distance,
    tech_position_at: position ? new Date().toISOString() : null,
    tech_presence: presence,
  }
}
