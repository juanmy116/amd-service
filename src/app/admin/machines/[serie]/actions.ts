'use server'

import { requireAdmin } from '@/lib/auth'
import { redirect } from 'next/navigation'

type FormState = { error: string } | null

export async function updateMachineAction(
  serie: string,
  _prev: FormState,
  formData: FormData
): Promise<FormState> {
  const { supabase } = await requireAdmin()

  const marque = (formData.get('marque') as string).trim()
  const modele = (formData.get('modele') as string).trim()

  if (!marque) return { error: 'La marque est obligatoire.' }
  if (!modele) return { error: 'Le modèle est obligatoire.' }

  const { error } = await supabase.from('machines').update({
    marque,
    modele,
    type: formData.get('type') as 'color' | 'noir_blanc',
    localisation: (formData.get('localisation') as string).trim() || null,
    active: formData.get('active') === 'on',
  }).eq('numero_serie', serie)

  if (error) {
    console.error('[updateMachine]', error)
    return { error: 'Une erreur est survenue. Veuillez réessayer.' }
  }

  redirect('/admin/machines')
}

export async function deleteMachineAction(formData: FormData): Promise<void> {
  const serie = formData.get('serie') as string
  const { supabase } = await requireAdmin()
  await supabase.from('machines').delete().eq('numero_serie', serie)
  redirect('/admin/machines')
}
