'use server'

import { requireAdmin } from '@/lib/auth'
import { INCIDENT_CATEGORIES, INCIDENT_PRIORITIES, INCIDENT_STATUSES, RESOLUTION_REASONS, parseEnum } from '@/lib/enums'
import type { TablesUpdate } from '@/lib/supabase/types'
import { redirect } from 'next/navigation'
import { after } from 'next/server'
import { sendCsatForIncident } from '@/lib/csat.server'
import { buildResolution, clearResolution, reopens, requiresOfficeResolution } from '@/lib/resolution'

type FormState = { error: string } | null

export async function updateIncidentAction(
  id: string,
  _prev: FormState,
  formData: FormData
): Promise<FormState> {
  const { user, supabase } = await requireAdmin()

  const title = (formData.get('title') as string).trim()
  if (!title) return { error: 'Le titre est obligatoire.' }

  const category   = parseEnum(formData.get('category'), INCIDENT_CATEGORIES)
  const priority   = parseEnum(formData.get('priority'), INCIDENT_PRIORITIES)
  const new_status = parseEnum(formData.get('status'), INCIDENT_STATUSES)
  if (!category)   return { error: 'Catégorie invalide.' }
  if (!priority)   return { error: 'Priorité invalide.' }
  if (!new_status) return { error: 'Statut invalide.' }

  // El estado anterior se lee de la base y no del formulario: una ficha abierta desde hace
  // rato manda el estado de entonces, y de él dependen el historial, el `resolved_at`, el
  // envío de la encuesta y el borrado del rastro al reabrir.
  const { data: current } = await supabase
    .from('incidents')
    .select('status, resolved_via')
    .eq('id', id)
    .single()
  if (!current) return { error: 'Incident introuvable.' }
  const old_status = current.status

  const comment     = (formData.get('comment')   as string)?.trim() || null
  const assigned_to = (formData.get('assigned_to') as string).trim() || null

  // Auto-transición: asignar técnico a un incident 'nouveau' lo pasa a 'assigné'
  const effective_status =
    assigned_to !== null && old_status === 'nouveau' && new_status === 'nouveau'
      ? 'assigné' as const
      : new_status

  const updates: TablesUpdate<'incidents'> = {
    title,
    description:  (formData.get('description') as string).trim() || null,
    category,
    priority,
    status:       effective_status,
    assigned_to,
  }

  // Verrou de résolution: cerrar desde la ficha sin informe de técnico exige motivo y
  // explicación, igual que en el tablero. No se pide cuando la avería ya trae rastro:
  // corregir el título de una resuelta no es resolverla otra vez.
  if (requiresOfficeResolution(old_status, effective_status, current.resolved_via)) {
    const resolution = buildResolution({
      via: 'bureau',
      reason: parseEnum(formData.get('resolution_reason'), RESOLUTION_REASONS),
      note: formData.get('resolution_note') as string | null,
      // El técnico no se pregunta aquí: esta ficha ya tiene su propio campo «Assigné à», y dos
      // fuentes para el mismo dato acabarían pisándose.
      technicianId: null,
    })
    if (!resolution.ok) return { error: resolution.error }
    Object.assign(updates, resolution.fields)
  }

  if (effective_status === 'résolu' && old_status !== 'résolu') updates.resolved_at = new Date().toISOString()
  if (effective_status === 'fermé'  && old_status !== 'fermé')  updates.closed_at   = new Date().toISOString()

  // Reabrir desde la ficha borra el rastro igual que en el tablero: una resolución que no
  // limpia deja a la siguiente heredar el informe y el escaneo de la anterior.
  if (reopens(old_status, effective_status)) Object.assign(updates, clearResolution())

  const { error } = await supabase.from('incidents').update(updates).eq('id', id)
  if (error) {
    console.error('[updateIncident]', error)
    return { error: 'Une erreur est survenue. Veuillez réessayer.' }
  }

  if (effective_status !== old_status) {
    await supabase.from('incident_history').insert({
      incident_id: id,
      changed_by:  user.id,
      old_status,
      new_status:  effective_status,
      comment,
    })
  }

  // La ficha de admin es la tercera puerta a `résolu` (además del tech y del
  // kanban): sin esto, resolver desde aquí no generaba encuesta y la incidencia
  // se quedaba en `résolu` para siempre (quien la cierra es el propio envío).
  // `after()` difiere el envío a DESPUÉS de la respuesta: el `redirect()` lanza
  // por diseño y la función serverless podría apagarse con el envío a medias.
  if (effective_status === 'résolu' && old_status !== 'résolu') {
    after(() => sendCsatForIncident(id).catch(console.error))
  }

  redirect('/admin/incidents')
}

export async function deleteIncidentAction(formData: FormData): Promise<void> {
  const id = formData.get('id') as string
  const { supabase } = await requireAdmin()
  await supabase.from('incidents').delete().eq('id', id)
  redirect('/admin/incidents')
}
