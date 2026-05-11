'use server'

import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'

type FormState = { error: string } | null

function str(formData: FormData, key: string) {
  return ((formData.get(key) as string) ?? '').trim()
}

export async function createClientAction(
  _prev: FormState,
  formData: FormData
): Promise<FormState> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')
  const { data: caller } = await supabase.from('profiles').select('role').eq('id', user.id).single()
  if (caller?.role !== 'admin') redirect('/dashboard')

  const nom_client = str(formData, 'nom_client')
  const ninea      = str(formData, 'ninea')
  const email      = str(formData, 'email')
  const telephone  = str(formData, 'telephone')
  const adresse    = str(formData, 'adresse')
  const ville      = str(formData, 'ville')

  if (!nom_client) return { error: 'Le nom du client est obligatoire.' }
  if (!ninea)      return { error: 'Le NINEA est obligatoire.' }
  if (!email)      return { error: "L'adresse email est obligatoire." }
  if (!telephone)  return { error: 'Le numéro de téléphone est obligatoire.' }
  if (!adresse)    return { error: "L'adresse est obligatoire." }
  if (!ville)      return { error: 'La ville est obligatoire.' }

  const { error } = await supabase.from('clients').insert({
    nom_client, ninea, email, telephone, adresse, ville,
    active: formData.get('active') === 'on',
  })

  if (error) {
    if (error.code === '23505') return { error: 'Ce nom de client ou NINEA existe déjà.' }
    return { error: 'Une erreur est survenue lors de la création du client. Veuillez réessayer.' }
  }

  redirect('/admin/clients')
}
