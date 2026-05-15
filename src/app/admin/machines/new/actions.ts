'use server'

import { requireAdmin } from '@/lib/auth'
import { redirect } from 'next/navigation'

type FormState = { error: string } | null

function str(formData: FormData, key: string) {
  return ((formData.get(key) as string) ?? '').trim()
}

export async function createMachineAction(
  _prev: FormState,
  formData: FormData
): Promise<FormState> {
  const { supabase } = await requireAdmin()

  const numero_serie = str(formData, 'numero_serie')
  const marque       = str(formData, 'marque')
  const modele       = str(formData, 'modele')

  if (!numero_serie) return { error: 'Le numéro de série est obligatoire.' }
  if (!marque)       return { error: 'La marque est obligatoire.' }
  if (!modele)       return { error: 'Le modèle est obligatoire.' }

  const { error } = await supabase.from('machines').insert({
    numero_serie,
    marque,
    modele,
    type:        formData.get('type') as 'color' | 'noir_blanc',
    localisation: str(formData, 'localisation') || null,
    active:      formData.get('active') === 'on',
  })

  if (error) {
    if (error.code === '23505') return { error: 'Ce numéro de série existe déjà.' }
    return { error: 'Une erreur est survenue lors de la création de la machine. Veuillez réessayer.' }
  }

  redirect('/admin/machines')
}
