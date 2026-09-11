import { createClient } from '@/lib/supabase/server'
import { toQuartiers, type Quartier } from '@/lib/quartiers'

async function fetchQuartiers(): Promise<{ data: Quartier[]; error: boolean }> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('quartiers')
    .select('code, label, ville, lat, lng, sort_order, active')
    .order('sort_order')

  if (error) {
    console.error('[quartiers]', error)
    return { data: [], error: true }
  }
  return { data: toQuartiers(data), error: false }
}

/**
 * Catálogo COMPLETO de quartiers (activos e inactivos) para las pantallas que GUARDAN:
 * fichas de cliente y de máquina. Quien filtra es `selectableQuartiers()`, que conserva la
 * zona ya asignada al registro aunque se haya desactivado.
 *
 * LANZA si la consulta falla. Es deliberado: con una lista vacía el `<select>` enviaría ''
 * y guardar cualquier otro campo borraría el quartier del registro. Mejor no pintar el
 * formulario que corromper el dato en silencio.
 */
export async function getQuartiers(): Promise<Quartier[]> {
  const { data, error } = await fetchQuartiers()
  if (error) throw new Error('DATA_FETCH_ERROR')
  return data
}

/**
 * Igual, pero para pantallas de SOLO LECTURA (listados): si el catálogo falla devuelve []
 * y la página se pinta sin opciones de filtro, en vez de tumbar toda la lista de clientes.
 */
export async function getQuartiersForFilter(): Promise<Quartier[]> {
  const { data } = await fetchQuartiers()
  return data
}
