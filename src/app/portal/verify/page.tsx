'use client'

import { useActionState } from 'react'
import { verifyContractAction } from './actions'
import { Loader2, FileText } from 'lucide-react'

export default function VerifyPage() {
  const [state, action, pending] = useActionState(verifyContractAction, null)

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center px-4">
      <div className="w-full max-w-md">

        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-12 h-12 rounded-xl mb-4 bg-red-50">
            <FileText size={22} style={{ color: '#BF0D0D' }} />
          </div>
          <h1 className="text-2xl font-semibold text-gray-900" style={{ fontFamily: 'Poppins, sans-serif' }}>
            Vérification du contrat
          </h1>
          <p className="text-sm text-gray-500 mt-2">
            Saisissez votre numéro de contrat pour accéder à votre espace client.
            <br />Vous le trouverez sur vos documents AMD Service.
          </p>
        </div>

        <div className="bg-white rounded-2xl border border-gray-200 p-8 shadow-sm">
          {state?.error && (
            <div className="mb-5 px-4 py-3 rounded-lg bg-red-50 border border-red-200 text-sm text-red-700">
              {state.error}
            </div>
          )}

          <form action={action} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">
                Numéro de contrat <span className="text-red-500">*</span>
              </label>
              <input
                name="numero_contrat"
                type="text"
                required
                placeholder="AMD-2026-001"
                className="w-full px-3.5 py-2.5 rounded-lg border border-gray-300 text-sm text-gray-900 placeholder-gray-400 font-mono focus:outline-none focus:ring-2 focus:ring-red-500 focus:border-transparent"
              />
            </div>
            <button
              type="submit"
              disabled={pending}
              className="w-full flex items-center justify-center gap-2 py-2.5 px-4 rounded-lg text-sm font-medium text-white transition-opacity disabled:opacity-60"
              style={{ backgroundColor: '#BF0D0D' }}
            >
              {pending && <Loader2 size={16} className="animate-spin" />}
              Vérifier mon contrat
            </button>
          </form>
        </div>

        <p className="text-center text-xs text-gray-400 mt-6">
          Vous ne trouvez pas votre numéro ? Contactez AMD Service.
        </p>
      </div>
    </div>
  )
}
