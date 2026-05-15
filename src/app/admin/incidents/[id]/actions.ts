'use server'

import { requireAdmin } from '@/lib/auth'
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

  const old_status  = formData.get('old_status') as string
  const new_status  = formData.get('status')     as string
  const comment     = (formData.get('comment')   as string)?.trim() || null
  const assigned_to = (formData.get('assigned_to') as string).trim() || null

  const updates: Record<string, unknown> = {
    title,
    description:  (formData.get('description') as string).trim() || null,
    category:     formData.get('category'),
    priority:     formData.get('priority'),
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
