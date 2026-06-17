'use server'

import { requireAdmin } from '@/lib/auth'
import { getLineForMachineAtDate } from '@/lib/contract-machines'
import { revalidatePath } from 'next/cache'

export type CounterFormState = { error?: string; success?: boolean } | null

export async function saveCounterAction(
  _prev: CounterFormState,
  formData: FormData
): Promise<CounterFormState> {
  const { user, supabase } = await requireAdmin()

  const machine_id           = formData.get('machine_id') as string
  const year                 = parseInt(formData.get('year') as string)
  const month                = parseInt(formData.get('month') as string)
  const day                  = parseInt(formData.get('day') as string)
  const counter_bw           = parseInt(formData.get('counter_bw') as string)
  const counter_color        = parseInt(formData.get('counter_color') as string)
  const notes                = ((formData.get('notes') as string | null) ?? '').trim() || null
  const is_replacement_start = formData.get('is_replacement_start') === 'on'
  const previous_machine_id  = ((formData.get('previous_machine_id') as string | null) ?? '').trim() || null

  if (isNaN(counter_bw) || isNaN(counter_color)) return { error: 'Les compteurs doivent être des nombres valides.' }
  if (counter_bw < 0 || counter_color < 0)       return { error: 'Les compteurs ne peuvent pas être négatifs.' }
  // Fecha real OBLIGATORIA (el modelo ancla la lectura a su fecha; day NOT NULL en BD).
  if (isNaN(year) || isNaN(month) || isNaN(day)) return { error: 'La date du relevé (jour/mois/année) est obligatoire.' }
  const probe = new Date(year, month - 1, day)
  if (month < 1 || month > 12 || day < 1 || probe.getMonth() !== month - 1) {
    return { error: 'Date de relevé invalide (ce jour n’existe pas dans ce mois).' }
  }
  const reading_date = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`

  // Una lectura activa por máquina y DÍA. Otra del mismo día = corrección → anular la anterior primero.
  const { data: existing } = await supabase
    .from('machine_counters')
    .select('id')
    .eq('machine_id', machine_id)
    .eq('year', year)
    .eq('month', month)
    .eq('day', day)
    .eq('status', 'actif')
    .maybeSingle()

  if (existing) return { error: `Un relevé actif existe déjà pour ce jour. Annulez-le d'abord pour le corriger.` }

  // Atribución por la línea VIGENTE EN LA FECHA del relevé (no «la línea abierta hoy»).
  const line = await getLineForMachineAtDate(supabase, machine_id, reading_date)
  let contract_id: string | null = null
  let client_id_val: number | null = null
  if (line) {
    const { data: contractRow } = await supabase
      .from('contracts')
      .select('id, client_id')
      .eq('id', line.contract_id)
      .single()
    contract_id = contractRow?.id ?? null
    client_id_val = contractRow?.client_id ?? null
  }

  const { error } = await supabase.from('machine_counters').insert({
    machine_id,
    contract_id:          contract_id,
    contract_machine_id:  line?.id ?? null,
    client_id:            client_id_val,
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
    if (error.code === '23505') {
      return { error: `Un relevé actif existe déjà pour ce jour. Annulez-le d'abord pour le corriger.` }
    }
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
  const { user, supabase } = await requireAdmin()
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
