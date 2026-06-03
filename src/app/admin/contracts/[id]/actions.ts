'use server'

import { requireAdmin } from '@/lib/auth'
import { CONTRACT_STATUSES, MAINTENANCE_FREQUENCIES, parseEnum } from '@/lib/enums'
import { redirect } from 'next/navigation'

type FormState = { error: string } | null

export async function updateContractAction(
  id: string,
  _prev: FormState,
  formData: FormData
): Promise<FormState> {
  const { supabase } = await requireAdmin()

  const client_id = Number(formData.get('client_id'))
  const date_debut = ((formData.get('date_debut') as string) ?? '').trim()

  if (!client_id) return { error: 'Veuillez sélectionner un client.' }
  if (!date_debut) return { error: 'La date de début est obligatoire.' }

  const statut = parseEnum(formData.get('statut'), CONTRACT_STATUSES)
  if (!statut) return { error: 'Statut invalide.' }

  const billing_day_raw = ((formData.get('billing_day') as string) ?? '').trim()
  const billing_day = billing_day_raw ? Number(billing_day_raw) : null
  const maintenance_frequency = parseEnum(formData.get('maintenance_frequency'), MAINTENANCE_FREQUENCIES) ?? null

  if (billing_day !== null && (billing_day < 1 || billing_day > 31)) {
    return { error: 'Le jour de facturation doit être entre 1 et 31.' }
  }

  const { error: contractError } = await supabase.from('contracts').update({
    client_id,
    date_debut,
    date_renouvellement: ((formData.get('date_renouvellement') as string) ?? '').trim() || null,
    statut,
    billing_day,
    maintenance_frequency,
  }).eq('id', id)

  if (contractError) {
    console.error('[updateContract]', contractError)
    return { error: 'Une erreur est survenue. Veuillez réessayer.' }
  }

  // Gestionar líneas (diff: insert nuevas, update existentes, retire eliminadas)
  const linesRaw = (formData.get('lines') as string) ?? '[]'
  let desiredLines: Array<{
    id?: string
    machine_id: string
    date_debut: string
    date_fin?: string | null
    statut?: string
    billing_day_override?: number | null
    maintenance_frequency_override?: string | null
    notes?: string | null
  }>
  try {
    desiredLines = JSON.parse(linesRaw)
  } catch {
    return { error: 'Liste de machines invalide.' }
  }

  const { data: existingLines } = await supabase
    .from('contract_machines')
    .select('id, machine_id')
    .eq('contract_id', id)

  const desiredIds = new Set(desiredLines.filter((l) => l.id).map((l) => l.id))

  // Inserts (sin id en el cliente → líneas nuevas)
  const toInsert = desiredLines.filter((l) => !l.id)
  if (toInsert.length > 0) {
    await supabase.from('contract_machines').insert(toInsert.map((l) => ({
      contract_id: id,
      machine_id: l.machine_id,
      date_debut: l.date_debut,
      statut: 'actif',
      billing_day_override: l.billing_day_override ?? null,
      maintenance_frequency_override: l.maintenance_frequency_override ?? null,
      notes: l.notes ?? null,
    })) as any)
  }

  // Updates (id presente → líneas existentes con posibles cambios)
  for (const l of desiredLines) {
    if (!l.id) continue
    await supabase.from('contract_machines').update({
      date_debut: l.date_debut,
      date_fin: l.date_fin ?? null,
      statut: l.statut ?? 'actif',
      billing_day_override: l.billing_day_override ?? null,
      maintenance_frequency_override: l.maintenance_frequency_override ?? null,
      notes: l.notes ?? null,
    }).eq('id', l.id)
  }

  // "Retire" — líneas que existían pero no están en desired → poner date_fin=hoy + statut=terminé
  // NUNCA borrar líneas, conservar historia.
  const toRetire = (existingLines ?? []).filter((l) => !desiredIds.has(l.id))
  if (toRetire.length > 0) {
    const today = new Date().toISOString().slice(0, 10)
    await supabase.from('contract_machines').update({
      date_fin: today,
      statut: 'terminé',
    }).in('id', toRetire.map((l) => l.id))
  }

  redirect('/admin/contracts')
}

export async function deleteContractAction(formData: FormData): Promise<void> {
  const id = formData.get('id') as string
  const { supabase } = await requireAdmin()
  await supabase.from('contracts').delete().eq('id', id)
  redirect('/admin/contracts')
}
