import { createClient } from '@/lib/supabase/server'
import { toQuartiers, type Quartier } from '@/lib/quartiers'

/**
 * Catálogo COMPLETO de quartiers (activos e inactivos), ordenado, para los desplegables de
 * /admin y el mapa de /atelier. Se consulta con el cliente de sesión: la policy
 * `quartiers_select_authenticated` lo permite.
 *
 * Devuelve también los inactivos a propósito: quien filtra es `selectableQuartiers()`, que
 * conserva la zona ya asignada a un registro aunque se haya desactivado.
 *
 * Si la consulta falla, LANZA en vez de devolver []. Una lista vacía haría que el `<select>`
 * enviara '' y que guardar cualquier otro campo borrase el quartier del registro.
 */
export async function getQuartiers(): Promise<Quartier[]> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('quartiers')
    .select('code, label, ville, lat, lng, sort_order, active')
    .order('sort_order')

  if (error) {
    console.error('[quartiers]', error)
    throw new Error('DATA_FETCH_ERROR')
  }

  return toQuartiers(data)
}
