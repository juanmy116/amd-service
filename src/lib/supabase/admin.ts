import { createClient } from '@supabase/supabase-js'

// Usa SUPABASE_SECRET_KEY (formato sb_secret_*), la nueva generación de keys de Supabase
// que sustituye a la legacy SUPABASE_SERVICE_ROLE_KEY (JWT). La legacy sigue usándose en
// src/lib/email.ts como Bearer para la Edge Function send-email (verify_jwt requiere JWT).
export function createAdminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SECRET_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}
