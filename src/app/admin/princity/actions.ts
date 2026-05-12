'use server'

import { createClient }      from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { redirect }          from 'next/navigation'

type State = { status: 'idle' | 'success' | 'error'; message?: string } | null

export async function triggerInitialImportAction(_prev: State, _fd: FormData): Promise<State> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('profiles').select('role').eq('id', user.id).single()
  if (profile?.role !== 'admin') redirect('/dashboard')

  const admin = createAdminClient()
  const { error } = await admin.functions.invoke('princity-sync', {
    body: { mode: 'initial' },
  })

  if (error) return { status: 'error', message: error.message }
  return { status: 'success', message: 'Importation lancée. Vérifiez Matrix #Admin pour le résultat.' }
}
