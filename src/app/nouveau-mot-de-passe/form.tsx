'use client'

import { useActionState } from 'react'
import Link from 'next/link'
import { Loader2 } from 'lucide-react'
import { PASSWORD_MIN_LENGTH } from '@/lib/password'
import { setNewPasswordAction } from './actions'

const inputClass = "w-full px-3.5 py-2.5 rounded-lg border border-line text-sm text-ink placeholder-ink-muted focus:outline-none focus:ring-2 focus:ring-accent/30 focus:border-accent transition"

export default function NewPasswordForm({ tokenHash }: { tokenHash: string }) {
  const [state, action, pending] = useActionState(setNewPasswordAction, null)

  if (state?.relink) return <RelinkMessage message={state.error} />

  return (
    <>
      {state?.error && (
        <div className="mb-5 px-4 py-3 rounded-lg bg-accent-soft border border-accent/20 text-sm text-accent">
          {state.error}
        </div>
      )}
      <form action={action} className="space-y-4">
        <input type="hidden" name="token_hash" value={tokenHash} />
        <div>
          <label htmlFor="password" className="block text-sm font-medium text-ink-soft mb-1.5">Nouveau mot de passe</label>
          <input id="password" name="password" type="password" autoComplete="new-password" required minLength={PASSWORD_MIN_LENGTH} className={inputClass} placeholder={`Min. ${PASSWORD_MIN_LENGTH} caractères`} />
        </div>
        <div>
          <label htmlFor="confirm" className="block text-sm font-medium text-ink-soft mb-1.5">Confirmer le mot de passe</label>
          <input id="confirm" name="confirm" type="password" autoComplete="new-password" required className={inputClass} placeholder="••••••••" />
        </div>
        <button type="submit" disabled={pending} className="w-full flex items-center justify-center gap-2 py-2.5 px-4 rounded-lg text-sm font-medium text-white bg-accent transition-opacity disabled:opacity-60 mt-2">
          {pending && <Loader2 size={16} className="animate-spin" />}
          Enregistrer
        </button>
      </form>
    </>
  )
}

export function RelinkMessage({ message }: { message: string }) {
  return (
    <div className="space-y-4 text-sm">
      <p className="text-ink">{message}</p>
      <Link href="/mot-de-passe-oublie" className="w-full flex items-center justify-center py-2.5 px-4 rounded-lg text-sm font-medium text-white bg-accent">
        Recevoir un nouveau lien
      </Link>
    </div>
  )
}
