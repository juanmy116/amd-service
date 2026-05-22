'use client'

import { useActionState, useState } from 'react'
import { submitPublicIncident } from './actions'

interface Machine {
  numero_serie: string
  marque: string
  modele: string
}

type State =
  | { error: string }
  | { rateLimited: true }
  | { success: true; numeroIncident: string }
  | null

export default function SignalerForm({ machine }: { machine: Machine }) {
  const [state, formAction, pending] = useActionState<State, FormData>(
    submitPublicIncident,
    null
  )
  const [charCount, setCharCount] = useState(0)

  if (state && 'success' in state) {
    return <SuccessState numeroIncident={state.numeroIncident} />
  }

  if (state && 'rateLimited' in state) {
    return <RateLimitedState />
  }

  return (
    <>
      <div className="mb-6 bg-gray-50 rounded-xl p-4 border border-gray-100">
        <p className="text-xs text-gray-500 mb-1">Équipement</p>
        <p className="text-sm font-semibold text-gray-900">
          {machine.marque} {machine.modele}
        </p>
        <p className="text-xs text-gray-400 mt-0.5">{machine.numero_serie}</p>
      </div>

      <h1 className="text-lg font-semibold text-gray-900 mb-1">Signaler un incident</h1>
      <p className="text-sm text-gray-500 mb-6">
        Remplissez le formulaire et notre équipe vous contactera.
      </p>

      <form action={formAction} className="space-y-4">
        <input type="hidden" name="serie" value={machine.numero_serie} />

        <div>
          <label htmlFor="contact_name" className="block text-sm font-medium text-gray-700 mb-1">
            Nom <span style={{ color: '#BF0D0D' }}>*</span>
          </label>
          <input
            id="contact_name"
            type="text"
            name="contact_name"
            required
            maxLength={100}
            autoComplete="name"
            placeholder="Votre nom et prénom"
            className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg outline-none focus:ring-2 focus:border-transparent"
            style={{ '--tw-ring-color': '#BF0D0D' } as React.CSSProperties}
            onFocus={(e) => (e.currentTarget.style.boxShadow = '0 0 0 2px #BF0D0D40')}
            onBlur={(e) => (e.currentTarget.style.boxShadow = '')}
          />
        </div>

        <div>
          <label htmlFor="contact_phone" className="block text-sm font-medium text-gray-700 mb-1">
            Téléphone <span style={{ color: '#BF0D0D' }}>*</span>
          </label>
          <input
            id="contact_phone"
            type="tel"
            name="contact_phone"
            required
            maxLength={30}
            autoComplete="tel"
            placeholder="+221 77 000 00 00"
            className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg outline-none"
            onFocus={(e) => (e.currentTarget.style.boxShadow = '0 0 0 2px #BF0D0D40')}
            onBlur={(e) => (e.currentTarget.style.boxShadow = '')}
          />
        </div>

        <div>
          <label htmlFor="contact_email" className="block text-sm font-medium text-gray-700 mb-1">
            Email{' '}
            <span className="text-gray-400 font-normal text-xs">(optionnel)</span>
          </label>
          <input
            id="contact_email"
            type="email"
            name="contact_email"
            maxLength={100}
            autoComplete="email"
            placeholder="votre@email.com"
            className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg outline-none"
            onFocus={(e) => (e.currentTarget.style.boxShadow = '0 0 0 2px #BF0D0D40')}
            onBlur={(e) => (e.currentTarget.style.boxShadow = '')}
          />
        </div>

        <div>
          <label htmlFor="description" className="block text-sm font-medium text-gray-700 mb-1">
            Description du problème <span style={{ color: '#BF0D0D' }}>*</span>
          </label>
          <textarea
            id="description"
            name="description"
            required
            maxLength={500}
            rows={4}
            placeholder="Décrivez le problème rencontré…"
            onChange={(e) => setCharCount(e.target.value.length)}
            className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg outline-none resize-none"
            onFocus={(e) => (e.currentTarget.style.boxShadow = '0 0 0 2px #BF0D0D40')}
            onBlur={(e) => (e.currentTarget.style.boxShadow = '')}
          />
          <p className="text-xs text-gray-400 text-right mt-1">{charCount}/500</p>
        </div>

        {state && 'error' in state && (
          <p className="text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2">{state.error}</p>
        )}

        <button
          type="submit"
          disabled={pending}
          className="w-full py-2.5 px-4 text-sm font-semibold text-white rounded-lg disabled:opacity-60 transition-opacity"
          style={{ backgroundColor: '#BF0D0D' }}
        >
          {pending ? 'Envoi en cours…' : 'Envoyer le signalement'}
        </button>
      </form>
    </>
  )
}

function SuccessState({ numeroIncident }: { numeroIncident: string }) {
  return (
    <div className="text-center py-4">
      <div className="w-12 h-12 rounded-full bg-green-100 flex items-center justify-center mx-auto mb-4">
        <svg className="w-6 h-6 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
        </svg>
      </div>
      <h2 className="text-lg font-semibold text-gray-900 mb-2">Merci pour votre signalement</h2>
      <p className="text-sm text-gray-600 mb-4">
        Notre équipe SAV prendra contact avec vous dans les meilleurs délais.
        AMD Service travaille pour vous offrir le meilleur service possible.
      </p>
      <div className="bg-gray-50 rounded-xl p-4 border border-gray-100">
        <p className="text-xs text-gray-500 mb-1">Référence de votre demande</p>
        <p className="text-base font-semibold text-gray-900">{numeroIncident}</p>
      </div>
    </div>
  )
}

function RateLimitedState() {
  return (
    <div className="text-center py-4">
      <div className="w-12 h-12 rounded-full bg-amber-100 flex items-center justify-center mx-auto mb-4">
        <svg className="w-6 h-6 text-amber-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M12 9v2m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
          />
        </svg>
      </div>
      <p className="text-sm text-gray-700 leading-relaxed">
        Il y a déjà un incident en attente sur cet équipement. Notre SAV prendra contact avec
        vous dans les meilleurs délais. AMD Service travaille pour vous offrir le meilleur
        service possible.
      </p>
    </div>
  )
}
