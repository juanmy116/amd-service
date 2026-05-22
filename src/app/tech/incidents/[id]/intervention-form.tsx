'use client'

import { useActionState } from 'react'
import Link from 'next/link'
import { ArrowLeft, Loader2, MapPin, Building2, FileText } from 'lucide-react'
import { Badge } from '@/components/ui/Badge'
import { Card } from '@/components/ui/Card'
import type { BadgeVariant } from '@/components/ui/Badge'

type FormState = { error: string } | null

const PARTS = [
  { id: 1, name: 'Four' }, { id: 2, name: 'Transfer Belt' },
  { id: 3, name: 'Tambour BK' }, { id: 4, name: 'Tambour C' },
  { id: 5, name: 'Tambour M' }, { id: 6, name: 'Tambour Y' },
  { id: 7, name: 'Toner BK' }, { id: 8, name: 'Toner C' },
  { id: 9, name: 'Toner M' }, { id: 10, name: 'Toner Y' },
  { id: 11, name: 'Cassette' }, { id: 12, name: 'Rouleau Pression' },
]

const STATUS_OPTIONS = [
  { value: 'en_cours', label: 'En cours — intervention démarrée' },
  { value: 'résolu',   label: 'Résolu — problème réglé' },
]

const STATUS_BADGE: Record<string, BadgeVariant> = {
  nouveau: 'info', assigné: 'violet', en_cours: 'warning', résolu: 'success',
}
const STATUS_LABEL: Record<string, string> = {
  nuevo: 'Nuevo', assigné: 'Assigné', en_cours: 'En cours', résolu: 'Résolu',
}

type Props = {
  incident: {
    id: string; numero_incident: string; title: string; description: string | null; status: string;
    priority: string; category: string; rapport_intervention: string | null; autres_pieces: string | null;
  }
  boundAction: (prev: FormState, data: FormData) => Promise<FormState>
  clientName: string | null
  machineName: string
  machineLocation: string | null
  contractNumber: string | null
  checkedParts: Set<number>
}

export default function InterventionForm({
  incident, boundAction, clientName, machineName, machineLocation, contractNumber, checkedParts,
}: Props) {
  const [state, formAction, pending] = useActionState(boundAction, null)

  return (
    <div className="p-4 space-y-5 pb-8">

      {/* Header */}
      <div className="flex items-center gap-3 pt-2">
        <Link href="/tech" className="flex items-center justify-center w-9 h-9 rounded-xl border border-line bg-card shrink-0">
          <ArrowLeft size={16} className="text-ink-muted" />
        </Link>
        <div className="min-w-0">
          <p className="font-mono text-[10px] font-semibold tracking-wide text-accent">
            {incident.numero_incident}
          </p>
          <h1 className="text-base font-semibold text-ink truncate font-display">
            {incident.title}
          </h1>
          <div className="mt-0.5">
            <Badge variant={STATUS_BADGE[incident.status] ?? 'neutral'}>
              {STATUS_LABEL[incident.status] ?? incident.status}
            </Badge>
          </div>
        </div>
      </div>

      {/* Infos machine */}
      <Card className="p-4 space-y-3">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg flex items-center justify-center bg-accent">
            <FileText size={14} className="text-white" />
          </div>
          <div>
            <p className="text-sm font-semibold text-ink">{machineName}</p>
            {contractNumber && <p className="text-xs text-ink-muted font-mono">{contractNumber}</p>}
          </div>
        </div>
        {clientName && (
          <div className="flex items-center gap-2 text-sm text-ink-soft">
            <Building2 size={14} className="text-ink-muted shrink-0" />
            {clientName}
          </div>
        )}
        {machineLocation && (
          <div className="flex items-center gap-2 text-sm text-ink-soft">
            <MapPin size={14} className="text-ink-muted shrink-0" />
            {machineLocation}
          </div>
        )}
        {incident.description && (
          <div className="pt-2 border-t border-line-subtle">
            <p className="text-xs font-medium text-ink-muted mb-1">Description du problème</p>
            <p className="text-sm text-ink-soft">{incident.description}</p>
          </div>
        )}
      </Card>

      {/* Formulaire intervention */}
      <form action={formAction} className="space-y-5">
        <input type="hidden" name="old_status" value={incident.status} />

        {state?.error && (
          <div className="px-4 py-3 rounded-xl bg-red-50 border border-red-200 text-sm text-red-700">
            {state.error}
          </div>
        )}

        {/* Statut */}
        <Card className="p-4">
          <p className="text-sm font-semibold text-ink-soft mb-3">Statut de l&apos;intervention</p>
          <div className="space-y-2">
            {STATUS_OPTIONS.map((o) => (
              <label key={o.value} className="flex items-center gap-3 p-3 rounded-xl border border-line cursor-pointer">
                <input
                  type="radio"
                  name="status"
                  value={o.value}
                  defaultChecked={incident.status === o.value || (incident.status === 'assigné' && o.value === 'en_cours')}
                  className="accent-red-600"
                />
                <span className="text-sm text-ink-soft">{o.label}</span>
              </label>
            ))}
          </div>
        </Card>

        {/* Rapport */}
        <Card className="p-4">
          <p className="text-sm font-semibold text-ink-soft mb-3">Rapport d&apos;intervention</p>
          <textarea
            name="rapport"
            rows={4}
            defaultValue={incident.rapport_intervention ?? ''}
            placeholder="Décrivez les actions effectuées, l'état de la machine, les pièces changées..."
            className="w-full px-3 py-2.5 rounded-xl border border-line text-sm text-ink placeholder-ink-muted focus:outline-none focus:ring-2 focus:ring-accent focus:border-transparent resize-none"
          />
        </Card>

        {/* Pièces remplacées */}
        <Card className="p-4">
          <p className="text-sm font-semibold text-ink-soft mb-3">Pièces remplacées</p>
          <div className="grid grid-cols-2 gap-2">
            {PARTS.map((p) => (
              <label key={p.id} className="flex items-center gap-2.5 p-2.5 rounded-xl border border-line cursor-pointer">
                <input
                  type="checkbox"
                  name={`part_${p.id}`}
                  defaultChecked={checkedParts.has(p.id)}
                  className="w-4 h-4 rounded accent-red-600"
                />
                <span className="text-sm text-ink-soft">{p.name}</span>
              </label>
            ))}
          </div>
          <div className="mt-3">
            <input
              name="autres_pieces"
              type="text"
              defaultValue={incident.autres_pieces ?? ''}
              placeholder="Autres pièces (libre)"
              className="w-full px-3 py-2.5 rounded-xl border border-line text-sm text-ink placeholder-ink-muted focus:outline-none focus:ring-2 focus:ring-accent focus:border-transparent"
            />
          </div>
        </Card>

        {/* Commentaire */}
        <Card className="p-4">
          <p className="text-sm font-semibold text-ink-soft mb-1">Commentaire</p>
          <p className="text-xs text-ink-muted mb-3">Ajouté à l&apos;historique si le statut change</p>
          <input
            name="comment"
            type="text"
            placeholder="Ex : Pièce commandée, retour prévu demain"
            className="w-full px-3 py-2.5 rounded-xl border border-line text-sm text-ink placeholder-ink-muted focus:outline-none focus:ring-2 focus:ring-accent focus:border-transparent"
          />
        </Card>

        <button
          type="submit"
          disabled={pending}
          className="w-full flex items-center justify-center gap-2 py-3.5 rounded-2xl text-sm font-semibold text-white bg-accent disabled:opacity-60 transition-opacity"
        >
          {pending && <Loader2 size={16} className="animate-spin" />}
          Enregistrer l&apos;intervention
        </button>
      </form>
    </div>
  )
}
