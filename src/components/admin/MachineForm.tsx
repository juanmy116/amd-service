'use client'

import { useActionState, useState } from 'react'
import Link from 'next/link'
import { Loader2, ArrowLeft, Trash2, AlertTriangle } from 'lucide-react'

type FormState = { error: string } | null

type MachineData = {
  numero_serie?: string
  marque?: string
  modele?: string
  type?: 'color' | 'noir_blanc'
  localisation?: string | null
  active?: boolean
}

type Props = {
  action: (prev: FormState, data: FormData) => Promise<FormState>
  defaultValues?: MachineData
  title: string
  isEdit?: boolean
  machineId?: string
  deleteAction?: (formData: FormData) => Promise<void>
}

export default function MachineForm({ action, defaultValues, title, isEdit, machineId, deleteAction }: Props) {
  const [state, formAction, pending] = useActionState(action, null)
  const [confirming, setConfirming] = useState(false)

  return (
    <div className="p-8 max-w-3xl">

      {/* Header */}
      <div className="flex items-center gap-4 mb-8">
        <Link
          href="/admin/machines"
          className="flex items-center justify-center w-9 h-9 rounded-lg border border-gray-200 bg-white hover:bg-gray-50 transition-colors"
        >
          <ArrowLeft size={16} className="text-gray-600" />
        </Link>
        <h1 className="flex-1 text-2xl font-semibold text-gray-900" style={{ fontFamily: 'Poppins, sans-serif' }}>
          {title}
        </h1>

        {/* Delete */}
        {deleteAction && machineId && (
          confirming ? (
            <div className="flex items-center gap-2">
              <span className="text-sm text-gray-600 flex items-center gap-1.5">
                <AlertTriangle size={14} className="text-red-500" />
                Confirmer ?
              </span>
              <form action={deleteAction} className="contents">
                <input type="hidden" name="serie" value={machineId} />
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

          {/* Nº Série */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">
              Numéro de série {!isEdit && <span className="text-red-500">*</span>}
            </label>
            {isEdit ? (
              <div className="px-3.5 py-2.5 rounded-lg border border-gray-200 bg-gray-50 text-sm text-gray-600 font-mono">
                {defaultValues?.numero_serie}
              </div>
            ) : (
              <input
                name="numero_serie"
                type="text"
                required
                defaultValue={defaultValues?.numero_serie}
                placeholder="W542J500806"
                className="w-full px-3.5 py-2.5 rounded-lg border border-gray-300 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-red-500 focus:border-transparent font-mono"
              />
            )}
          </div>

          {/* Row: marque + modele */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">
                Marque <span className="text-red-500">*</span>
              </label>
              <input
                name="marque"
                type="text"
                required
                defaultValue={defaultValues?.marque}
                placeholder="Ricoh"
                className="w-full px-3.5 py-2.5 rounded-lg border border-gray-300 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-red-500 focus:border-transparent"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">
                Modèle <span className="text-red-500">*</span>
              </label>
              <input
                name="modele"
                type="text"
                required
                defaultValue={defaultValues?.modele}
                placeholder="Aficio MP C5502"
                className="w-full px-3.5 py-2.5 rounded-lg border border-gray-300 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-red-500 focus:border-transparent"
              />
            </div>
          </div>

          {/* Row: type + localisation */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">Type</label>
              <select
                name="type"
                defaultValue={defaultValues?.type ?? 'color'}
                className="w-full px-3.5 py-2.5 rounded-lg border border-gray-300 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-red-500 focus:border-transparent bg-white"
              >
                <option value="color">Couleur</option>
                <option value="noir_blanc">Noir &amp; Blanc</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">Localisation</label>
              <input
                name="localisation"
                type="text"
                defaultValue={defaultValues?.localisation ?? ''}
                placeholder="RDC, Bureau Comptabilité"
                className="w-full px-3.5 py-2.5 rounded-lg border border-gray-300 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-red-500 focus:border-transparent"
              />
            </div>
          </div>

          {/* Statut */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">Statut</label>
            <label className="flex items-center gap-3 h-[42px] cursor-pointer">
              <input
                name="active"
                type="checkbox"
                defaultChecked={defaultValues?.active ?? true}
                className="w-4 h-4 rounded accent-red-600"
              />
              <span className="text-sm text-gray-700">Machine active</span>
            </label>
          </div>
        </div>

        {/* Actions */}
        <div className="flex items-center justify-end gap-3 mt-6">
          <Link
            href="/admin/machines"
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
