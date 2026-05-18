import { createClient, SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { getSecretKey } from './secret-key.ts'

export function getAdminClient(): SupabaseClient {
  const url    = Deno.env.get('SUPABASE_URL') ?? ''
  const secret = getSecretKey()
  return createClient(url, secret, {
    auth: { autoRefreshToken: false, persistSession: false },
  })
}

export async function updateHealth(
  db: SupabaseClient,
  functionName: string,
  success: boolean,
  errorMessage?: string
): Promise<void> {
  if (success) {
    await db.from('princity_health').update({
      last_success_at:    new Date().toISOString(),
      last_error_message: null,
      alert_sent:         false,
    }).eq('function_name', functionName)
  } else {
    await db.from('princity_health').update({
      last_error_at:      new Date().toISOString(),
      last_error_message: errorMessage ?? 'Unknown error',
    }).eq('function_name', functionName)
  }
}

export async function writeLog(
  db: SupabaseClient,
  opts: {
    functionName:     string
    endpointCalled?:  string
    status:           'success' | 'partial' | 'error'
    recordsProcessed: number
    recordsCreated:   number
    errorMessage?:    string
  }
): Promise<void> {
  await db.from('princity_api_logs').insert({
    function_name:     opts.functionName,
    endpoint_called:   opts.endpointCalled,
    status:            opts.status,
    records_processed: opts.recordsProcessed,
    records_created:   opts.recordsCreated,
    error_message:     opts.errorMessage,
  })
}
