'use client'

import { useActionState, useState } from 'react'
import Link from 'next/link'
import { Loader2, ArrowLeft, Trash2, AlertTriangle } from 'lucide-react'
import { Card } from '@/components/ui/Card'

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

const inputClass = 'w-full px-3.5 py-2.5 rounded-lg border border-line text-ink text-sm placeholder-ink-muted bg-card focus:outline-none focus:ring-2 focus:ring-accent/30 focus:border-accent'
const selectClass = 'w-full px-3.5 py-2.5 rounded-lg border border-line text-ink text-sm bg-card focus:outline-none focus:ring-2 focus:ring-accent/30 focus:border-accent'

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
          className="flex items-center justify-center w-9 h-9 rounded-lg border border-line bg-card hover:bg-neutral-soft transition-colors"
        >
          <ArrowLeft size={16} className="text-ink-soft" />
        </Link>
        <h1 className="flex-1 text-2xl font-semibold font-display text-ink">
          {title}
        </h1>

        {deleteAction && memberId && (
          confirming ? (
            <div className="flex items-center gap-2 shrink-0">
              <span className="text-sm text-ink-soft flex items-center gap-1.5">
                <AlertTriangle size={14} className="text-accent" />
                Confirmer ?
              </span>
              <form action={deleteAction} className="contents">
                <input type="hidden" name="id" value={memberId} />
                <button type="submit" className="px-3 py-2 rounded-lg text-sm font-medium text-white bg-accent">
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
              className="flex items-center gap-2 px-3.5 py-2.5 rounded-lg border border-accent/20 text-sm font-medium text-accent bg-card hover:bg-accent-soft transition-colors shrink-0"
            >
              <Trash2 size={15} />
              Supprimer
            </button>
          )
        )}
      </div>

      <form action={formAction}>
        <Card className="p-6 space-y-5">

          {state?.error && (
            <div className="px-4 py-3 rounded-lg bg-accent-soft border border-accent/20 text-sm text-accent">
              {state.error}
            </div>
          )}

          {/* Email — editable on create, read-only on edit */}
          <div>
            <label className="block text-sm font-medium text-ink-soft mb-1.5">
              Email {!isEdit && <span className="text-accent">*</span>}
            </label>
            {isEdit ? (
              <div className="px-3.5 py-2.5 rounded-lg border border-line bg-neutral-soft text-sm text-ink-soft">
                {email}
              </div>
            ) : (
              <input
                name="email"
                type="email"
                required
                placeholder="technicien@amd-service.com"
                className={inputClass}
              />
            )}
          </div>

          {/* Nom complet + Téléphone */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-ink-soft mb-1.5">
                Nom complet {!isEdit && <span className="text-accent">*</span>}
              </label>
              <input
                name="full_name"
                type="text"
                required={!isEdit}
                defaultValue={defaultValues?.full_name ?? ''}
                placeholder="Mamadou Diallo"
                className={inputClass}
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-ink-soft mb-1.5">Téléphone</label>
              <input
                name="phone"
                type="tel"
                defaultValue={defaultValues?.phone ?? ''}
                placeholder="+221 77 000 00 00"
                className={inputClass}
              />
            </div>
          </div>

          {/* Rôle */}
          <div>
            <label className="block text-sm font-medium text-ink-soft mb-1.5">Rôle</label>
            <select
              name="role"
              defaultValue={defaultValues?.role ?? 'technician'}
              className={selectClass}
            >
              <option value="technician">Technicien</option>
              <option value="admin">Administrateur</option>
            </select>
          </div>

          {/* Mot de passe temporaire (create only) */}
          {!isEdit && (
            <div>
              <label className="block text-sm font-medium text-ink-soft mb-1.5">
                Mot de passe temporaire <span className="text-accent">*</span>
              </label>
              <input
                name="password"
                type="password"
                required
                minLength={8}
                placeholder="8 caractères minimum"
                className={inputClass}
              />
              <p className="text-xs text-ink-muted mt-1.5">
                Communiquez ce mot de passe au technicien directement. Il pourra le modifier depuis son profil.
              </p>
            </div>
          )}
        </Card>

        <div className="flex items-center justify-end gap-3 mt-6">
          <Link
            href="/admin/team"
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
            {isEdit ? 'Enregistrer' : 'Créer le compte'}
          </button>
        </div>
      </form>
    </div>
  )
}
