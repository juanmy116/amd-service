'use server'

import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'

type FormState = { error: string } | null

const VALID_ROLES = new Set(['admin', 'technician'])

export async function inviteMemberAction(
  _prev: FormState,
  formData: FormData
): Promise<FormState> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')
  const { data: caller } = await supabase.from('profiles').select('role').eq('id', user.id).single()
  if (caller?.role !== 'admin') redirect('/dashboard')

  const email     = (formData.get('email')     as string).trim()
  const full_name = (formData.get('full_name') as string).trim()
  const phone     = (formData.get('phone')     as string).trim() || null
  const role      = formData.get('role') as string
  const password  = formData.get('password') as string

  if (!email)                         return { error: 'L\'email est obligatoire.' }
  if (!full_name)                     return { error: 'Le nom complet est obligatoire.' }
  if (!VALID_ROLES.has(role))         return { error: 'Rôle invalide.' }
  if (!password || password.length < 8) return { error: 'Le mot de passe doit contenir au moins 8 caractères.' }

  const supabaseAdmin = createAdminClient()

  const { data, error } = await supabaseAdmin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  })

  if (error) {
    if (error.message.includes('already been registered') || error.message.includes('already exists'))
      return { error: 'Cet email est déjà utilisé.' }
    return { error: error.message }
  }

  if (data.user) {
    await supabaseAdmin
      .from('profiles')
      .update({ role, full_name, phone })
      .eq('id', data.user.id)
  }

  redirect('/admin/team')
}
