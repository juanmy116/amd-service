import 'server-only'
import { createAdminClient } from '@/lib/supabase/admin'

// CAPA 1 — candado de facturación (fase de prueba del SAV).
// Fuente de verdad: billing_settings.billing_enabled (BD). Mientras esté APAGADO, la app oculta los
// botones de emisión y la Server Action rechaza; el trigger BEFORE INSERT en `invoices` es la
// barrera final en BD. Para encender:
//   UPDATE public.billing_settings SET billing_enabled = true, updated_at = now() WHERE id;
export async function isBillingEnabled(): Promise<boolean> {
  const admin = createAdminClient()
  const { data, error } = await admin
    .from('billing_settings')
    .select('billing_enabled')
    .eq('id', true)
    .maybeSingle()
  if (error) {
    // Fail-safe: ante cualquier duda al leer el flag, tratar como APAGADO (nunca emitir por error).
    console.error('[billing-lock] read', error)
    return false
  }
  return data?.billing_enabled === true
}
