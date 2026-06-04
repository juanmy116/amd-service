'use server'

import { requireAdmin } from '@/lib/auth'
import { MAINTENANCE_FREQUENCIES, parseEnum } from '@/lib/enums'
import { getActiveLinesForContract } from '@/lib/contract-machines'
import { redirect } from 'next/navigation'

type FormState = { error: string } | null

export async function createMaintenancePlanAction(
  _prev: FormState,
  formData: FormData
): Promise<FormState> {
  const { supabase } = await requireAdmin()

  const contract_id = (formData.get('contract_id') as string ?? '').trim()
  const first_visit = (formData.get('first_visit') as string ?? '').trim()
  const notes       = (formData.get('notes')       as string ?? '').trim() || null

  if (!contract_id) return { error: 'Veuillez sélectionner un contrat.' }
  if (!first_visit) return { error: 'La date de la première visite est obligatoire.' }

  const frequency = parseEnum(formData.get('frequency'), MAINTENANCE_FREQUENCIES)
  if (!frequency) return { error: 'Fréquence invalide.' }

  // Cargar las líneas activas ANTES de crear el plan, para no dejarlo huérfano.
  const activeLines = await getActiveLinesForContract(supabase, contract_id)
  if (activeLines.length === 0) {
    return { error: "Ce contrat n'a aucune machine active. Ajoutez une machine avant de créer un plan." }
  }

  const { data: plan, error: planErr } = await supabase
    .from('maintenance_plans')
    .insert({ contract_id, frequency, notes, active: true })
    .select('id')
    .single()

  if (planErr) {
    if (planErr.code === '23505') return { error: 'Ce contrat a déjà un plan de maintenance.' }
    return { error: 'Erreur lors de la création du plan. Veuillez réessayer.' }
  }

  // Una primera visita por cada línea activa, misma fecha inicial.
  const visitsPayload = activeLines.map((line) => ({
    plan_id:             plan.id,
    contract_machine_id: line.id,
    scheduled_date:      first_visit,
    status:              'planifié' as const,
  }))

  const { error: visitErr } = await supabase
    .from('maintenance_visits')
    .insert(visitsPayload)

  if (visitErr) {
    // Rollback: borrar el plan para no dejarlo sin visitas.
    await supabase.from('maintenance_plans').delete().eq('id', plan.id)
    return { error: 'Erreur lors de la planification des visites. Veuillez réessayer.' }
  }

  redirect('/admin/maintenance')
}
