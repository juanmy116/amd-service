'use server'

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { redirect } from 'next/navigation'

type FormState = { error: string } | null

export async function verifyContractAction(
  _prev: FormState,
  formData: FormData
): Promise<FormState> {
  const supabase      = await createClient()
  const supabaseAdmin = createAdminClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const numero_contrat = (formData.get('numero_contrat') as string).trim()
  if (!numero_contrat) return { error: 'Veuillez saisir votre numéro de contrat.' }

  // Usamos admin client para bypasear RLS — el usuario aún no tiene client_profiles
  const { data: contract } = await supabaseAdmin
    .from('contracts')
    .select('id, client_id, statut')
    .eq('numero_contrat', numero_contrat)
    .single()

  if (!contract)              return { error: 'Numéro de contrat introuvable.' }
  if (contract.statut !== 'actif') return { error: 'Ce contrat n\'est plus actif. Contactez AMD Service.' }

  const { error } = await supabase
    .from('client_profiles')
    .upsert({ profile_id: user.id, client_id: contract.client_id, verified_at: new Date().toISOString() })

  if (error) return { error: error.message }

  redirect('/portal')
}
