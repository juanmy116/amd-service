'use server'

import { requireAdmin } from '@/lib/auth'
import { CONTRACT_STATUSES, MAINTENANCE_FREQUENCIES, parseEnum } from '@/lib/enums'
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
  const { supabase } = await requireAdmin()

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

  // Parsear líneas serializadas en formData (formato JSON en el campo "lines")
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

  // 1. Insert contract
  const { data: contractRow, error: contractError } = await supabase
    .from('contracts')
    .insert({
      numero_contrat,
      client_id,
      date_debut,
      date_renouvellement,
      statut,
      billing_day,
      maintenance_frequency,
    })
    .select('id')
    .single()

  if (contractError || !contractRow) {
    if (contractError?.code === '23505') return { error: 'Ce numéro de contrat existe déjà.' }
    console.error('[createContract]', contractError)
    return { error: 'Une erreur est survenue lors de la création du contrat.' }
  }

  // 2. Insert lines
  const linesPayload = lines.map((ln) => ({
    contract_id: contractRow.id,
    machine_id: ln.machine_id,
    date_debut: ln.date_debut,
    statut: 'actif' as const,
    billing_day_override: ln.billing_day_override,
    maintenance_frequency_override: ln.maintenance_frequency_override,
    notes: ln.notes,
  }))

  const { error: linesError } = await supabase.from('contract_machines').insert(linesPayload as any)

  if (linesError) {
    // Rollback manual del contract recién creado
    await supabase.from('contracts').delete().eq('id', contractRow.id)
    if (linesError.code === '23505') {
      return { error: 'Une ou plusieurs machines sont déjà assignées à un autre contrat actif.' }
    }
    console.error('[createContract.lines]', linesError)
    return { error: "Une erreur est survenue lors de l'ajout des machines." }
  }

  redirect('/admin/contracts')
}
