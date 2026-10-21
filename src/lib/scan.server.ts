import 'server-only'

import { createAdminClient } from './supabase/admin'
import { getOpenLineForMachine } from './contract-machines'
import { FIRST_SCAN_MAX_ACCURACY_M, type LatLng } from './geo'
import { SCAN_DEDUPE_SECONDS } from './scanGate'

/**
 * Deja constancia de que alguien escaneó el QR físico de una máquina.
 *
 * Se llama desde DOS sitios, los únicos que prueban que alguien tuvo la etiqueta física
 * delante: `/m/[serie]` (la etiqueta impresa abierta con la cámara del sistema, típicamente
 * en Safari sin sesión) y `recordQrScanAction` (`src/app/tech/scan/actions.ts`, el escáner
 * de la propia app — necesario porque con la PWA instalada la cámara del iPhone abre los QR
 * en Safari, donde no hay sesión, así que el único camino real para un técnico logueado es
 * escanear DENTRO de la app). NO se sella al renderizar `/tech/scan/[serie]`, que parece la
 * página del escaneo pero es un enlace normal: la agenda del técnico
 * (`components/tech/AgendaPanel.tsx`, presente en el layout de todas las páginas `/tech`) y
 * `/tech/planning` apuntan ahí directamente, y al ser `<Link>` con prefetch el servidor puede
 * renderizarla sin que nadie pulse nada. Sellar al renderizar esa página daría por presente en
 * la máquina a un técnico sentado en la oficina, que es exactamente lo contrario de lo que el
 * sello debe probar.
 *
 * Qué deja el escaneo:
 * - las averías abiertas de la máquina (del que escanea o sin técnico) quedan `qr_verified`;
 * - esas mismas averías reciben una fila en `incident_scans` (quién y cuándo), salvo que ese
 *   usuario ya escaneara la misma avería hace menos de SCAN_DEDUPE_SECONDS (doble lectura de la
 *   cámara). Es el rastro que luego permite exigir un segundo escaneo para cerrar;
 * - las del propio técnico en `assigné` pasan a `en_cours` («Mise en cours — scan QR»): empezar
 *   la avería es escanear, ya no basta con abrir la ficha (esa página no cambia nada);
 * - la visita de mantenimiento QUE TOCA de su línea abierta: la pendiente (`planifié` /
 *   `en_retard`) más antigua con fecha ≤ hoy + VISIT_STAMP_WINDOW_DAYS, del que escanea o sin
 *   técnico. Solo esa: escanear hoy no prueba nada sobre la visita del trimestre que viene. Desde
 *   la Fase 3 el cierre de la visita ya no pone el sello a ciegas (`close_maintenance_visit`),
 *   así que este es el único sitio que lo pone.
 *
 * Devuelve `needsLocation`: la máquina está instalada en un cliente (línea abierta) y aún no
 * tiene ubicación, así que la posición del escaneo le serviría (ver `setFirstScanLocation`). El
 * escáner de la app solo espera al GPS en ese caso.
 *
 * Nunca bloquea nada: un fallo aquí se registra y se sigue. Cada paso es independiente: que
 * falle uno no impide los demás.
 */
export async function stampQrScan(numeroSerie: string, userId: string): Promise<{ needsLocation: boolean }> {
  const admin = createAdminClient()

  // El escaneo de la etiqueta de un equipo dado de baja no prueba nada (la propia página de
  // scan muestra «Machine introuvable ou retirée du parc» en ese caso).
  const { data: machine } = await admin
    .from('machines')
    .select('active, lat')
    .eq('numero_serie', numeroSerie)
    .maybeSingle()
  if (!machine?.active) return { needsLocation: false }

  const openLine = await getOpenLineForMachine(admin, numeroSerie)

  await stampIncidents(admin, numeroSerie, openLine?.id ?? null, userId)
  if (openLine) await stampMaintenanceVisit(admin, openLine.id, userId)
  return { needsLocation: openLine !== null && machine.lat === null }
}

/**
 * Primer escaneo con buen GPS ⇒ ubicación de la máquina. Solo si la máquina está activa, está
 * INSTALADA en un cliente (línea de contrato abierta: en el almacén, su posición no dice dónde
 * estará), aún no tiene ubicación y la precisión es ≤ FIRST_SCAN_MAX_ACCURACY_M. Cuando la
 * máquina recibe una línea nueva (se mueve), la BD borra su ubicación y el próximo escaneo pone
 * la nueva (trigger de 20260925100000_geolocation.sql).
 *
 * `.is('lat', null)` en el propio UPDATE: si el admin (u otro escaneo) la ha puesto entre la
 * lectura y aquí, no se pisa. Las columnas van todas juntas (CHECK machines_location_complete_chk).
 * Nunca lanza.
 */
export async function setFirstScanLocation(
  numeroSerie: string,
  userId: string,
  position: LatLng & { accuracy: number },
): Promise<void> {
  if (position.accuracy > FIRST_SCAN_MAX_ACCURACY_M) return
  const admin = createAdminClient()

  const { data: machine, error: readError } = await admin
    .from('machines')
    .select('active, lat')
    .eq('numero_serie', numeroSerie)
    .maybeSingle()
  if (readError) console.error('[setFirstScanLocation.read]', readError)
  if (!machine?.active || machine.lat !== null) return
  if (!(await getOpenLineForMachine(admin, numeroSerie))) return

  const { error } = await admin
    .from('machines')
    .update({
      lat: position.lat,
      lng: position.lng,
      location_accuracy_m: position.accuracy,
      location_source: 'first_scan',
      location_set_at: new Date().toISOString(),
      location_set_by: userId,
    })
    .eq('numero_serie', numeroSerie)
    .is('lat', null)
  if (error) console.error('[setFirstScanLocation.write]', error)
}

/** El escaneo sella la visita pendiente más antigua con fecha dentro de esta ventana. */
export const VISIT_STAMP_WINDOW_DAYS = 14

type Admin = ReturnType<typeof createAdminClient>

async function stampIncidents(admin: Admin, numeroSerie: string, openLineId: string | null, userId: string) {
  const filterExpr = openLineId
    ? `contract_machine_id.eq.${openLineId},machine_id.eq.${numeroSerie}`
    : `machine_id.eq.${numeroSerie}`

  const { data: rows, error: readError } = await admin
    .from('incidents')
    .select('id, assigned_to, status, qr_verified, qr_scanned_by')
    .or(filterExpr)
    .in('status', ['nouveau', 'assigné', 'en_cours'])
  if (readError) {
    console.error('[stampQrScan.read]', readError)
    return
  }

  // Se tratan las averías del que escanea y también las que aún no tienen técnico: es
  // frecuente que el técnico llegue, escanee y solo entonces se le asigne la avería (o que
  // esté abierta desde el formulario público del QR). Guardar QUIÉN escaneó permite que la
  // lectura del semáforo exija que fuese quien la resolvió.
  const mine = (rows ?? []).filter((r) => r.assigned_to === null || r.assigned_to === userId)
  if (mine.length === 0) return

  const toStamp = mine.filter((r) => !(r.qr_verified && r.qr_scanned_by === userId)).map((r) => r.id)
  if (toStamp.length > 0) {
    const { error } = await admin
      .from('incidents')
      .update({ qr_verified: true, qr_scanned_by: userId })
      .in('id', toStamp)
    if (error) console.error('[stampQrScan.write]', error)
  }

  await recordScans(admin, mine.map((r) => r.id), userId)

  // Empezar la avería: solo las asignadas a quien escanea. `.eq('status','assigné')` en el propio
  // UPDATE evita pisar un cambio hecho entre la lectura y aquí (p. ej. la oficina la puso en
  // en_cours o la cerró). El historial se escribe solo de las filas que de verdad cambiaron.
  const toStart = mine.filter((r) => r.assigned_to === userId && r.status === 'assigné').map((r) => r.id)
  if (toStart.length === 0) return
  const { data: started, error: startError } = await admin
    .from('incidents')
    .update({ status: 'en_cours' })
    .in('id', toStart)
    .eq('status', 'assigné')
    .select('id')
  if (startError) {
    console.error('[stampQrScan.start]', startError)
    return
  }
  if (!started || started.length === 0) return
  const { error: historyError } = await admin.from('incident_history').insert(
    started.map((i) => ({
      incident_id: i.id,
      changed_by: userId,
      old_status: 'assigné',
      new_status: 'en_cours',
      comment: 'Mise en cours — scan QR',
    })),
  )
  if (historyError) console.error('[stampQrScan.start.history]', historyError)
}

// Una fila por avería y escaneo. Se compara con el ÚLTIMO escaneo de ese usuario en esa avería
// (de cualquier ciclo): si es de hace menos de SCAN_DEDUPE_SECONDS, es la misma lectura repetida.
async function recordScans(admin: Admin, incidentIds: string[], userId: string) {
  const { data: last, error: readError } = await admin
    .from('incident_scans')
    .select('incident_id, scanned_at')
    .eq('scanned_by', userId)
    .in('incident_id', incidentIds)
  if (readError) {
    console.error('[stampQrScan.scans.read]', readError)
    return
  }
  const latest = new Map<string, number>()
  for (const s of last ?? []) {
    const at = new Date(s.scanned_at).getTime()
    if (at > (latest.get(s.incident_id) ?? 0)) latest.set(s.incident_id, at)
  }
  const cutoff = Date.now() - SCAN_DEDUPE_SECONDS * 1000
  const fresh = incidentIds.filter((id) => (latest.get(id) ?? 0) <= cutoff)
  if (fresh.length === 0) return

  const { error } = await admin
    .from('incident_scans')
    .insert(fresh.map((id) => ({ incident_id: id, scanned_by: userId })))
  if (error) console.error('[stampQrScan.scans.write]', error)
}

// Mismo criterio que las averías (del que escanea o sin técnico), pero UNA visita: la que toca
// (la pendiente más antigua dentro de la ventana). Las visitas no guardan quién escaneó:
// `qr_verified` a secas, como mostraba ya la oficina.
async function stampMaintenanceVisit(admin: Admin, openLineId: string, userId: string) {
  const cutoff = new Date(Date.now() + VISIT_STAMP_WINDOW_DAYS * 86_400_000).toISOString().slice(0, 10)
  const { data: due, error: readError } = await admin
    .from('maintenance_visits')
    .select('id, qr_verified')
    .eq('contract_machine_id', openLineId)
    .in('status', ['planifié', 'en_retard'])
    .or(`assigned_to.eq.${userId},assigned_to.is.null`)
    .lte('scheduled_date', cutoff)
    .order('scheduled_date', { ascending: true })
    .limit(1)
    .maybeSingle()
  if (readError) {
    console.error('[stampQrScan.visits.read]', readError)
    return
  }
  if (!due || due.qr_verified) return

  const { error } = await admin
    .from('maintenance_visits')
    .update({ qr_verified: true })
    .eq('id', due.id)
  if (error) console.error('[stampQrScan.visits]', error)
}
