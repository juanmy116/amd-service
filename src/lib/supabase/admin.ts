import { createClient } from '@supabase/supabase-js'
import type { Database } from './types'

// Usa SUPABASE_SECRET_KEY (formato sb_secret_*), la nueva generación de keys de Supabase
// que sustituye a la legacy SUPABASE_SERVICE_ROLE_KEY (JWT).
export function createAdminClient() {
  return createClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SECRET_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}
