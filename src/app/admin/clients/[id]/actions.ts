'use server'

import { requireAdmin } from '@/lib/auth'
import { redirect } from 'next/navigation'
import { normalizeClientPhone } from '@/lib/phone'

type FormState = { error: string } | null

export async function updateClientAction(
  id: number,
  _prev: FormState,
  formData: FormData
): Promise<FormState> {
  const { supabase } = await requireAdmin()

  const nom_client = ((formData.get('nom_client') as string) ?? '').trim()
  const ninea      = ((formData.get('ninea')      as string) ?? '').trim()
  const email      = ((formData.get('email')      as string) ?? '').trim()
  const telephone      = normalizeClientPhone(formData.get('telephone'))
  const telephone_fixe = normalizeClientPhone(formData.get('telephone_fixe'))
  const adresse    = ((formData.get('adresse')    as string) ?? '').trim()
  const ville      = ((formData.get('ville')      as string) ?? '').trim()
  const quartier_code = ((formData.get('quartier_code') as string) ?? '').trim() || null

  if (!nom_client) return { error: 'Le nom du client est obligatoire.' }
  if (!ninea)      return { error: 'Le NINEA est obligatoire.' }
  if (!email)      return { error: "L'adresse email est obligatoire." }
  if (!telephone && !telephone_fixe) return { error: 'Indiquez au moins un numéro de téléphone (mobile ou fixe).' }
  if (!adresse)    return { error: "L'adresse est obligatoire." }
  if (!ville)      return { error: 'La ville est obligatoire.' }

  const { error } = await supabase.from('clients').update({
    nom_client, ninea, email, telephone, telephone_fixe, adresse, ville, quartier_code,
    active: formData.get('active') === 'on',
  }).eq('id', id)

  if (error) {
    if (error.code === '23505') return { error: 'Ce nom de client ou NINEA existe déjà.' }
    return { error: 'Une erreur est survenue lors de la mise à jour. Veuillez réessayer.' }
  }

  redirect('/admin/clients')
}

export async function deleteClientAction(formData: FormData): Promise<void> {
  const id = Number(formData.get('id'))
  const { supabase } = await requireAdmin()
  await supabase.from('clients').delete().eq('id', id)
  redirect('/admin/clients')
}
