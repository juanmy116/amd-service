'use server'

import { createClient } from '@/lib/supabase/server'
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

  const { data: contract } = await supabase
    .from('contracts')
    .select('machine_id')
    .eq('id', contract_id)
    .single()

  if (!contract) return { error: 'Contrat introuvable.' }

  const { error } = await supabase.from('incidents').insert({
    contract_id,
    machine_id:  contract.machine_id,
    opened_by:   user.id,
    title,
    description: (formData.get('description') as string).trim() || null,
    category:    formData.get('category') as string,
    priority:    formData.get('priority')  as string,
    status:      'nouveau',
  })

  if (error) return { error: error.message }

  redirect('/portal/incidents')
}
