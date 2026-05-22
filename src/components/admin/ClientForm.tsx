'use client'

import { useActionState, useState } from 'react'
import Link from 'next/link'
import { Loader2, ArrowLeft, Trash2, AlertTriangle } from 'lucide-react'
import { Card } from '@/components/ui/Card'

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

const inputClass =
  'w-full px-3.5 py-2.5 rounded-lg border border-line text-ink text-sm placeholder-ink-muted bg-card focus:outline-none focus:ring-2 focus:ring-accent/30 focus:border-accent'

export default function ClientForm({ action, defaultValues, title, clientId, deleteAction }: Props) {
  const [state, formAction, pending] = useActionState(action, null)
  const [confirming, setConfirming] = useState(false)

  return (
    <div className="p-8 max-w-3xl">

      {/* Header */}
      <div className="flex items-center gap-4 mb-8">
        <Link
          href="/admin/clients"
          className="flex items-center justify-center w-9 h-9 rounded-lg border border-line bg-card hover:bg-neutral-soft transition-colors"
        >
          <ArrowLeft size={16} className="text-ink-soft" />
        </Link>
        <h1 className="flex-1 text-2xl font-semibold text-ink font-display">
          {title}
        </h1>

        {/* Delete */}
        {deleteAction && clientId && (
          confirming ? (
            <div className="flex items-center gap-2">
              <span className="text-sm text-ink-soft flex items-center gap-1.5">
                <AlertTriangle size={14} className="text-accent" />
                Confirmer ?
              </span>
              <form action={deleteAction} className="contents">
                <input type="hidden" name="id" value={clientId} />
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

          {/* Row 1: nom + ninea */}
          <div className="grid grid-cols-3 gap-4">
            <div className="col-span-2">
              <label className="block text-sm font-medium text-ink-soft mb-1.5">
                Nom du client <span className="text-accent">*</span>
              </label>
              <input
                name="nom_client"
                type="text"
                required
                defaultValue={defaultValues?.nom_client}
                placeholder="Société ABC"
                className={inputClass}
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-ink-soft mb-1.5">
                NINEA <span className="text-accent">*</span>
              </label>
              <input
                name="ninea"
                type="text"
                required
                defaultValue={defaultValues?.ninea ?? ''}
                placeholder="00000000"
                className={inputClass}
              />
            </div>
          </div>

          {/* Row 2: email + telephone */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-ink-soft mb-1.5">
                Email <span className="text-accent">*</span>
              </label>
              <input
                name="email"
                type="email"
                required
                defaultValue={defaultValues?.email ?? ''}
                placeholder="contact@societe.sn"
                className={inputClass}
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-ink-soft mb-1.5">
                Téléphone <span className="text-accent">*</span>
              </label>
              <input
                name="telephone"
                type="tel"
                required
                defaultValue={defaultValues?.telephone ?? ''}
                placeholder="+221 33 000 00 00"
                className={inputClass}
              />
            </div>
          </div>

          {/* Row 3: adresse */}
          <div>
            <label className="block text-sm font-medium text-ink-soft mb-1.5">
              Adresse <span className="text-accent">*</span>
            </label>
            <input
              name="adresse"
              type="text"
              required
              defaultValue={defaultValues?.adresse ?? ''}
              placeholder="Rue 10, Point E"
              className={inputClass}
            />
          </div>

          {/* Row 4: ville + statut */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-ink-soft mb-1.5">
                Ville <span className="text-accent">*</span>
              </label>
              <input
                name="ville"
                type="text"
                required
                defaultValue={defaultValues?.ville ?? ''}
                placeholder="Dakar"
                className={inputClass}
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-ink-soft mb-1.5">Statut</label>
              <label className="flex items-center gap-3 h-[42px] cursor-pointer">
                <input
                  name="active"
                  type="checkbox"
                  defaultChecked={defaultValues?.active ?? true}
                  className="w-4 h-4 rounded accent-accent"
                />
                <span className="text-sm text-ink">Client actif</span>
              </label>
            </div>
          </div>
        </Card>

        {/* Actions */}
        <div className="flex items-center justify-end gap-3 mt-6">
          <Link
            href="/admin/clients"
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
