'use server'

import { createClient } from '@/lib/supabase/server'
import { headers } from 'next/headers'
import { redirect } from 'next/navigation'

type AuthState = { error: string } | null

export async function signInWithEmail(
  _prev: AuthState,
  formData: FormData
): Promise<AuthState> {
  const supabase = await createClient()

  const { error } = await supabase.auth.signInWithPassword({
    email: formData.get('email') as string,
    password: formData.get('password') as string,
  })

  if (error) return { error: error.message }

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
  const supabase = await createClient()

  const email    = (formData.get('email')    as string).trim()
  const password = (formData.get('password') as string)
  const confirm  = (formData.get('confirm')  as string)

  if (password !== confirm) return { error: 'Les mots de passe ne correspondent pas.' }
  if (password.length < 6)  return { error: 'Le mot de passe doit contenir au moins 6 caractères.' }

  const origin = (await headers()).get('origin') ?? 'http://localhost:3000'

  const { error } = await supabase.auth.signUp({
    email,
    password,
    options: { emailRedirectTo: `${origin}/auth/callback` },
  })

  if (error) {
    if (error.message.includes('already registered')) return { error: 'Cet email est déjà utilisé.' }
    return { error: error.message }
  }

  redirect('/portal')
}

export async function signOut(): Promise<void> {
  const supabase = await createClient()
  await supabase.auth.signOut()
  redirect('/login')
}
