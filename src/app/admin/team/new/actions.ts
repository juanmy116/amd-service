'use server'

import { requireAdmin } from '@/lib/auth'
import { STAFF_ROLES, parseEnum } from '@/lib/enums'
import { createAdminClient } from '@/lib/supabase/admin'
import { redirect } from 'next/navigation'

type FormState = { error: string } | null

export async function inviteMemberAction(
  _prev: FormState,
  formData: FormData
): Promise<FormState> {
  await requireAdmin()

  const email     = (formData.get('email')     as string).trim()
  const full_name = (formData.get('full_name') as string).trim()
  const phone     = (formData.get('phone')     as string).trim() || null
  const password  = formData.get('password') as string

  if (!email)                         return { error: 'L\'email est obligatoire.' }
  if (!full_name)                     return { error: 'Le nom complet est obligatoire.' }
  if (!password || password.length < 8) return { error: 'Le mot de passe doit contenir au moins 8 caractères.' }

  const role = parseEnum(formData.get('role'), STAFF_ROLES)
  if (!role) return { error: 'Rôle invalide.' }

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
