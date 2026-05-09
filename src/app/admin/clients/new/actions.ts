'use server'

import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'

type FormState = { error: string } | null

export async function createClientAction(
  _prev: FormState,
  formData: FormData
): Promise<FormState> {
  const supabase = await createClient()

  const nom_client = (formData.get('nom_client') as string).trim()
  if (!nom_client) return { error: 'Le nom du client est obligatoire.' }

  const { error } = await supabase.from('clients').insert({
    nom_client,
    ninea:     (formData.get('ninea')     as string).trim() || null,
    email:     (formData.get('email')     as string).trim() || null,
    telephone: (formData.get('telephone') as string).trim() || null,
    adresse:   (formData.get('adresse')   as string).trim() || null,
    ville:     (formData.get('ville')     as string).trim() || null,
    active:    formData.get('active') === 'on',
  })

  if (error) {
    if (error.code === '23505') return { error: 'Ce nom de client ou NINEA existe déjà.' }
    return { error: error.message }
  }

  redirect('/admin/clients')
}
