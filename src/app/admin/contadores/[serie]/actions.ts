'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'

export type CounterFormState = { error?: string; success?: boolean } | null

export async function saveCounterAction(
  _prev: CounterFormState,
  formData: FormData
): Promise<CounterFormState> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Non authentifié' }
  const { data: caller } = await supabase.from('profiles').select('role').eq('id', user.id).single()
  if (caller?.role !== 'admin') return { error: 'Non autorisé' }

  const machine_id           = formData.get('machine_id') as string
  const year                 = parseInt(formData.get('year') as string)
  const month                = parseInt(formData.get('month') as string)
  const dayRaw               = parseInt(formData.get('day') as string)
  const day                  = !isNaN(dayRaw) && dayRaw >= 1 && dayRaw <= 31 ? dayRaw : null
  const counter_bw           = parseInt(formData.get('counter_bw') as string)
  const counter_color        = parseInt(formData.get('counter_color') as string)
  const notes                = ((formData.get('notes') as string | null) ?? '').trim() || null
  const is_replacement_start = formData.get('is_replacement_start') === 'on'
  const previous_machine_id  = ((formData.get('previous_machine_id') as string | null) ?? '').trim() || null

  if (isNaN(counter_bw) || isNaN(counter_color)) return { error: 'Les compteurs doivent être des nombres valides.' }
  if (counter_bw < 0 || counter_color < 0)       return { error: 'Les compteurs ne peuvent pas être négatifs.' }

  // Verificar que no existe ya un relevé activo para ese mes
  const { data: existing } = await supabase
    .from('machine_counters')
    .select('id')
    .eq('machine_id', machine_id)
    .eq('year', year)
    .eq('month', month)
    .eq('status', 'actif')
    .maybeSingle()

  if (existing) return { error: `Un relevé actif existe déjà pour ce mois. Annulez-le d'abord avant d'en créer un nouveau.` }

  // Capturar contrato y cliente activos en el momento del relevé
  const { data: contract } = await supabase
    .from('contracts')
    .select('id, client_id')
    .eq('machine_id', machine_id)
    .eq('statut', 'actif')
    .maybeSingle()

  const { error } = await supabase.from('machine_counters').insert({
    machine_id,
    contract_id:          contract?.id ?? null,
    client_id:            contract?.client_id ?? null,
    year,
    month,
    day,
    counter_bw,
    counter_color,
    notes,
    is_replacement_start,
    previous_machine_id:  is_replacement_start ? previous_machine_id : null,
    recorded_by:          user.id,
  })

  if (error) {
    console.error('[saveCounter]', error)
    return { error: 'Une erreur est survenue. Veuillez réessayer.' }
  }

  revalidatePath(`/admin/contadores/${encodeURIComponent(machine_id)}`)
  revalidatePath('/admin/contadores')
  return { success: true }
}

export async function cancelCounterAction(
  counterId: string,
  machineId: string,
  reason: string
): Promise<{ error?: string }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Non authentifié' }
  const { data: caller } = await supabase.from('profiles').select('role').eq('id', user.id).single()
  if (caller?.role !== 'admin') return { error: 'Non autorisé' }
  if (!reason.trim()) return { error: 'Le motif est obligatoire.' }

  const { error } = await supabase
    .from('machine_counters')
    .update({
      status:            'annule',
      annule_by:         user.id,
      annule_at:         new Date().toISOString(),
      annulation_reason: reason.trim(),
    })
    .eq('id', counterId)
    .eq('status', 'actif')

  if (error) {
    console.error('[cancelCounter]', error)
    return { error: 'Une erreur est survenue. Veuillez réessayer.' }
  }

  revalidatePath(`/admin/contadores/${encodeURIComponent(machineId)}`)
  revalidatePath('/admin/contadores')
  return {}
}
