'use server'

import { requireAdmin } from '@/lib/auth'
import { redirect } from 'next/navigation'
import { normalizeClientPhone } from '@/lib/phone'

type FormState = { error: string } | null

function str(formData: FormData, key: string) {
  return ((formData.get(key) as string) ?? '').trim()
}

export async function createClientAction(
  _prev: FormState,
  formData: FormData
): Promise<FormState> {
  const { supabase } = await requireAdmin()

  const nom_client = str(formData, 'nom_client')
  const ninea      = str(formData, 'ninea')
  const email      = str(formData, 'email')
  const telephone      = normalizeClientPhone(formData.get('telephone'))
  const telephone_fixe = normalizeClientPhone(formData.get('telephone_fixe'))
  const adresse    = str(formData, 'adresse')
  const ville      = str(formData, 'ville')
  const quartier_code = str(formData, 'quartier_code') || null

  if (!nom_client) return { error: 'Le nom du client est obligatoire.' }
  if (!ninea)      return { error: 'Le NINEA est obligatoire.' }
  if (!email)      return { error: "L'adresse email est obligatoire." }
  if (!telephone && !telephone_fixe) return { error: 'Indiquez au moins un numéro de téléphone (mobile ou fixe).' }
  if (!adresse)    return { error: "L'adresse est obligatoire." }
  if (!ville)      return { error: 'La ville est obligatoire.' }

  const { error } = await supabase.from('clients').insert({
    nom_client, ninea, email, telephone, telephone_fixe, adresse, ville, quartier_code,
    active: formData.get('active') === 'on',
  })

  if (error) {
    if (error.code === '23505') return { error: 'Ce nom de client ou NINEA existe déjà.' }
    return { error: 'Une erreur est survenue lors de la création du client. Veuillez réessayer.' }
  }

  redirect('/admin/clients')
}
