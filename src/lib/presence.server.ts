import 'server-only'

import { createAdminClient } from './supabase/admin'
import type { TablesInsert } from './supabase/types'
import { presenceFor, type LatLng } from './geo'

/**
 * Fila de `field_presence`: dónde estaba el técnico al resolver/cerrar y el veredicto contra la
 * ubicación de la máquina. El veredicto se calcula AQUÍ (servidor), nunca se acepta del
 * navegador: el cliente solo manda su posición (validada por `readPosition`). `numeroSerie =
 * null` ⇒ la tarea no tiene máquina, que para el veredicto es lo mismo que una máquina sin
 * ubicación.
 *
 * La fila la escribe quien llama, con el cliente ADMIN (la tabla solo acepta service_role) y en
 * upsert sobre (entity_type, entity_id). Solo la lee la oficina: ver field_presence en
 * 20260925100000_geolocation.sql.
 *
 * Nunca lanza: un fallo al leer la máquina se registra y cuenta como máquina sin ubicación.
 */
export async function computePresence({ entityType, entityId, techId, numeroSerie, position }: {
  entityType: 'incident' | 'visit'
  entityId: string
  techId: string
  numeroSerie: string | null
  position: (LatLng & { accuracy: number }) | null
}): Promise<TablesInsert<'field_presence'>> {
  let machine: (LatLng & { accuracy: number | null }) | null = null
  if (position && numeroSerie) {
    const { data, error } = await createAdminClient()
      .from('machines')
      .select('lat, lng, location_accuracy_m')
      .eq('numero_serie', numeroSerie)
      .maybeSingle()
    if (error) console.error('[computePresence.machine]', error)
    if (data?.lat != null && data.lng != null) {
      machine = { lat: data.lat, lng: data.lng, accuracy: data.location_accuracy_m }
    }
  }

  const { presence, distance } = presenceFor({ tech: position, machine })
  return {
    entity_type: entityType,
    entity_id: entityId,
    tech_id: techId,
    lat: position?.lat ?? null,
    lng: position?.lng ?? null,
    accuracy_m: position?.accuracy ?? null,
    distance_m: distance,
    presence,
    recorded_at: new Date().toISOString(),
  }
}
