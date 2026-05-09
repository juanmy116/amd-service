'use client'

import { useActionState } from 'react'
import { submitCsatAction } from './actions'

const STARS = [1, 2, 3, 4, 5]
const LABELS: Record<number, string> = {
  1: 'Très insatisfait',
  2: 'Insatisfait',
  3: 'Neutre',
  4: 'Satisfait',
  5: 'Très satisfait',
}

export default function CsatForm({ token }: { token: string }) {
  const boundAction = submitCsatAction.bind(null, token)
  const [state, action, pending] = useActionState(boundAction, null)

  if (state?.success) {
    return (
      <div className="text-center py-8">
        <div className="w-16 h-16 rounded-full bg-green-100 flex items-center justify-center mx-auto mb-4">
          <svg className="w-8 h-8 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
          </svg>
        </div>
        <h2 className="text-lg font-semibold text-gray-900 mb-2">Merci pour votre avis !</h2>
        <p className="text-sm text-gray-500">Votre retour nous aide à améliorer notre service.</p>
      </div>
    )
  }

  return (
    <form action={action} className="space-y-6">
      {/* Estrellas */}
      <div>
        <p className="text-sm font-medium text-gray-700 mb-3 text-center">Votre note globale</p>
        <div className="flex justify-center gap-2">
          {STARS.map((star) => (
            <label key={star} className="cursor-pointer group">
              <input type="radio" name="rating" value={star} className="sr-only peer" required />
              <svg
                className="w-10 h-10 text-gray-200 peer-checked:text-amber-400 group-hover:text-amber-300 transition-colors"
                fill="currentColor"
                viewBox="0 0 24 24"
              >
                <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />
              </svg>
              <span className="sr-only">{LABELS[star]}</span>
            </label>
          ))}
        </div>
      </div>

      {/* Comentario */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1.5">
          Commentaire <span className="text-gray-400 font-normal">(facultatif)</span>
        </label>
        <textarea
          name="comment"
          rows={3}
          placeholder="Dites-nous ce que nous pouvons améliorer..."
          className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-red-200 resize-none"
        />
      </div>

      {state?.error && (
        <p className="text-sm text-red-600 text-center">{state.error}</p>
      )}

      <button
        type="submit"
        disabled={pending}
        className="w-full py-2.5 rounded-lg text-sm font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-50"
        style={{ backgroundColor: '#BF0D0D' }}
      >
        {pending ? 'Envoi...' : 'Envoyer mon avis'}
      </button>
    </form>
  )
}
