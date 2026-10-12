'use server'

import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { validateNewPassword } from '@/lib/password'

// `relink`: el enlace ya no sirve (caducado, usado, o gastado en un intento fallido) → la
// pantalla ofrece pedir otro correo en vez del formulario.
export type NewPasswordState = { error: string; relink?: boolean } | null

const EXPIRED = 'Ce lien a expiré ou a déjà été utilisé. Demandez-en un nouveau.'

export async function setNewPasswordAction(
  _prev: NewPasswordState,
  formData: FormData
): Promise<NewPasswordState> {
  const tokenHash = ((formData.get('token_hash') as string) ?? '').trim()
  const password = (formData.get('password') as string) ?? ''
  const confirm  = (formData.get('confirm')  as string) ?? ''

  // Antes de canjear el enlace: solo vale una vez.
  const invalid = validateNewPassword(password, confirm)
  if (invalid) return { error: invalid }
  if (!tokenHash) return { error: EXPIRED, relink: true }

  const supabase = await createClient()

  // El enlace se canjea aquí, al enviar el formulario, y no al abrir la página: los antivirus de
  // correo de empresa (Outlook / Microsoft 365) abren los enlaces antes que la persona y lo
  // habrían gastado. Abrir la página no consume nada.
  const { error: otpError } = await supabase.auth.verifyOtp({ type: 'recovery', token_hash: tokenHash })
  if (otpError) return { error: EXPIRED, relink: true }

  const { error } = await supabase.auth.updateUser({ password })
  // `same_password`: ha escrito la que ya tenía. No se cambia nada, pero ya la conoce: vale.
  if (error && error.code !== 'same_password') {
    console.error('[new-password]', error.status, error.code, error.message)
    // Solo la sesión de recuperación de este navegador: la contraseña no ha cambiado, así que las
    // demás sesiones (p. ej. la app del iPhone) siguen siendo legítimas.
    await supabase.auth.signOut({ scope: 'local' })
    return {
      error: error.code === 'weak_password'
        ? 'Ce mot de passe est trop faible. Demandez un nouveau lien et choisissez-en un plus long.'
        : 'Le mot de passe n\'a pas pu être enregistré. Demandez un nouveau lien.',
      relink: true,
    }
  }

  // Cierra TODAS las sesiones de la cuenta (también la de quien la estuviera usando sin permiso)
  // y la persona entra con la contraseña nueva, que así queda probada.
  const { error: signOutError } = await supabase.auth.signOut({ scope: 'global' })
  if (signOutError) {
    // Si Supabase falla (5xx, red), auth-js devuelve el error SIN borrar nada: las demás sesiones
    // siguen vivas. La contraseña ya está cambiada; al menos se cierra la de este navegador y
    // queda rastro en los logs de Vercel.
    console.error('[new-password] no se pudieron cerrar todas las sesiones', signOutError.status, signOutError.message)
    await supabase.auth.signOut({ scope: 'local' })
  }
  redirect('/login?message=mot-de-passe-modifie')
}
