'use server'

import { requireAdmin } from '@/lib/auth'
import { INCIDENT_CATEGORIES, INCIDENT_PRIORITIES, INCIDENT_STATUSES, parseEnum } from '@/lib/enums'
import { redirect } from 'next/navigation'

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
  const new_status = parseEnum(formData.get('status'),   INCIDENT_STATUSES)
  const old_status = parseEnum(formData.get('old_status'), INCIDENT_STATUSES)
  if (!category)   return { error: 'Catégorie invalide.' }
  if (!priority)   return { error: 'Priorité invalide.' }
  if (!new_status) return { error: 'Statut invalide.' }
  if (!old_status) return { error: 'Statut actuel invalide.' }

  const comment     = (formData.get('comment')   as string)?.trim() || null
  const assigned_to = (formData.get('assigned_to') as string).trim() || null

  const updates: Record<string, unknown> = {
    title,
    description:  (formData.get('description') as string).trim() || null,
    category,
    priority,
    status:       new_status,
    assigned_to,
  }

  if (new_status === 'résolu' && old_status !== 'résolu') updates.resolved_at = new Date().toISOString()
  if (new_status === 'fermé'  && old_status !== 'fermé')  updates.closed_at   = new Date().toISOString()

  const { error } = await supabase.from('incidents').update(updates).eq('id', id)
  if (error) {
    console.error('[updateIncident]', error)
    return { error: 'Une erreur est survenue. Veuillez réessayer.' }
  }

  if (new_status !== old_status) {
    await supabase.from('incident_history').insert({
      incident_id: id,
      changed_by:  user.id,
      old_status,
      new_status,
      comment,
    })
  }

  redirect('/admin/incidents')
}

export async function deleteIncidentAction(formData: FormData): Promise<void> {
  const id = formData.get('id') as string
  const { supabase } = await requireAdmin()
  await supabase.from('incidents').delete().eq('id', id)
  redirect('/admin/incidents')
}
