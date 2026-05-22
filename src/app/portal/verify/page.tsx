'use client'

import { useActionState } from 'react'
import { verifyContractAction } from './actions'
import { Loader2, FileText } from 'lucide-react'
import { Card } from '@/components/ui/Card'

const inputClass = 'w-full px-3.5 py-2.5 rounded-lg border border-line text-ink text-sm font-mono placeholder-ink-muted focus:outline-none focus:ring-2 focus:ring-accent/30 focus:border-accent'

export default function VerifyPage() {
  const [state, action, pending] = useActionState(verifyContractAction, null)

  return (
    <div className="min-h-screen bg-page flex items-center justify-center px-4">
      <div className="w-full max-w-md">

        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-12 h-12 rounded-xl mb-4 bg-accent-soft">
            <FileText size={22} className="text-accent" />
          </div>
          <h1 className="text-2xl font-semibold text-ink font-display">
            Vérification du contrat
          </h1>
          <p className="text-sm text-ink-muted mt-2">
            Saisissez votre numéro de contrat pour accéder à votre espace client.
            <br />Vous le trouverez sur vos documents AMD Service.
          </p>
        </div>

        <Card className="p-8">
          {state?.error && (
            <div className="mb-5 px-4 py-3 rounded-lg bg-accent-soft border border-accent/20 text-sm text-accent">
              {state.error}
            </div>
          )}

          <form action={action} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-ink-soft mb-1.5">
                Numéro de contrat <span className="text-accent">*</span>
              </label>
              <input
                name="numero_contrat"
                type="text"
                required
                placeholder="AMD-2026-001"
                className={inputClass}
              />
            </div>
            <button
              type="submit"
              disabled={pending}
              className="w-full flex items-center justify-center gap-2 py-2.5 px-4 rounded-lg text-sm font-medium text-white bg-accent transition-opacity disabled:opacity-60"
            >
              {pending && <Loader2 size={16} className="animate-spin" />}
              Vérifier mon contrat
            </button>
          </form>
        </Card>

        <p className="text-center text-xs text-ink-muted mt-6">
          Vous ne trouvez pas votre numéro ? Contactez AMD Service.
        </p>
      </div>
    </div>
  )
}
