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

  const title = ((formData.get('title') as string) ?? '').trim()
  const contract_machine_id = ((formData.get('contract_machine_id') as string) ?? '').trim()

  if (!title) return { error: 'Le titre est obligatoire.' }
  if (!contract_machine_id) return { error: 'Veuillez sélectionner une machine du contrat.' }

  // Validar que la línea existe y obtener cliente para autorización
  const { data: line } = await supabase
    .from('contract_machines')
    .select('id, contract_id, machine_id, contracts!inner(client_id)')
    .eq('id', contract_machine_id)
    .maybeSingle()

  if (!line) return { error: 'Ligne de contrat introuvable.' }

  const category = parseEnum(formData.get('category'), INCIDENT_CATEGORIES)
  const priority = parseEnum(formData.get('priority'), INCIDENT_PRIORITIES)
  if (!category) return { error: 'Catégorie invalide.' }
  if (!priority) return { error: 'Priorité invalide.' }

  const assigned_to = ((formData.get('assigned_to') as string) ?? '').trim() || null
  const status = assigned_to ? 'assigné' : 'nouveau'

  const { data: incident, error } = await supabase
    .from('incidents')
    .insert({
      contract_machine_id,
      machine_id: null,             // forzar NULL por XOR
      opened_by: user.id,
      assigned_to,
      title,
      description: ((formData.get('description') as string) ?? '').trim() || null,
      category,
      priority,
      status,
    } as any)
    .select('id')
    .single()

  if (error) return { error: error.message }

  if (incident) {
    await supabase.from('incident_history').insert({
      incident_id: incident.id,
      changed_by: user.id,
      old_status: null,
      new_status: status,
      comment: 'Incident créé',
    })
  }

  redirect('/admin/incidents')
}
