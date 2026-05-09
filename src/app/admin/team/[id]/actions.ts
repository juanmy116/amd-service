'use server'

import { createAdminClient } from '@/lib/supabase/admin'
import { redirect } from 'next/navigation'

type FormState = { error: string } | null

export async function updateMemberAction(
  id: string,
  _prev: FormState,
  formData: FormData
): Promise<FormState> {
  const full_name = (formData.get('full_name') as string).trim() || null
  const phone     = (formData.get('phone')     as string).trim() || null
  const role      = formData.get('role') as string

  const supabaseAdmin = createAdminClient()

  const { error } = await supabaseAdmin
    .from('profiles')
    .update({ full_name, phone, role })
    .eq('id', id)

  if (error) return { error: error.message }

  redirect('/admin/team')
}

export async function deleteMemberAction(formData: FormData): Promise<void> {
  const id = formData.get('id') as string
  const supabaseAdmin = createAdminClient()
  await supabaseAdmin.auth.admin.deleteUser(id)
  redirect('/admin/team')
}
