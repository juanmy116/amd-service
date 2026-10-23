'use server'

import { requireAdmin } from '@/lib/auth'
import { MACHINE_TYPES, parseEnum } from '@/lib/enums'
import { parseLatLng } from '@/lib/geo'
import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'

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

  const type = parseEnum(formData.get('type'), MACHINE_TYPES)
  if (!type) return { error: 'Type de machine invalide.' }

  const { error } = await supabase.from('machines').update({
    marque,
    modele,
    type,
    localisation:  ((formData.get('localisation') as string) ?? '').trim() || null,
    quartier_code: ((formData.get('quartier_code') as string) ?? '').trim() || null,
    // `active` (en service / hors service) ya no se toca desde aquí: va por
    // setMachineHorsServiceAction / returnMachineToServiceAction, con motivo y reglas.
  }).eq('numero_serie', serie)

  if (error) {
    console.error('[updateMachine]', error)
    return { error: 'Une erreur est survenue. Veuillez réessayer.' }
  }

  redirect('/admin/machines')
}

export type HorsServiceState = { error: string } | { success: true } | null

/**
 * Baja por obsolescencia («hors service»). Una máquina no se borra nunca: pasa de cliente en
 * cliente y su historial se conserva. La BD rechaza la baja si sigue en un contrato abierto
 * (trigger trg_guard_machine_hors_service, 20261023180000) y apunta la fecha.
 */
export async function setMachineHorsServiceAction(
  serie: string,
  _prev: HorsServiceState,
  formData: FormData
): Promise<HorsServiceState> {
  const { supabase, user } = await requireAdmin()

  const reason = ((formData.get('reason') as string) ?? '').trim().slice(0, 500)
  if (!reason) return { error: 'Indiquez le motif de la mise hors service.' }

  const { error } = await supabase.from('machines').update({
    active: false,
    hors_service_reason: reason,
    hors_service_by: user.id,
  }).eq('numero_serie', serie)

  if (error) {
    if (error.message.includes('machine_in_contract')) {
      return { error: "Cette machine est encore sous contrat : retirez-la du contrat ou remplacez-la d'abord." }
    }
    console.error('[setMachineHorsService]', error)
    return { error: 'Une erreur est survenue. Veuillez réessayer.' }
  }

  revalidatePath(`/admin/machines/${encodeURIComponent(serie)}`)
  revalidatePath('/admin/machines')
  return { success: true }
}

/** Deshacer una baja (p. ej. hecha por error). La BD borra fecha, motivo y autor. */
export async function returnMachineToServiceAction(
  serie: string,
  _prev: HorsServiceState,
  _formData: FormData
): Promise<HorsServiceState> {
  const { supabase } = await requireAdmin()

  const { error } = await supabase.from('machines').update({ active: true }).eq('numero_serie', serie)
  if (error) {
    console.error('[returnMachineToService]', error)
    return { error: 'Une erreur est survenue. Veuillez réessayer.' }
  }

  revalidatePath(`/admin/machines/${encodeURIComponent(serie)}`)
  revalidatePath('/admin/machines')
  return { success: true }
}

/**
 * L'admin corrige la position d'une machine : lien Google Maps ou « lat, lng » collé.
 * `location_accuracy_m` reste null (la saisie manuelle n'a pas de précision GPS) — le CHECK
 * `machines_location_complete_chk` exige seulement lat/lng/location_source ensemble.
 */
export async function setMachinePositionAction(
  serie: string,
  _prev: FormState,
  formData: FormData
): Promise<FormState> {
  const { supabase, user } = await requireAdmin()

  const text = ((formData.get('text') as string) ?? '').trim()
  const coords = parseLatLng(text)
  if (!coords) return { error: 'Lien ou coordonnées non reconnus.' }

  const { error } = await supabase.from('machines').update({
    lat: coords.lat,
    lng: coords.lng,
    location_accuracy_m: null,
    location_source: 'admin',
    location_set_at: new Date().toISOString(),
    location_set_by: user.id,
  }).eq('numero_serie', serie)

  if (error) {
    console.error('[setMachinePosition]', error)
    return { error: 'Une erreur est survenue. Veuillez réessayer.' }
  }

  revalidatePath(`/admin/machines/${encodeURIComponent(serie)}`)
  return null
}

/** Efface la position enregistrée (les 6 colonnes, ensemble — c'est ce qu'exige le CHECK). */
export async function clearMachinePositionAction(serie: string): Promise<FormState> {
  const { supabase } = await requireAdmin()

  const { error } = await supabase.from('machines').update({
    lat: null,
    lng: null,
    location_accuracy_m: null,
    location_source: null,
    location_set_at: null,
    location_set_by: null,
  }).eq('numero_serie', serie)

  if (error) {
    console.error('[clearMachinePosition]', error)
    return { error: 'Une erreur est survenue. Veuillez réessayer.' }
  }

  revalidatePath(`/admin/machines/${encodeURIComponent(serie)}`)
  return null
}
