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

  if (!profile) redirect('/login')
  if (!allowed.includes(profile.role as Role)) redirect('/dashboard')

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

// Facturación: exige ser admin Y tener el permiso `can_bill` (migración 20260911130000).
// Un admin del SAV sin el permiso gestiona todo lo demás con normalidad, pero no ve ni opera nada
// de facturación (planes tarifarios, informe mensual, facturas emitidas). Aterriza en /admin, no en
// /dashboard: sigue siendo admin, solo que esta sección no es suya.
export async function requireBilling(): Promise<AuthContext> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('profiles')
    .select('role, full_name, can_bill')
    .eq('id', user.id)
    .single()

  if (!profile) redirect('/login')
  if (profile.role !== 'admin') redirect('/dashboard')
  if (profile.can_bill !== true) redirect('/admin')

  return {
    user,
    profile: { role: profile.role as Role, full_name: profile.full_name },
    supabase,
  }
}

export type DispatcherContext = {
  user: User
  profile: { role: Role; full_name: string | null; isDispatcher: boolean }
  supabase: Awaited<ReturnType<typeof createClient>>
}

export async function requireDispatcher(): Promise<DispatcherContext> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('profiles')
    .select('role, full_name, is_dispatcher')
    .eq('id', user.id)
    .single()

  if (!profile) redirect('/login')

  const isDispatcher = profile.is_dispatcher === true
  if (profile.role !== 'admin' && !isDispatcher) redirect('/dashboard')

  return {
    user,
    profile: { role: profile.role as Role, full_name: profile.full_name, isDispatcher },
    supabase,
  }
}
