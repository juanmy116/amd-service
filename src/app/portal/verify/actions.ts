'use server'

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { redirect } from 'next/navigation'
import { checkRateLimit, getClientIp } from '@/lib/rate-limit'

type FormState = { error: string } | null

export async function verifyContractAction(
  _prev: FormState,
  formData: FormData
): Promise<FormState> {
  const supabase      = await createClient()
  const supabaseAdmin = createAdminClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const ip = await getClientIp()
  const ok = await checkRateLimit('verify', `${ip}:${user.id}`)
  if (!ok) return { error: 'Trop de tentatives. Réessayez plus tard.' }

  // Si ya está vinculado a un cliente, no permitir re-linking
  const { data: existing } = await supabaseAdmin
    .from('client_profiles')
    .select('client_id')
    .eq('profile_id', user.id)
    .maybeSingle()

  if (existing) redirect('/portal')

  const numero_contrat = (formData.get('numero_contrat') as string).trim()
  if (!numero_contrat) return { error: 'Veuillez saisir votre numéro de contrat.' }

  // Usamos admin client para bypasear RLS — el usuario aún no tiene client_profiles
  const { data: contract } = await supabaseAdmin
    .from('contracts')
    .select('id, client_id, statut')
    .eq('numero_contrat', numero_contrat)
    .single()

  if (!contract)                   return { error: 'Numéro de contrat introuvable.' }
  if (contract.statut !== 'actif') return { error: "Ce contrat n'est plus actif. Contactez AMD Service." }

  // Verificar que el email del cliente en BD coincide con el del usuario autenticado.
  // Previene que un usuario vincule su cuenta a cualquier contrato conociendo solo el número.
  const { data: client } = await supabaseAdmin
    .from('clients')
    .select('email, active')
    .eq('id', contract.client_id)
    .single()

  if (!client || !client.active) return { error: 'Numéro de contrat introuvable.' }

  if (!client.email) {
    return { error: "Ce contrat n'est pas encore activé pour l'accès en ligne. Contactez AMD Service." }
  }

  // Error opaco: no revelar si el número existe o si el email no coincide (previene oracle)
  if (client.email.toLowerCase() !== user.email?.toLowerCase()) {
    return { error: 'Numéro de contrat introuvable.' }
  }

  const { error } = await supabase
    .from('client_profiles')
    .upsert({ profile_id: user.id, client_id: contract.client_id, verified_at: new Date().toISOString() })

  if (error) return { error: error.message }

  redirect('/portal')
}
