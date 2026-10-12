'use server'

import { createClient } from '@/lib/supabase/server'
import { checkRateLimit, getClientIp } from '@/lib/rate-limit'
import { getAppOrigin } from '@/lib/app-origin'

export type ResetRequestState = { error: string } | { sent: true } | null

export async function requestPasswordResetAction(
  _prev: ResetRequestState,
  formData: FormData
): Promise<ResetRequestState> {
  const email = ((formData.get('email') as string) ?? '').trim().toLowerCase()
  if (!email) return { error: 'Indiquez votre adresse email.' }

  const ip = await getClientIp()
  const ok = await checkRateLimit('password_reset', `${ip}:${email}`)
  if (!ok) return { error: 'Trop de demandes. Réessayez dans une heure.' }

  const supabase = await createClient()
  // El enlace del correo lo arma la plantilla «Reset Password» de Supabase
  // (supabase/templates/recovery.html) y lleva a /nouveau-mot-de-passe?token_hash=…
  // `redirectTo` solo cuenta si la plantilla usa el {{ .ConfirmationURL }} por defecto.
  const { error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: `${await getAppOrigin()}/nouveau-mot-de-passe`,
  })

  // La respuesta es la misma exista o no la cuenta, y aunque Supabase falle: no se le dice a
  // nadie qué emails tienen cuenta. El fallo queda en los logs de Vercel.
  if (error) console.error('[password-reset]', error.status, error.code, error.message)
  return { sent: true }
}
