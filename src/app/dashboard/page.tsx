import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'

export default async function Dashboard() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('profiles')
    .select('role, is_dispatcher')
    .eq('id', user.id)
    .single()

  if (profile?.is_dispatcher) redirect('/atelier')
  if (profile?.role === 'admin') redirect('/admin')
  if (profile?.role === 'technician') redirect('/tech')
  if (profile?.role === 'client') redirect('/portal')

  redirect('/login')
}
