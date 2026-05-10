'use server'

import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'
import { headers } from 'next/headers'
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

  if (!email)                    return { error: 'L\'email est obligatoire.' }
  if (!full_name)                return { error: 'Le nom complet est obligatoire.' }
  if (!VALID_ROLES.has(role))    return { error: 'Rôle invalide.' }

  const h = await headers()
  const host  = h.get('x-forwarded-host') ?? h.get('host') ?? 'localhost:3000'
  const proto = h.get('x-forwarded-proto') ?? 'http'
  const origin = process.env.NEXT_PUBLIC_APP_URL ?? `${proto}://${host}`
  const next       = role === 'admin' ? '/admin' : '/tech'
  const redirectTo = `${origin}/auth/callback?next=${next}`

  const supabaseAdmin = createAdminClient()

  const { data, error } = await supabaseAdmin.auth.admin.inviteUserByEmail(email, { redirectTo })
  if (error) {
    if (error.message.includes('already been registered')) return { error: 'Cet email est déjà utilisé.' }
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
