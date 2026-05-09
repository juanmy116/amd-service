'use server'

import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'

type FormState = { error: string } | null

export async function createMachineAction(
  _prev: FormState,
  formData: FormData
): Promise<FormState> {
  const supabase = await createClient()

  const numero_serie = (formData.get('numero_serie') as string).trim()
  const marque = (formData.get('marque') as string).trim()
  const modele = (formData.get('modele') as string).trim()

  if (!numero_serie) return { error: 'Le numéro de série est obligatoire.' }
  if (!marque) return { error: 'La marque est obligatoire.' }
  if (!modele) return { error: 'Le modèle est obligatoire.' }

  const { error } = await supabase.from('machines').insert({
    numero_serie,
    marque,
    modele,
    type: formData.get('type') as 'color' | 'noir_blanc',
    localisation: (formData.get('localisation') as string).trim() || null,
    active: formData.get('active') === 'on',
  })

  if (error) {
    if (error.code === '23505') return { error: 'Ce numéro de série existe déjà.' }
    return { error: error.message }
  }

  redirect('/admin/machines')
}
