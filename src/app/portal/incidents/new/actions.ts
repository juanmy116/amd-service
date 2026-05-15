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

  const title       = (formData.get('title')       as string).trim()
  const contract_id = (formData.get('contract_id') as string).trim()

  if (!title)       return { error: 'Le titre est obligatoire.' }
  if (!contract_id) return { error: 'Veuillez sélectionner une machine.' }

  const category = parseEnum(formData.get('category'), INCIDENT_CATEGORIES)
  const priority = parseEnum(formData.get('priority'), INCIDENT_PRIORITIES)
  if (!category) return { error: 'Catégorie invalide.' }
  if (!priority) return { error: 'Priorité invalide.' }

  const { data: clientProfile } = await supabase
    .from('client_profiles')
    .select('client_id')
    .eq('profile_id', user.id)
    .single()

  if (!clientProfile) return { error: 'Profil client introuvable.' }

  const { data: contract } = await supabase
    .from('contracts')
    .select('machine_id, client_id')
    .eq('id', contract_id)
    .single()

  if (!contract) return { error: 'Contrat introuvable.' }
  if (contract.client_id !== clientProfile.client_id) return { error: 'Contrat introuvable.' }

  const { error } = await supabase.from('incidents').insert({
    contract_id,
    machine_id:  contract.machine_id,
    opened_by:   user.id,
    title,
    description: (formData.get('description') as string).trim() || null,
    category,
    priority,
    status:      'nouveau',
  })

  if (error) {
    console.error('[createPortalIncident]', error)
    return { error: 'Une erreur est survenue. Veuillez réessayer.' }
  }

  redirect('/portal/incidents')
}
