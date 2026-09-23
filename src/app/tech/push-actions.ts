'use server'

import { requireTechnician } from '@/lib/auth'
import { createAdminClient } from '@/lib/supabase/admin'
import { parseSubscription } from '@/lib/pwa/push'

// Guarda (o reasigna) la suscripción push de este aparato al técnico conectado. Con service_role
// porque el endpoint identifica el APARATO: si un móvil compartido cambia de técnico, la fila
// pasa al nuevo (upsert por endpoint), cosa que la RLS de un usuario no permitiría.
export async function savePushSubscription(
  input: unknown,
  userAgent: string | null,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const { user } = await requireTechnician()
  const sub = parseSubscription(input)
  if (!sub) return { ok: false, error: 'Abonnement invalide.' }

  const admin = createAdminClient()
  const { error } = await admin.from('push_subscriptions').upsert(
    {
      user_id: user.id,
      endpoint: sub.endpoint,
      p256dh: sub.p256dh,
      auth: sub.auth,
      user_agent: userAgent?.slice(0, 512) ?? null,
      last_seen_at: new Date().toISOString(),
      disabled_at: null,
      last_error: null,
    },
    { onConflict: 'endpoint' },
  )
  if (error) {
    console.error('[push] savePushSubscription', error)
    return { ok: false, error: 'Impossible d’activer les notifications.' }
  }
  return { ok: true }
}
