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
 * Igual, pero para pantallas de SOLO LECTURA (listados): si el catálogo falla devuelve la
 * lista vacía y la página se pinta sin opciones de filtro, en vez de tumbar toda la lista.
 *
 * Devuelve además `unavailable` para que quien llame pueda distinguir «no hay zonas» de
 * «no he podido leerlas». Sin esa distinción, un fallo del catálogo haría pasar por inválido
 * a cualquier filtro legítimo. Pasa de verdad justo después de un `db push`: PostgREST tarda
 * un momento en refrescar su caché de esquema y hasta entonces la tabla «no existe».
 */
export async function getQuartiersForFilter(): Promise<{ quartiers: Quartier[]; unavailable: boolean }> {
  const { data, error } = await fetchQuartiers()
  return { quartiers: data, unavailable: error }
}
