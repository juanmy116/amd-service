'use server'

import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'

type FormState = { error: string } | null

export async function updateClientAction(
  id: number,
  _prev: FormState,
  formData: FormData
): Promise<FormState> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')
  const { data: caller } = await supabase.from('profiles').select('role').eq('id', user.id).single()
  if (caller?.role !== 'admin') redirect('/dashboard')

  const nom_client = ((formData.get('nom_client') as string) ?? '').trim()
  const ninea      = ((formData.get('ninea')      as string) ?? '').trim()
  const email      = ((formData.get('email')      as string) ?? '').trim()
  const telephone  = ((formData.get('telephone')  as string) ?? '').trim()
  const adresse    = ((formData.get('adresse')    as string) ?? '').trim()
  const ville      = ((formData.get('ville')      as string) ?? '').trim()

  if (!nom_client) return { error: 'Le nom du client est obligatoire.' }
  if (!ninea)      return { error: 'Le NINEA est obligatoire.' }
  if (!email)      return { error: "L'adresse email est obligatoire." }
  if (!telephone)  return { error: 'Le numéro de téléphone est obligatoire.' }
  if (!adresse)    return { error: "L'adresse est obligatoire." }
  if (!ville)      return { error: 'La ville est obligatoire.' }

  const { error } = await supabase.from('clients').update({
    nom_client, ninea, email, telephone, adresse, ville,
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
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')
  const { data: caller } = await supabase.from('profiles').select('role').eq('id', user.id).single()
  if (caller?.role !== 'admin') redirect('/dashboard')
  await supabase.from('clients').delete().eq('id', id)
  redirect('/admin/clients')
}
