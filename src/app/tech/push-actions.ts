'use server'

import { requireTechnician } from '@/lib/auth'
import { createAdminClient } from '@/lib/supabase/admin'
import { isAllowedPushEndpoint, parseSubscription } from '@/lib/pwa/push'

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

// Al cerrar sesión en un móvil compartido: deja de enviar avisos del técnico que se va a ESTE
// aparato. Solo toca la fila si el endpoint es del técnico conectado (filtro por user_id además
// del endpoint) — nadie puede apagar los avisos de otro. Si el siguiente técnico entra, la
// re-suscripción silenciosa de PushToggle reasigna la fila y la reactiva (disabled_at: null).
export async function disablePushSubscription(endpoint: string): Promise<void> {
  const { user } = await requireTechnician()
  if (!isAllowedPushEndpoint(endpoint)) return

  const admin = createAdminClient()
  const { error } = await admin
    .from('push_subscriptions')
    .update({ disabled_at: new Date().toISOString() })
    .eq('endpoint', endpoint)
    .eq('user_id', user.id)
  if (error) console.error('[push] disablePushSubscription', error)
}
