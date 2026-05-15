'use server'

import { requireAdmin } from '@/lib/auth'
import { INCIDENT_CATEGORIES, INCIDENT_PRIORITIES, parseEnum } from '@/lib/enums'
import { redirect } from 'next/navigation'

type FormState = { error: string } | null

export async function createIncidentAction(
  _prev: FormState,
  formData: FormData
): Promise<FormState> {
  const { user, supabase } = await requireAdmin()

  const title       = (formData.get('title')       as string).trim()
  const contract_id = (formData.get('contract_id') as string).trim()

  if (!title)       return { error: 'Le titre est obligatoire.' }
  if (!contract_id) return { error: 'Veuillez sélectionner un contrat.' }

  const { data: contract } = await supabase
    .from('contracts')
    .select('machine_id')
    .eq('id', contract_id)
    .single()

  if (!contract) return { error: 'Contrat introuvable.' }

  const category = parseEnum(formData.get('category'), INCIDENT_CATEGORIES)
  const priority = parseEnum(formData.get('priority'), INCIDENT_PRIORITIES)
  if (!category) return { error: 'Catégorie invalide.' }
  if (!priority) return { error: 'Priorité invalide.' }

  const assigned_to = (formData.get('assigned_to') as string).trim() || null
  const status      = assigned_to ? 'assigné' : 'nouveau'

  const { data: incident, error } = await supabase
    .from('incidents')
    .insert({
      contract_id,
      machine_id:  contract.machine_id,
      opened_by:   user.id,
      assigned_to,
      title,
      description: (formData.get('description') as string).trim() || null,
      category,
      priority,
      status,
    })
    .select('id')
    .single()

  if (error) return { error: error.message }

  if (incident) {
    await supabase.from('incident_history').insert({
      incident_id: incident.id,
      changed_by:  user.id,
      old_status:  null,
      new_status:  status,
      comment:     'Incident créé',
    })
  }

  redirect('/admin/incidents')
}
