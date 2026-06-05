'use server'

import { requireAdmin } from '@/lib/auth'
import { createAdminClient } from '@/lib/supabase/admin'
import { CONTRACT_STATUSES, MAINTENANCE_FREQUENCIES, parseEnum } from '@/lib/enums'
import { mapRpcError } from '@/lib/contract-errors'
import { redirect } from 'next/navigation'

type FormState = { error: string } | null

type LineInput = {
  id?: string
  machine_id: string
  date_debut: string
  billing_day_override: number | null
  maintenance_frequency_override: 'mensuel' | 'trimestriel' | null
  notes: string | null
}

type RetireInput = {
  id: string
  date_fin: string
}

export async function updateContractAction(
  id: string,
  _prev: FormState,
  formData: FormData
): Promise<FormState> {
  await requireAdmin()

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

  let lines: LineInput[]
  let retire: RetireInput[]
  try {
    lines = JSON.parse((formData.get('lines') as string) ?? '[]')
    retire = JSON.parse((formData.get('retire') as string) ?? '[]')
  } catch {
    return { error: 'Liste de machines invalide.' }
  }

  for (const ln of lines) {
    if (!ln.machine_id || !ln.date_debut) {
      return { error: 'Chaque machine doit avoir un numéro de série et une date de début.' }
    }
    if (ln.billing_day_override !== null && (ln.billing_day_override < 1 || ln.billing_day_override > 31)) {
      return { error: `Jour de facturation invalide pour la machine ${ln.machine_id}.` }
    }
  }

  const payload = {
    client_id,
    date_debut,
    date_renouvellement: ((formData.get('date_renouvellement') as string) ?? '').trim() || null,
    statut,
    billing_day,
    maintenance_frequency,
    lines,
    retire,
  }

  const admin = createAdminClient()
  const { error } = await admin.rpc('update_contract_with_lines', { p_contract_id: id, payload })

  if (error) {
    console.error('[updateContract.rpc]', error)
    return { error: mapRpcError(error.message, 'Une erreur est survenue lors de la mise à jour du contrat.') }
  }

  redirect('/admin/contracts')
}

export async function deleteContractAction(
  _prev: FormState,
  formData: FormData
): Promise<FormState> {
  await requireAdmin()
  const id = formData.get('id') as string

  const admin = createAdminClient()
  const { data, error } = await admin.rpc('can_delete_contract', { p_contract_id: id })

  if (error) {
    console.error('[deleteContract.check]', error)
    return { error: 'Une erreur est survenue lors de la vérification du contrat.' }
  }

  const check = data as { can_delete: boolean; incidents: number; counters: number; maintenance: number }
  if (!check.can_delete) {
    const parts: string[] = []
    if (check.incidents > 0)   parts.push(`${check.incidents} incident(s)`)
    if (check.counters > 0)    parts.push(`${check.counters} relevé(s) de compteur`)
    if (check.maintenance > 0) parts.push(`${check.maintenance} plan(s) de maintenance`)
    return { error: `Impossible de supprimer ce contrat : ${parts.join(', ')} associé(s). Retirez-les d'abord.` }
  }

  const { error: delError } = await admin.from('contracts').delete().eq('id', id)
  if (delError) {
    console.error('[deleteContract.delete]', delError)
    return { error: 'Une erreur est survenue lors de la suppression.' }
  }

  redirect('/admin/contracts')
}
