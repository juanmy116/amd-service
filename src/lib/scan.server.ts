import 'server-only'

import { createAdminClient } from './supabase/admin'
import { getOpenLineForMachine } from './contract-machines'

/**
 * Deja constancia de que alguien escaneó el QR físico de una máquina.
 *
 * Vive aquí y se llama desde `/m/[serie]` — la única ruta que codifican las etiquetas
 * impresas — y NO desde `/tech/scan/[serie]`, que parece la página del escaneo pero es un
 * enlace normal: la agenda del técnico (`components/tech/AgendaPanel.tsx`, presente en el
 * layout de todas las páginas `/tech`) y `/tech/planning` apuntan ahí directamente, y al ser
 * `<Link>` con prefetch el servidor puede renderizarla sin que nadie pulse nada. Sellar al
 * renderizar esa página daría por presente en la máquina a un técnico sentado en la oficina,
 * que es exactamente lo contrario de lo que el sello debe probar.
 *
 * Nunca bloquea nada: un fallo aquí se registra y se sigue.
 */
export async function stampQrScan(numeroSerie: string, userId: string): Promise<void> {
  const admin = createAdminClient()

  // El escaneo de la etiqueta de un equipo dado de baja no prueba nada (la propia página de
  // scan hace `notFound()` en ese caso).
  const { data: machine } = await admin
    .from('machines')
    .select('active')
    .eq('numero_serie', numeroSerie)
    .maybeSingle()
  if (!machine?.active) return

  const openLine = await getOpenLineForMachine(admin, numeroSerie)
  const filterExpr = openLine
    ? `contract_machine_id.eq.${openLine.id},machine_id.eq.${numeroSerie}`
    : `machine_id.eq.${numeroSerie}`

  const { data: rows, error: readError } = await admin
    .from('incidents')
    .select('id, assigned_to, qr_verified, qr_scanned_by')
    .or(filterExpr)
    .in('status', ['nouveau', 'assigné', 'en_cours'])
  if (readError) {
    console.error('[stampQrScan.read]', readError)
    return
  }

  // Se sellan las averías del que escanea y también las que aún no tienen técnico: es
  // frecuente que el técnico llegue, escanee y solo entonces se le asigne la avería (o que
  // esté abierta desde el formulario público del QR). Guardar QUIÉN escaneó permite que la
  // lectura del semáforo exija que fuese quien la resolvió.
  const targets = (rows ?? [])
    .filter((r) => r.assigned_to === null || r.assigned_to === userId)
    .filter((r) => !(r.qr_verified && r.qr_scanned_by === userId))
    .map((r) => r.id)
  if (targets.length === 0) return

  const { error } = await admin
    .from('incidents')
    .update({ qr_verified: true, qr_scanned_by: userId })
    .in('id', targets)
  if (error) console.error('[stampQrScan.write]', error)
}
