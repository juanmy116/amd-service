'use server'

import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'

type FormState = { error: string } | null

const VALID_ROLES = new Set(['admin', 'technician'])

export async function updateMemberAction(
  id: string,
  _prev: FormState,
  formData: FormData
): Promise<FormState> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')
  const { data: caller } = await supabase.from('profiles').select('role').eq('id', user.id).single()
  if (caller?.role !== 'admin') redirect('/dashboard')

  const full_name = (formData.get('full_name') as string).trim() || null
  const phone     = (formData.get('phone')     as string).trim() || null
  const role      = formData.get('role') as string

  if (!VALID_ROLES.has(role)) return { error: 'Rôle invalide.' }

  const supabaseAdmin = createAdminClient()

  const { error } = await supabaseAdmin
    .from('profiles')
    .update({ full_name, phone, role })
    .eq('id', id)

  if (error) return { error: error.message }

  redirect('/admin/team')
}

export async function deleteMemberAction(formData: FormData): Promise<void> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')
  const { data: caller } = await supabase.from('profiles').select('role').eq('id', user.id).single()
  if (caller?.role !== 'admin') redirect('/dashboard')

  const id = formData.get('id') as string
  const supabaseAdmin = createAdminClient()
  await supabaseAdmin.auth.admin.deleteUser(id)
  redirect('/admin/team')
}
