'use server'

import { requireAdmin } from '@/lib/auth'
import { createAdminClient } from '@/lib/supabase/admin'
import { CONTRACT_STATUSES, MAINTENANCE_FREQUENCIES, parseEnum } from '@/lib/enums'
import { mapRpcError } from '@/lib/contract-errors'
import { redirect } from 'next/navigation'

type FormState = { error: string } | null

type LineInput = {
  machine_id: string
  date_debut: string
  billing_day_override: number | null
  maintenance_frequency_override: 'mensuel' | 'trimestriel' | null
  notes: string | null
}

export async function createContractAction(
  _prev: FormState,
  formData: FormData
): Promise<FormState> {
  await requireAdmin()

  const numero_contrat = ((formData.get('numero_contrat') as string) ?? '').trim()
  const client_id = Number(formData.get('client_id'))
  const date_debut = ((formData.get('date_debut') as string) ?? '').trim()
  const date_renouvellement = ((formData.get('date_renouvellement') as string) ?? '').trim() || null
  const statut = parseEnum(formData.get('statut'), CONTRACT_STATUSES)
  const billing_day_raw = ((formData.get('billing_day') as string) ?? '').trim()
  const billing_day = billing_day_raw ? Number(billing_day_raw) : null
  const maintenance_frequency = parseEnum(formData.get('maintenance_frequency'), MAINTENANCE_FREQUENCIES) ?? null

  if (!numero_contrat) return { error: 'Le numéro de contrat est obligatoire.' }
  if (!client_id) return { error: 'Veuillez sélectionner un client.' }
  if (!date_debut) return { error: 'La date de début est obligatoire.' }
  if (!statut) return { error: 'Statut invalide.' }
  if (billing_day !== null && (billing_day < 1 || billing_day > 31)) {
    return { error: 'Le jour de facturation doit être entre 1 et 31.' }
  }

  const linesRaw = (formData.get('lines') as string) ?? '[]'
  let lines: LineInput[]
  try {
    lines = JSON.parse(linesRaw)
  } catch {
    return { error: 'Liste de machines invalide.' }
  }
  if (!Array.isArray(lines) || lines.length === 0) {
    return { error: 'Veuillez ajouter au moins une machine au contrat.' }
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
    numero_contrat,
    client_id,
    date_debut,
    date_renouvellement,
    statut,
    billing_day,
    maintenance_frequency,
    lines,
  }

  const admin = createAdminClient()
  const { error } = await admin.rpc('create_contract_with_lines', { payload })

  if (error) {
    console.error('[createContract.rpc]', error)
    return { error: mapRpcError(error.message, 'Une erreur est survenue lors de la création du contrat.') }
  }

  redirect('/admin/contracts')
}
