'use server'

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { INCIDENT_STATUSES, parseEnum } from '@/lib/enums'
import type { TablesUpdate } from '@/lib/supabase/types'
import { redirect } from 'next/navigation'
import { after } from 'next/server'
import { sendCsatForIncident } from '@/lib/csat.server'
import { PARTS } from '@/lib/parts'
import { computePresence } from '@/lib/presence.server'
import { readPosition } from '@/lib/geo'
import { getCloseGate, stampQrScan } from '@/lib/scan.server'
import { CLOSE_SCAN_ERROR, START_SCAN_ERROR, WRONG_MACHINE_ERROR, requiresScan, sameMachine } from '@/lib/scanGate'
import { archivedResolutionNote, buildResolution, clearResolution, historyComment, reopens } from '@/lib/resolution'

type FormState = { error: string } | null

/**
 * Máquina de la avería: la de su línea de contrato (es la que está hoy en ese puesto) o, en las
 * averías sin línea (formulario público del QR), su `machine_id`. Sin ninguna ⇒ null, y el
 * veredicto de presencia queda en «machine sans position».
 */
async function incidentSerie(
  supabase: Awaited<ReturnType<typeof createClient>>,
  incident: { contract_machine_id: string | null; machine_id: string | null },
): Promise<string | null> {
  if (incident.contract_machine_id) {
    const { data, error } = await supabase
      .from('contract_machines')
      .select('machine_id')
      .eq('id', incident.contract_machine_id)
      .maybeSingle()
    if (error) console.error('[submitIntervention.serie]', error)
    if (data?.machine_id) return data.machine_id
  }
  return incident.machine_id
}

/**
 * Empezar la intervención escaneando desde la ficha: el técnico escanea el QR de la máquina con
 * la cámara de la propia página. Tiene la misma credibilidad que `recordQrScanAction` (el serie
 * sale de leer la etiqueta), pero aquí además debe ser la máquina de ESTA avería: si no, no se
 * sella nada. Se sella con el serie de la BD (no con el texto escaneado) para que coincida
 * exactamente con `machines.numero_serie` aunque cambien las mayúsculas.
 */
export async function startInterventionScanAction(
  incidentId: string,
  rawSerie: string,
): Promise<{ error: string } | { needsLocation: boolean }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: incident } = await supabase
    .from('incidents')
    .select('assigned_to, contract_machine_id, machine_id')
    .eq('id', incidentId)
    .single()
  if (!incident) return { error: 'Incident introuvable.' }
  if (incident.assigned_to !== user.id) return { error: 'Non autorisé.' }

  const serie = await incidentSerie(supabase, incident)
  if (!serie || !sameMachine(rawSerie, serie)) return { error: WRONG_MACHINE_ERROR }

  const stamp = await stampQrScan(serie, user.id)
  return { needsLocation: stamp.needsLocation }
}

export async function submitInterventionAction(
  id: string,
  _prev: FormState,
  formData: FormData
): Promise<FormState> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  // Verificar que el incidente esté asignado a este técnico
  const { data: incident } = await supabase
    .from('incidents')
    .select('assigned_to, status, resolved_via, resolution_reason, resolution_note, rapport_intervention, contract_machine_id, machine_id, resolved_at')
    .eq('id', id)
    .single()
  if (!incident) return { error: 'Incident introuvable.' }
  if (incident.assigned_to !== user.id) return { error: 'Non autorisé.' }

  const new_status = parseEnum(formData.get('status'), INCIDENT_STATUSES)
  if (!new_status) return { error: 'Statut invalide.' }

  // El estado anterior se lee de la base, no de un campo oculto del formulario: una pestaña
  // abierta hace rato manda el estado de entonces, y con él se decidían el historial, el
  // `resolved_at` y el envío de la encuesta.
  const old_status = incident.status

  // Cierre escaneando desde la ficha: si llega `scan_serie`, el QR debe ser el de la máquina de
  // esta avería (se rechaza ANTES de escribir nada) y se sella aquí, para que la comprobación del
  // doble escaneo de abajo ya vea este escaneo. El serie se calcula una sola vez por petición y se
  // reutiliza en `computePresence`; sin `scan_serie` se calcula donde hacía falta (al resolver).
  let serie: string | null | undefined
  const scanSerie = formData.get('scan_serie')
  if (typeof scanSerie === 'string' && scanSerie.trim() && new_status === 'résolu') {
    serie = await incidentSerie(supabase, incident)
    if (!serie || !sameMachine(scanSerie, serie)) return { error: WRONG_MACHINE_ERROR }
    await stampQrScan(serie, user.id)
  }

  // Doble escaneo: el técnico de campo empieza escaneando el QR de la máquina y solo puede
  // cerrar si ha escaneado otra vez (ventana de 1 h). Se rechaza ANTES de escribir nada (ni
  // archivo de rastro ni `update`). Reabrir es cosa de la oficina, por eso `en_cours` desde otro
  // estado tampoco se permite aquí. Atelier y admin quedan fuera (`requiresScan`).
  // Si el perfil no se puede leer se trata como obligado a escanear (fail closed): ante un
  // fallo de lectura es preferible pedir un escaneo de más que dejar saltarse la regla.
  const { data: profile } = await supabase
    .from('profiles')
    .select('role, is_dispatcher')
    .eq('id', user.id)
    .maybeSingle()
  if (!profile || requiresScan(profile)) {
    if (new_status === 'en_cours' && old_status !== 'en_cours') {
      return { error: START_SCAN_ERROR }
    }
    if (new_status === 'résolu' && old_status !== 'résolu') {
      const gate = await getCloseGate(id, user.id, incident.resolved_at)
      if (!gate.canClose) {
        return { error: CLOSE_SCAN_ERROR }
      }
    }
  }

  const rapport           = (formData.get('rapport') as string).trim() || null
  const autres_pieces     = (formData.get('autres_pieces') as string).trim() || null
  const comment           = (formData.get('comment') as string)?.trim() || null

  const updates: TablesUpdate<'incidents'> = { status: new_status, assigned_to: user.id }
  if (rapport)       updates.rapport_intervention = rapport
  if (autres_pieces) updates.autres_pieces = autres_pieces

  // Verrou de résolution: una avería no se da por resuelta sin informe. Se comprueba
  // siempre que el resultado sea `résolu`, no solo en la transición: volver a guardar
  // una resuelta con el informe borrado la dejaría igual de muda.
  if (new_status === 'résolu') {
    const resolution = buildResolution({ via: 'intervention', rapport })
    if (!resolution.ok) return { error: resolution.error }
    Object.assign(updates, resolution.fields)
  }

  // Reabrir borra el rastro: si no, la próxima resolución heredaría el informe y la vía de la
  // anterior y la marca diría «intervención» aunque la segunda vez nadie fuese. Cuenta también
  // venir de `fermé`: el envío de la encuesta cierra la avería al instante, así que una
  // resuelta casi nunca se queda en `résolu`.
  // El informe de la resolución anterior se archiva en el historial ANTES de que
  // `clearResolution()` lo borre: reabrir no puede tirar lo que un técnico escribió sobre una
  // visita real, pero la próxima resolución tiene que traer el suyo.
  let archivedTrace: string | null = null
  if (reopens(old_status, new_status)) {
    archivedTrace = archivedResolutionNote({
      via: incident.resolved_via,
      reason: incident.resolution_reason,
      note: incident.resolution_note,
      rapport: incident.rapport_intervention,
    })
    Object.assign(updates, clearResolution())
    // El formulario llega relleno con el informe anterior. Si el técnico lo ha REESCRITO, ese
    // texto es suyo y se queda: al reabrir puede estar explicando por qué vuelve. Si lo dejó
    // tal cual, se va con el resto del rastro — que es lo que impide que el informe de marzo
    // acabe cerrando la visita de mayo.
    if (rapport && rapport !== incident.rapport_intervention?.trim()) {
      updates.rapport_intervention = rapport
    }
  }

  if (new_status === 'résolu' && old_status !== 'résolu') updates.resolved_at = new Date().toISOString()
  if (new_status === 'fermé'  && old_status !== 'fermé')  updates.closed_at   = new Date().toISOString()

  // El rastro se archiva ANTES de borrarlo. Al revés —que es como estaba— un fallo al escribir
  // el historial dejaba el informe borrado de la avería y sin copia en ninguna parte, con el
  // técnico viendo «guardado». Si esta línea no entra, no se toca la avería.
  if (archivedTrace) {
    const { error: archErr } = await supabase.from('incident_history').insert({
      incident_id: id, changed_by: user.id,
      old_status: null, new_status: null, comment: archivedTrace,
    })
    if (archErr) {
      console.error('[submitIntervention] archivage', { id, error: archErr })
      return { error: 'Impossible d\'archiver le rapport précédent. Veuillez réessayer.' }
    }
  }

  const { error } = await supabase.from('incidents').update(updates).eq('id', id)
  if (error) {
    console.error('[submitIntervention]', error)
    // 23514 (check_violation) lo lanzan los guards de la BD con un texto para el técnico: p. ej.
    // la ventana de 1 h vence entre la comprobación de arriba y este UPDATE. Mostrarlo tal cual
    // le dice qué hacer (volver a escanear) en vez de un «réessayez» que fallaría igual.
    if (error.code === '23514') return { error: error.message }
    return { error: 'Une erreur est survenue. Veuillez réessayer.' }
  }

  // Dónde estaba el técnico al resolver (Fase 3). Solo en la transición: volver a guardar una
  // resuelta no es resolverla otra vez y no debe pisar la posición de entonces. Nunca bloquea:
  // sin permiso o sin GPS queda «sans position», y un fallo aquí solo se registra.
  // Va a `field_presence` con el cliente ADMIN: esa tabla solo la escribe service_role y solo
  // la lee la oficina (el cliente del portal no debe ver dónde estaba el técnico).
  if (new_status === 'résolu' && old_status !== 'résolu') {
    const presence = await computePresence({
      entityType: 'incident', entityId: id, techId: user.id,
      numeroSerie: serie !== undefined ? serie : await incidentSerie(supabase, incident), position: readPosition(formData),
    })
    const { error: presenceError } = await createAdminClient()
      .from('field_presence')
      .upsert(presence, { onConflict: 'entity_type,entity_id' })
    if (presenceError) console.error('[submitIntervention.presence]', presenceError)
  }

  // Historial
  if (new_status !== old_status) {
    const { error: histErr } = await supabase.from('incident_history').insert({
      incident_id: id, changed_by: user.id,
      old_status, new_status, comment,
    })
    if (histErr) console.error('[submitIntervention] historique', { id, error: histErr })
  }

  // Piezas reemplazadas (con cantidad). Se reemplaza el set completo de forma
  // atómica vía RPC: borra las existentes y reinserta las marcadas en una sola
  // transacción (desmarcar todas vacía la lista). El RPC es SECURITY INVOKER:
  // respeta la RLS del técnico sobre incident_parts.
  const selectedParts = PARTS
    .filter((p) => formData.get(`part_${p.id}`) === 'on')
    .map((p) => {
      const raw = Number(formData.get(`qty_${p.id}`))
      const quantity = Number.isInteger(raw) && raw > 0 ? raw : 1
      return { part_id: p.id, quantity }
    })
  const { error: partsError } = await supabase.rpc('set_incident_parts', {
    p_incident_id: id,
    p_parts: selectedParts,
  })
  if (partsError) {
    console.error('[submitIntervention.parts]', partsError)
    return { error: 'Erreur lors de l\'enregistrement des pièces. Veuillez réessayer.' }
  }

  // `after()` difiere el envío a DESPUÉS de la respuesta: el `redirect()` de
  // abajo lanza por diseño y la función serverless podría apagarse con el envío
  // a medias (ni correo, ni fila, ni rastro). El `.catch` evita que un fallo del
  // envío tumbe la acción del usuario.
  if (new_status === 'résolu' && old_status !== 'résolu') {
    after(() => sendCsatForIncident(id).catch(console.error))
  }

  redirect('/tech')
}
