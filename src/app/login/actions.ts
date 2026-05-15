'use server'

import { createClient } from '@/lib/supabase/server'
import { headers } from 'next/headers'
import { redirect } from 'next/navigation'
import { checkRateLimit, getClientIp } from '@/lib/rate-limit'

type AuthState = { error: string } | null

export async function signInWithEmail(
  _prev: AuthState,
  formData: FormData
): Promise<AuthState> {
  const email = (formData.get('email') as string ?? '').trim().toLowerCase()
  const ip = await getClientIp()
  const ok = await checkRateLimit('login', `${ip}:${email}`)
  if (!ok) return { error: 'Trop de tentatives. Réessayez dans quelques minutes.' }

  const supabase = await createClient()

  const { error } = await supabase.auth.signInWithPassword({
    email,
    password: formData.get('password') as string,
  })

  if (error) return { error: 'Email ou mot de passe incorrect.' }

  redirect('/dashboard')
}

export async function signInWithGoogle(): Promise<void> {
  const supabase = await createClient()
  const origin = (await headers()).get('origin')

  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: {
      redirectTo: `${origin}/auth/callback`,
    },
  })

  if (error || !data.url) redirect('/login?error=oauth')

  redirect(data.url)
}

export async function registerClientAction(
  _prev: AuthState,
  formData: FormData
): Promise<AuthState> {
  const ip = await getClientIp()
  const ok = await checkRateLimit('signup', ip)
  if (!ok) return { error: 'Trop de tentatives. Réessayez plus tard.' }

  const supabase = await createClient()

  const email    = (formData.get('email')    as string).trim()
  const password = (formData.get('password') as string)
  const confirm  = (formData.get('confirm')  as string)

  if (password !== confirm) return { error: 'Les mots de passe ne correspondent pas.' }
  if (password.length < 8)  return { error: 'Le mot de passe doit contenir au moins 8 caractères.' }

  const h = await headers()
  const host  = h.get('x-forwarded-host') ?? h.get('host') ?? 'localhost:3000'
  const proto = h.get('x-forwarded-proto') ?? 'http'
  const origin = process.env.NEXT_PUBLIC_APP_URL ?? `${proto}://${host}`

  const { error } = await supabase.auth.signUp({
    email,
    password,
    options: { emailRedirectTo: `${origin}/auth/callback` },
  })

  if (error) {
    if (error.message.includes('already registered')) return { error: 'Cet email est déjà utilisé.' }
    console.error('[registerClient]', error)
    return { error: 'Une erreur est survenue. Veuillez réessayer.' }
  }

  redirect('/login?message=confirm-email')
}

export async function signOut(): Promise<void> {
  const supabase = await createClient()
  await supabase.auth.signOut()
  redirect('/login')
}
