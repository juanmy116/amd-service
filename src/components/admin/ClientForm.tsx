'use client'

import { useActionState, useState } from 'react'
import Link from 'next/link'
import { Loader2, ArrowLeft, Trash2, AlertTriangle } from 'lucide-react'

type FormState = { error: string } | null

type ClientData = {
  nom_client?: string
  ninea?: string | null
  email?: string | null
  telephone?: string | null
  adresse?: string | null
  ville?: string | null
  active?: boolean
}

type Props = {
  action:        (prev: FormState, data: FormData) => Promise<FormState>
  defaultValues?: ClientData
  title:         string
  clientId?:     number
  deleteAction?: (formData: FormData) => Promise<void>
}

export default function ClientForm({ action, defaultValues, title, clientId, deleteAction }: Props) {
  const [state, formAction, pending] = useActionState(action, null)
  const [confirming, setConfirming] = useState(false)

  return (
    <div className="p-8 max-w-3xl">

      {/* Header */}
      <div className="flex items-center gap-4 mb-8">
        <Link
          href="/admin/clients"
          className="flex items-center justify-center w-9 h-9 rounded-lg border border-gray-200 bg-white hover:bg-gray-50 transition-colors"
        >
          <ArrowLeft size={16} className="text-gray-600" />
        </Link>
        <h1 className="flex-1 text-2xl font-semibold text-gray-900" style={{ fontFamily: 'Poppins, sans-serif' }}>
          {title}
        </h1>

        {/* Delete */}
        {deleteAction && clientId && (
          confirming ? (
            <div className="flex items-center gap-2">
              <span className="text-sm text-gray-600 flex items-center gap-1.5">
                <AlertTriangle size={14} className="text-red-500" />
                Confirmer ?
              </span>
              <form action={deleteAction} className="contents">
                <input type="hidden" name="id" value={clientId} />
                <button
                  type="submit"
                  className="px-3 py-2 rounded-lg text-sm font-medium text-white"
                  style={{ backgroundColor: '#BF0D0D' }}
                >
                  Oui, supprimer
                </button>
              </form>
              <button
                type="button"
                onClick={() => setConfirming(false)}
                className="px-3 py-2 rounded-lg text-sm font-medium text-gray-600 border border-gray-300 hover:bg-gray-50"
              >
                Annuler
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setConfirming(true)}
              className="flex items-center gap-2 px-3.5 py-2.5 rounded-lg border border-red-200 text-sm font-medium text-red-600 bg-white hover:bg-red-50 transition-colors"
            >
              <Trash2 size={15} />
              Supprimer
            </button>
          )
        )}
      </div>

      {/* Form */}
      <form action={formAction}>
        <div className="bg-white rounded-xl border border-gray-200 p-6 space-y-5">

          {state?.error && (
            <div className="px-4 py-3 rounded-lg bg-red-50 border border-red-200 text-sm text-red-700">
              {state.error}
            </div>
          )}

          {/* Row 1: nom + ninea */}
          <div className="grid grid-cols-3 gap-4">
            <div className="col-span-2">
              <label className="block text-sm font-medium text-gray-700 mb-1.5">
                Nom du client <span className="text-red-500">*</span>
              </label>
              <input
                name="nom_client"
                type="text"
                required
                defaultValue={defaultValues?.nom_client}
                placeholder="Société ABC"
                className="w-full px-3.5 py-2.5 rounded-lg border border-gray-300 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-red-500 focus:border-transparent"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">
                NINEA <span className="text-red-500">*</span>
              </label>
              <input
                name="ninea"
                type="text"
                required
                defaultValue={defaultValues?.ninea ?? ''}
                placeholder="00000000"
                className="w-full px-3.5 py-2.5 rounded-lg border border-gray-300 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-red-500 focus:border-transparent"
              />
            </div>
          </div>

          {/* Row 2: email + telephone */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">
                Email <span className="text-red-500">*</span>
              </label>
              <input
                name="email"
                type="email"
                required
                defaultValue={defaultValues?.email ?? ''}
                placeholder="contact@societe.sn"
                className="w-full px-3.5 py-2.5 rounded-lg border border-gray-300 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-red-500 focus:border-transparent"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">
                Téléphone <span className="text-red-500">*</span>
              </label>
              <input
                name="telephone"
                type="tel"
                required
                defaultValue={defaultValues?.telephone ?? ''}
                placeholder="+221 33 000 00 00"
                className="w-full px-3.5 py-2.5 rounded-lg border border-gray-300 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-red-500 focus:border-transparent"
              />
            </div>
          </div>

          {/* Row 3: adresse */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">
              Adresse <span className="text-red-500">*</span>
            </label>
            <input
              name="adresse"
              type="text"
              required
              defaultValue={defaultValues?.adresse ?? ''}
              placeholder="Rue 10, Point E"
              className="w-full px-3.5 py-2.5 rounded-lg border border-gray-300 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-red-500 focus:border-transparent"
            />
          </div>

          {/* Row 4: ville + statut */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">
                Ville <span className="text-red-500">*</span>
              </label>
              <input
                name="ville"
                type="text"
                required
                defaultValue={defaultValues?.ville ?? ''}
                placeholder="Dakar"
                className="w-full px-3.5 py-2.5 rounded-lg border border-gray-300 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-red-500 focus:border-transparent"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">Statut</label>
              <label className="flex items-center gap-3 h-[42px] cursor-pointer">
                <input
                  name="active"
                  type="checkbox"
                  defaultChecked={defaultValues?.active ?? true}
                  className="w-4 h-4 rounded accent-red-600"
                />
                <span className="text-sm text-gray-700">Client actif</span>
              </label>
            </div>
          </div>
        </div>

        {/* Actions */}
        <div className="flex items-center justify-end gap-3 mt-6">
          <Link
            href="/admin/clients"
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
            Enregistrer
          </button>
        </div>
      </form>
    </div>
  )
}
