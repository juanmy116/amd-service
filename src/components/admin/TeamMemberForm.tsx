'use client'

import { useActionState, useState } from 'react'
import Link from 'next/link'
import { Loader2, ArrowLeft, Trash2, AlertTriangle } from 'lucide-react'

type FormState = { error: string } | null

type MemberData = {
  full_name?: string | null
  phone?: string | null
  role?: string
}

type Props = {
  action: (prev: FormState, data: FormData) => Promise<FormState>
  defaultValues?: MemberData
  title: string
  isEdit?: boolean
  email?: string
  memberId?: string
  deleteAction?: (formData: FormData) => Promise<void>
}

export default function TeamMemberForm({
  action, defaultValues, title, isEdit, email, memberId, deleteAction,
}: Props) {
  const [state, formAction, pending] = useActionState(action, null)
  const [confirming, setConfirming] = useState(false)

  return (
    <div className="p-8 max-w-2xl">

      {/* Header */}
      <div className="flex items-center gap-4 mb-8">
        <Link
          href="/admin/team"
          className="flex items-center justify-center w-9 h-9 rounded-lg border border-gray-200 bg-white hover:bg-gray-50 transition-colors"
        >
          <ArrowLeft size={16} className="text-gray-600" />
        </Link>
        <h1 className="flex-1 text-2xl font-semibold text-gray-900" style={{ fontFamily: 'Poppins, sans-serif' }}>
          {title}
        </h1>

        {deleteAction && memberId && (
          confirming ? (
            <div className="flex items-center gap-2 shrink-0">
              <span className="text-sm text-gray-600 flex items-center gap-1.5">
                <AlertTriangle size={14} className="text-red-500" />
                Confirmer ?
              </span>
              <form action={deleteAction} className="contents">
                <input type="hidden" name="id" value={memberId} />
                <button type="submit" className="px-3 py-2 rounded-lg text-sm font-medium text-white" style={{ backgroundColor: '#BF0D0D' }}>
                  Oui, supprimer
                </button>
              </form>
              <button type="button" onClick={() => setConfirming(false)} className="px-3 py-2 rounded-lg text-sm font-medium text-gray-600 border border-gray-300 hover:bg-gray-50">
                Annuler
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setConfirming(true)}
              className="flex items-center gap-2 px-3.5 py-2.5 rounded-lg border border-red-200 text-sm font-medium text-red-600 bg-white hover:bg-red-50 transition-colors shrink-0"
            >
              <Trash2 size={15} />
              Supprimer
            </button>
          )
        )}
      </div>

      <form action={formAction}>
        <div className="bg-white rounded-xl border border-gray-200 p-6 space-y-5">

          {state?.error && (
            <div className="px-4 py-3 rounded-lg bg-red-50 border border-red-200 text-sm text-red-700">
              {state.error}
            </div>
          )}

          {/* Email — editable on create, read-only on edit */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">
              Email {!isEdit && <span className="text-red-500">*</span>}
            </label>
            {isEdit ? (
              <div className="px-3.5 py-2.5 rounded-lg border border-gray-200 bg-gray-50 text-sm text-gray-600">
                {email}
              </div>
            ) : (
              <input
                name="email"
                type="email"
                required
                placeholder="technicien@amd-service.com"
                className="w-full px-3.5 py-2.5 rounded-lg border border-gray-300 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-red-500 focus:border-transparent"
              />
            )}
          </div>

          {/* Nom complet + Téléphone */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">
                Nom complet {!isEdit && <span className="text-red-500">*</span>}
              </label>
              <input
                name="full_name"
                type="text"
                required={!isEdit}
                defaultValue={defaultValues?.full_name ?? ''}
                placeholder="Mamadou Diallo"
                className="w-full px-3.5 py-2.5 rounded-lg border border-gray-300 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-red-500 focus:border-transparent"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">Téléphone</label>
              <input
                name="phone"
                type="tel"
                defaultValue={defaultValues?.phone ?? ''}
                placeholder="+221 77 000 00 00"
                className="w-full px-3.5 py-2.5 rounded-lg border border-gray-300 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-red-500 focus:border-transparent"
              />
            </div>
          </div>

          {/* Rôle */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">Rôle</label>
            <select
              name="role"
              defaultValue={defaultValues?.role ?? 'technician'}
              className="w-full px-3.5 py-2.5 rounded-lg border border-gray-300 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-red-500 focus:border-transparent bg-white"
            >
              <option value="technician">Technicien</option>
              <option value="admin">Administrateur</option>
            </select>
          </div>

          {/* Mot de passe temporaire (create only) */}
          {!isEdit && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">
                Mot de passe temporaire <span className="text-red-500">*</span>
              </label>
              <input
                name="password"
                type="password"
                required
                minLength={8}
                placeholder="8 caractères minimum"
                className="w-full px-3.5 py-2.5 rounded-lg border border-gray-300 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-red-500 focus:border-transparent"
              />
              <p className="text-xs text-gray-400 mt-1.5">
                Communiquez ce mot de passe au technicien directement. Il pourra le modifier depuis son profil.
              </p>
            </div>
          )}
        </div>

        <div className="flex items-center justify-end gap-3 mt-6">
          <Link
            href="/admin/team"
            className="px-4 py-2.5 rounded-lg border border-gray-300 text-sm font-medium text-gray-700 bg-white hover:bg-gray-50 transition-colors"
          >
            Annuler
          </Link>
          <button
            type="submit"
            disabled={pending}
            className="flex items-center gap-2 px-5 py-2.5 rounded-lg text-sm font-medium text-white disabled:opacity-60 transition-opacity hover:opacity-90"
            style={{ backgroundColor: '#BF0D0D' }}
          >
            {pending && <Loader2 size={15} className="animate-spin" />}
            {isEdit ? 'Enregistrer' : 'Créer le compte'}
          </button>
        </div>
      </form>
    </div>
  )
}
