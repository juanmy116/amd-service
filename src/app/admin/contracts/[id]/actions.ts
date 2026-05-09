'use server'

import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'

type FormState = { error: string } | null

export async function updateContractAction(
  id: string,
  _prev: FormState,
  formData: FormData
): Promise<FormState> {
  const supabase = await createClient()

  const client_id = Number(formData.get('client_id'))
  const machine_id = (formData.get('machine_id') as string).trim()
  const date_debut = (formData.get('date_debut') as string).trim()

  if (!client_id)  return { error: 'Veuillez sélectionner un client.' }
  if (!machine_id) return { error: 'Veuillez sélectionner une machine.' }
  if (!date_debut) return { error: 'La date de début est obligatoire.' }

  const { error } = await supabase.from('contracts').update({
    client_id,
    machine_id,
    date_debut,
    date_renouvellement: (formData.get('date_renouvellement') as string).trim() || null,
    lieu_installation:   (formData.get('lieu_installation')   as string).trim() || null,
    statut:              formData.get('statut') as string,
  }).eq('id', id)

  if (error) return { error: error.message }

  redirect('/admin/contracts')
}

export async function deleteContractAction(formData: FormData): Promise<void> {
  const id = formData.get('id') as string
  const supabase = await createClient()
  await supabase.from('contracts').delete().eq('id', id)
  redirect('/admin/contracts')
}
