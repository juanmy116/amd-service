'use server'

import { requireAdmin } from '@/lib/auth'
import { createAdminClient } from '@/lib/supabase/admin'
import { redirect } from 'next/navigation'

type FormState = { error: string } | null

const VALID_ROLES = new Set(['admin', 'technician'])

export async function updateMemberAction(
  id: string,
  _prev: FormState,
  formData: FormData
): Promise<FormState> {
  await requireAdmin()

  const full_name = (formData.get('full_name') as string).trim() || null
  const phone     = (formData.get('phone')     as string).trim() || null
  const role      = formData.get('role') as string

  if (!VALID_ROLES.has(role)) return { error: 'Rôle invalide.' }

  const supabaseAdmin = createAdminClient()

  const { error } = await supabaseAdmin
    .from('profiles')
    .update({ full_name, phone, role })
    .eq('id', id)

  if (error) {
    console.error('[updateMember]', error)
    return { error: 'Une erreur est survenue. Veuillez réessayer.' }
  }

  redirect('/admin/team')
}

export async function deleteMemberAction(formData: FormData): Promise<void> {
  await requireAdmin()

  const id = formData.get('id') as string
  const supabaseAdmin = createAdminClient()
  await supabaseAdmin.auth.admin.deleteUser(id)
  redirect('/admin/team')
}
