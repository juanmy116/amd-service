'use client'

import { useActionState, useState } from 'react'
import Link from 'next/link'
import { Loader2, ArrowLeft, Trash2, AlertTriangle } from 'lucide-react'
import { Card } from '@/components/ui/Card'

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

const inputClass =
  'w-full px-3.5 py-2.5 rounded-lg border border-line text-ink text-sm placeholder-ink-muted bg-card focus:outline-none focus:ring-2 focus:ring-accent/30 focus:border-accent'

const selectClass =
  'w-full px-3.5 py-2.5 rounded-lg border border-line text-ink text-sm bg-card focus:outline-none focus:ring-2 focus:ring-accent/30 focus:border-accent'

export default function MachineForm({ action, defaultValues, title, isEdit, machineId, deleteAction }: Props) {
  const [state, formAction, pending] = useActionState(action, null)
  const [confirming, setConfirming] = useState(false)

  return (
    <div className="p-8 max-w-3xl">

      {/* Header */}
      <div className="flex items-center gap-4 mb-8">
        <Link
          href="/admin/machines"
          className="flex items-center justify-center w-9 h-9 rounded-lg border border-line bg-card hover:bg-neutral-soft transition-colors"
        >
          <ArrowLeft size={16} className="text-ink-soft" />
        </Link>
        <h1 className="flex-1 text-2xl font-semibold text-ink font-display">
          {title}
        </h1>

        {/* Delete */}
        {deleteAction && machineId && (
          confirming ? (
            <div className="flex items-center gap-2">
              <span className="text-sm text-ink-soft flex items-center gap-1.5">
                <AlertTriangle size={14} className="text-accent" />
                Confirmer ?
              </span>
              <form action={deleteAction} className="contents">
                <input type="hidden" name="serie" value={machineId} />
                <button
                  type="submit"
                  className="px-3 py-2 rounded-lg text-sm font-medium text-white bg-accent"
                >
                  Oui, supprimer
                </button>
              </form>
              <button
                type="button"
                onClick={() => setConfirming(false)}
                className="px-3 py-2 rounded-lg text-sm font-medium text-ink-soft border border-line hover:bg-neutral-soft"
              >
                Annuler
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setConfirming(true)}
              className="flex items-center gap-2 px-3.5 py-2.5 rounded-lg border border-accent/20 text-sm font-medium text-accent bg-card hover:bg-accent-soft transition-colors"
            >
              <Trash2 size={15} />
              Supprimer
            </button>
          )
        )}
      </div>

      {/* Form */}
      <form action={formAction}>
        <Card className="p-6 space-y-5">

          {state?.error && (
            <div className="px-4 py-3 rounded-lg bg-accent-soft border border-accent/20 text-sm text-accent">
              {state.error}
            </div>
          )}

          {/* Nº Série */}
          <div>
            <label className="block text-sm font-medium text-ink-soft mb-1.5">
              Numéro de série {!isEdit && <span className="text-accent">*</span>}
            </label>
            {isEdit ? (
              <div className="px-3.5 py-2.5 rounded-lg border border-line bg-neutral-soft text-sm text-ink-soft font-mono">
                {defaultValues?.numero_serie}
              </div>
            ) : (
              <input
                name="numero_serie"
                type="text"
                required
                defaultValue={defaultValues?.numero_serie}
                placeholder="W542J500806"
                className={`${inputClass} font-mono`}
              />
            )}
          </div>

          {/* Row: marque + modele */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-ink-soft mb-1.5">
                Marque <span className="text-accent">*</span>
              </label>
              <input
                name="marque"
                type="text"
                required
                defaultValue={defaultValues?.marque}
                placeholder="Ricoh"
                className={inputClass}
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-ink-soft mb-1.5">
                Modèle <span className="text-accent">*</span>
              </label>
              <input
                name="modele"
                type="text"
                required
                defaultValue={defaultValues?.modele}
                placeholder="Aficio MP C5502"
                className={inputClass}
              />
            </div>
          </div>

          {/* Row: type + localisation */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-ink-soft mb-1.5">Type</label>
              <select
                name="type"
                defaultValue={defaultValues?.type ?? 'color'}
                className={selectClass}
              >
                <option value="color">Couleur</option>
                <option value="noir_blanc">Noir &amp; Blanc</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-ink-soft mb-1.5">Localisation</label>
              <input
                name="localisation"
                type="text"
                defaultValue={defaultValues?.localisation ?? ''}
                placeholder="RDC, Bureau Comptabilité"
                className={inputClass}
              />
            </div>
          </div>

          {/* Statut */}
          <div>
            <label className="block text-sm font-medium text-ink-soft mb-1.5">Statut</label>
            <label className="flex items-center gap-3 h-[42px] cursor-pointer">
              <input
                name="active"
                type="checkbox"
                defaultChecked={defaultValues?.active ?? true}
                className="w-4 h-4 rounded accent-accent"
              />
              <span className="text-sm text-ink">Machine active</span>
            </label>
          </div>
        </Card>

        {/* Actions */}
        <div className="flex items-center justify-end gap-3 mt-6">
          <Link
            href="/admin/machines"
            className="px-4 py-2.5 rounded-lg border border-line text-sm font-medium text-ink bg-card hover:bg-neutral-soft transition-colors"
          >
            Annuler
          </Link>
          <button
            type="submit"
            disabled={pending}
            className="flex items-center gap-2 px-5 py-2.5 rounded-lg text-sm font-medium text-white bg-accent disabled:opacity-60 transition-opacity hover:opacity-90"
          >
            {pending && <Loader2 size={15} className="animate-spin" />}
            Enregistrer
          </button>
        </div>
      </form>
    </div>
  )
}
