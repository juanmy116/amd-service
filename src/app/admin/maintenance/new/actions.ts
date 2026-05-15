'use server'

import { requireAdmin } from '@/lib/auth'
import { redirect } from 'next/navigation'

type FormState = { error: string } | null

export async function createMaintenancePlanAction(
  _prev: FormState,
  formData: FormData
): Promise<FormState> {
  const { supabase } = await requireAdmin()

  const contract_id    = (formData.get('contract_id')   as string ?? '').trim()
  const frequency      = (formData.get('frequency')     as string ?? '').trim()
  const first_visit    = (formData.get('first_visit')   as string ?? '').trim()
  const notes          = (formData.get('notes')         as string ?? '').trim() || null

  if (!contract_id) return { error: 'Veuillez sélectionner un contrat.' }
  if (!frequency)   return { error: 'La fréquence est obligatoire.' }
  if (!first_visit) return { error: 'La date de la première visite est obligatoire.' }

  // Insertar plan
  const { data: plan, error: planErr } = await supabase
    .from('maintenance_plans')
    .insert({ contract_id, frequency, notes, active: true })
    .select('id')
    .single()

  if (planErr) {
    if (planErr.code === '23505') return { error: 'Ce contrat a déjà un plan de maintenance.' }
    return { error: 'Erreur lors de la création du plan. Veuillez réessayer.' }
  }

  // Crear primera visita
  const { error: visitErr } = await supabase
    .from('maintenance_visits')
    .insert({ plan_id: plan.id, scheduled_date: first_visit, status: 'planifié' })

  if (visitErr) {
    return { error: 'Plan créé mais erreur lors de la planification de la première visite.' }
  }

  redirect('/admin/maintenance')
}
