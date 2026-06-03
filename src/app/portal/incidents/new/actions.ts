'use server'

import { createClient } from '@/lib/supabase/server'
import { INCIDENT_CATEGORIES, INCIDENT_PRIORITIES, parseEnum } from '@/lib/enums'
import { redirect } from 'next/navigation'

type FormState = { error: string } | null

export async function createPortalIncidentAction(
  _prev: FormState,
  formData: FormData
): Promise<FormState> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const title = ((formData.get('title') as string) ?? '').trim()
  const contract_machine_id = ((formData.get('contract_machine_id') as string) ?? '').trim()

  if (!title) return { error: 'Le titre est obligatoire.' }
  if (!contract_machine_id) return { error: 'Veuillez sélectionner une machine.' }

  const category = parseEnum(formData.get('category'), INCIDENT_CATEGORIES)
  const priority = parseEnum(formData.get('priority'), INCIDENT_PRIORITIES)
  if (!category) return { error: 'Catégorie invalide.' }
  if (!priority) return { error: 'Priorité invalide.' }

  // La RLS bloquea SELECT sobre líneas no propias → si no encuentra, error claro
  const { data: line } = await supabase
    .from('contract_machines')
    .select('id')
    .eq('id', contract_machine_id)
    .maybeSingle()

  if (!line) return { error: "Cette machine n'est pas accessible." }

  const { error } = await supabase.from('incidents').insert({
    contract_machine_id,
    machine_id: null,
    source: null,                     // incidencia interna
    title,
    description: ((formData.get('description') as string) ?? '').trim() || null,
    category,
    priority,
    status: 'nouveau',
    opened_by: user!.id,
  } as any)

  if (error) {
    console.error('[createPortalIncident]', error)
    return { error: 'Une erreur est survenue. Veuillez réessayer.' }
  }

  redirect('/portal/incidents')
}
