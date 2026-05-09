'use client'

import { useActionState, useState } from 'react'
import { signInWithEmail, signInWithGoogle, registerClientAction } from './actions'
import { Loader2 } from 'lucide-react'

const inputClass = "w-full px-3.5 py-2.5 rounded-lg border border-gray-300 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-red-500 focus:border-transparent transition"

export default function LoginForm() {
  const [tab, setTab] = useState<'login' | 'register'>('login')
  const [loginState,    loginAction,    loginPending]    = useActionState(signInWithEmail,       null)
  const [registerState, registerAction, registerPending] = useActionState(registerClientAction,  null)

  return (
    <div className="w-full max-w-md mx-auto">

      {/* Header */}
      <div className="text-center mb-8">
        <div className="inline-flex items-center justify-center w-12 h-12 rounded-xl mb-4" style={{ backgroundColor: '#BF0D0D' }}>
          <span className="text-white font-bold text-lg" style={{ fontFamily: 'Poppins, sans-serif' }}>A</span>
        </div>
        <h1 className="text-2xl font-semibold text-gray-900" style={{ fontFamily: 'Poppins, sans-serif' }}>
          AMD Service
        </h1>
        <p className="text-sm text-gray-500 mt-1">Connectez-vous à votre espace</p>
      </div>

      {/* Card */}
      <div className="bg-white rounded-2xl border border-gray-200 p-8 shadow-sm">

        {/* Tabs */}
        <div className="flex mb-6 p-1 bg-gray-100 rounded-lg">
          <button
            type="button"
            onClick={() => setTab('login')}
            className={`flex-1 py-2 text-sm font-medium rounded-md transition-colors ${tab === 'login' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
          >
            Connexion
          </button>
          <button
            type="button"
            onClick={() => setTab('register')}
            className={`flex-1 py-2 text-sm font-medium rounded-md transition-colors ${tab === 'register' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
          >
            Créer un compte
          </button>
        </div>

        {/* Login */}
        {tab === 'login' && (
          <>
            {loginState?.error && (
              <div className="mb-5 px-4 py-3 rounded-lg bg-red-50 border border-red-200 text-sm text-red-700">
                {loginState.error}
              </div>
            )}
            <form action={loginAction} className="space-y-4">
              <div>
                <label htmlFor="email" className="block text-sm font-medium text-gray-700 mb-1.5">Email</label>
                <input id="email" name="email" type="email" autoComplete="email" required className={inputClass} placeholder="vous@entreprise.com" />
              </div>
              <div>
                <label htmlFor="password" className="block text-sm font-medium text-gray-700 mb-1.5">Mot de passe</label>
                <input id="password" name="password" type="password" autoComplete="current-password" required className={inputClass} placeholder="••••••••" />
              </div>
              <button type="submit" disabled={loginPending} className="w-full flex items-center justify-center gap-2 py-2.5 px-4 rounded-lg text-sm font-medium text-white transition-opacity disabled:opacity-60 mt-2" style={{ backgroundColor: '#BF0D0D' }}>
                {loginPending && <Loader2 size={16} className="animate-spin" />}
                Connexion
              </button>
            </form>

            <div className="relative my-6">
              <div className="absolute inset-0 flex items-center"><div className="w-full border-t border-gray-200" /></div>
              <div className="relative flex justify-center text-xs text-gray-400 bg-white px-3">ou</div>
            </div>

            <form action={signInWithGoogle}>
              <button type="submit" className="w-full flex items-center justify-center gap-3 py-2.5 px-4 rounded-lg border border-gray-300 text-sm font-medium text-gray-700 bg-white hover:bg-gray-50 transition">
                <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
                  <path d="M17.64 9.205c0-.639-.057-1.252-.164-1.841H9v3.481h4.844a4.14 4.14 0 0 1-1.796 2.716v2.259h2.908c1.702-1.567 2.684-3.875 2.684-6.615Z" fill="#4285F4"/>
                  <path d="M9 18c2.43 0 4.467-.806 5.956-2.18l-2.908-2.259c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332A8.997 8.997 0 0 0 9 18Z" fill="#34A853"/>
                  <path d="M3.964 10.71A5.41 5.41 0 0 1 3.682 9c0-.593.102-1.17.282-1.71V4.958H.957A8.996 8.996 0 0 0 0 9c0 1.452.348 2.827.957 4.042l3.007-2.332Z" fill="#FBBC05"/>
                  <path d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0A8.997 8.997 0 0 0 .957 4.958L3.964 7.29C4.672 5.163 6.656 3.58 9 3.58Z" fill="#EA4335"/>
                </svg>
                Continuer avec Google
              </button>
            </form>
          </>
        )}

        {/* Register */}
        {tab === 'register' && (
          <>
            {registerState?.error && (
              <div className="mb-5 px-4 py-3 rounded-lg bg-red-50 border border-red-200 text-sm text-red-700">
                {registerState.error}
              </div>
            )}
            <form action={registerAction} className="space-y-4">
              <div>
                <label htmlFor="reg-email" className="block text-sm font-medium text-gray-700 mb-1.5">Email <span className="text-red-500">*</span></label>
                <input id="reg-email" name="email" type="email" required className={inputClass} placeholder="vous@entreprise.com" />
              </div>
              <div>
                <label htmlFor="reg-password" className="block text-sm font-medium text-gray-700 mb-1.5">Mot de passe <span className="text-red-500">*</span></label>
                <input id="reg-password" name="password" type="password" required className={inputClass} placeholder="Min. 6 caractères" />
              </div>
              <div>
                <label htmlFor="reg-confirm" className="block text-sm font-medium text-gray-700 mb-1.5">Confirmer le mot de passe <span className="text-red-500">*</span></label>
                <input id="reg-confirm" name="confirm" type="password" required className={inputClass} placeholder="••••••••" />
              </div>
              <button type="submit" disabled={registerPending} className="w-full flex items-center justify-center gap-2 py-2.5 px-4 rounded-lg text-sm font-medium text-white transition-opacity disabled:opacity-60 mt-2" style={{ backgroundColor: '#BF0D0D' }}>
                {registerPending && <Loader2 size={16} className="animate-spin" />}
                Créer mon compte
              </button>
            </form>
            <p className="text-xs text-gray-400 text-center mt-4">
              Après inscription, vous devrez vérifier votre numéro de contrat pour accéder à vos données.
            </p>
          </>
        )}
      </div>

      <p className="text-center text-xs text-gray-400 mt-6">
        Accès réservé aux clients et équipes AMD Service
      </p>
    </div>
  )
}
