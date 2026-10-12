'use client'

import { useActionState } from 'react'
import { Loader2 } from 'lucide-react'
import { requestPasswordResetAction } from './actions'

const inputClass = "w-full px-3.5 py-2.5 rounded-lg border border-line text-sm text-ink placeholder-ink-muted focus:outline-none focus:ring-2 focus:ring-accent/30 focus:border-accent transition"

export default function ForgotPasswordForm() {
  const [state, action, pending] = useActionState(requestPasswordResetAction, null)

  if (state && 'sent' in state) {
    return (
      <div className="space-y-3 text-sm text-ink">
        <p className="font-medium">Vérifiez votre boîte email.</p>
        <p className="text-ink-soft">
          Si un compte existe pour cette adresse, vous allez recevoir un email avec un lien pour
          choisir un nouveau mot de passe. Le lien ne fonctionne qu&apos;une fois et pendant une
          durée limitée.
        </p>
        <p className="text-ink-muted text-xs">Rien reçu ? Regardez dans les spams.</p>
      </div>
    )
  }

  return (
    <>
      {state?.error && (
        <div className="mb-5 px-4 py-3 rounded-lg bg-accent-soft border border-accent/20 text-sm text-accent">
          {state.error}
        </div>
      )}
      <form action={action} className="space-y-4">
        <div>
          <label htmlFor="email" className="block text-sm font-medium text-ink-soft mb-1.5">Email</label>
          <input id="email" name="email" type="email" autoComplete="email" required className={inputClass} placeholder="vous@entreprise.com" />
        </div>
        <button type="submit" disabled={pending} className="w-full flex items-center justify-center gap-2 py-2.5 px-4 rounded-lg text-sm font-medium text-white bg-accent transition-opacity disabled:opacity-60 mt-2">
          {pending && <Loader2 size={16} className="animate-spin" />}
          Recevoir le lien
        </button>
      </form>
    </>
  )
}
