'use server'

import { requireAdmin } from '@/lib/auth'
import { CONTRACT_STATUSES, parseEnum } from '@/lib/enums'
import { redirect } from 'next/navigation'

type FormState = { error: string } | null

export async function updateContractAction(
  id: string,
  _prev: FormState,
  formData: FormData
): Promise<FormState> {
  const { supabase } = await requireAdmin()

  const client_id = Number(formData.get('client_id'))
  const machine_id = (formData.get('machine_id') as string).trim()
  const date_debut = (formData.get('date_debut') as string).trim()

  if (!client_id)  return { error: 'Veuillez sélectionner un client.' }
  if (!machine_id) return { error: 'Veuillez sélectionner une machine.' }
  if (!date_debut) return { error: 'La date de début est obligatoire.' }

  const statut = parseEnum(formData.get('statut'), CONTRACT_STATUSES)
  if (!statut) return { error: 'Statut invalide.' }

  const { error } = await supabase.from('contracts').update({
    client_id,
    machine_id,
    date_debut,
    date_renouvellement: (formData.get('date_renouvellement') as string).trim() || null,
    lieu_installation:   (formData.get('lieu_installation')   as string).trim() || null,
    statut,
  }).eq('id', id)

  if (error) {
    console.error('[updateContract]', error)
    return { error: 'Une erreur est survenue. Veuillez réessayer.' }
  }

  redirect('/admin/contracts')
}

export async function deleteContractAction(formData: FormData): Promise<void> {
  const id = formData.get('id') as string
  const { supabase } = await requireAdmin()
  await supabase.from('contracts').delete().eq('id', id)
  redirect('/admin/contracts')
}
