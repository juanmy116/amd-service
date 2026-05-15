import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import type { User } from '@supabase/supabase-js'

type Role = 'admin' | 'technician' | 'client'

export type AuthContext = {
  user: User
  profile: { role: Role; full_name: string | null }
  supabase: Awaited<ReturnType<typeof createClient>>
}

async function requireRole(allowed: readonly Role[]): Promise<AuthContext> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('profiles')
    .select('role, full_name')
    .eq('id', user.id)
    .single()

  if (!profile || !allowed.includes(profile.role as Role)) redirect('/dashboard')

  return {
    user,
    profile: { role: profile.role as Role, full_name: profile.full_name },
    supabase,
  }
}

export function requireAdmin() {
  return requireRole(['admin'])
}

export function requireTechnician() {
  return requireRole(['admin', 'technician'])
}
