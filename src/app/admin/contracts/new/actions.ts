'use server'

import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'

type FormState = { error: string } | null

export async function createContractAction(
  _prev: FormState,
  formData: FormData
): Promise<FormState> {
  const supabase = await createClient()

  const numero_contrat = (formData.get('numero_contrat') as string).trim()
  const client_id = Number(formData.get('client_id'))
  const machine_id = (formData.get('machine_id') as string).trim()
  const date_debut = (formData.get('date_debut') as string).trim()

  if (!numero_contrat) return { error: 'Le numéro de contrat est obligatoire.' }
  if (!client_id)      return { error: 'Veuillez sélectionner un client.' }
  if (!machine_id)     return { error: 'Veuillez sélectionner une machine.' }
  if (!date_debut)     return { error: 'La date de début est obligatoire.' }

  const date_renouvellement = (formData.get('date_renouvellement') as string).trim() || null
  const lieu_installation   = (formData.get('lieu_installation')   as string).trim() || null
  const statut              = formData.get('statut') as string

  const { error } = await supabase.from('contracts').insert({
    numero_contrat,
    client_id,
    machine_id,
    date_debut,
    date_renouvellement,
    lieu_installation,
    statut,
  })

  if (error) {
    if (error.code === '23505') return { error: 'Ce numéro de contrat existe déjà.' }
    return { error: error.message }
  }

  redirect('/admin/contracts')
}
