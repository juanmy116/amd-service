import { createClient } from '@/lib/supabase/server'
import { toQuartiers, type Quartier } from '@/lib/quartiers'

/**
 * Catálogo de quartiers activos, ordenado, para los desplegables de /admin y el mapa de /atelier.
 * Se consulta con el cliente de sesión: la policy `quartiers_select_authenticated` lo permite.
 */
export async function getQuartiers(): Promise<Quartier[]> {
  const supabase = await createClient()
  const { data } = await supabase
    .from('quartiers')
    .select('code, label, ville, lat, lng, sort_order')
    .eq('active', true)
    .order('sort_order')

  return toQuartiers(data)
}
