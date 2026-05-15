'use server'

import { requireAdmin }      from '@/lib/auth'
import { createAdminClient } from '@/lib/supabase/admin'

type State = { status: 'idle' | 'success' | 'error'; message?: string } | null

export async function triggerInitialImportAction(_prev: State, _fd: FormData): Promise<State> {
  await requireAdmin()

  const admin = createAdminClient()
  const { error } = await admin.functions.invoke('princity-sync', {
    body: { mode: 'initial' },
  })

  if (error) return { status: 'error', message: error.message }
  return { status: 'success', message: 'Importation lancée. Vérifiez Matrix #Admin pour le résultat.' }
}
