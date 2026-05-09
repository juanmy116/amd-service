'use client'

import { useActionState } from 'react'
import Link from 'next/link'
import { ArrowLeft, Loader2, MapPin, Building2, FileText } from 'lucide-react'

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

const STATUS_BADGE: Record<string, string> = {
  nouveau: 'bg-blue-50 text-blue-700', assigné: 'bg-purple-50 text-purple-700',
  en_cours: 'bg-amber-50 text-amber-700', résolu: 'bg-green-50 text-green-700',
}
const STATUS_LABEL: Record<string, string> = {
  nouveau: 'Nouveau', assigné: 'Assigné', en_cours: 'En cours', résolu: 'Résolu',
}

type Props = {
  incident: {
    id: string; title: string; description: string | null; status: string;
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
        <Link href="/tech" className="flex items-center justify-center w-9 h-9 rounded-xl border border-gray-200 bg-white shrink-0">
          <ArrowLeft size={16} className="text-gray-600" />
        </Link>
        <div className="min-w-0">
          <h1 className="text-base font-semibold text-gray-900 truncate" style={{ fontFamily: 'Poppins, sans-serif' }}>
            {incident.title}
          </h1>
          <span className={`inline-flex mt-0.5 px-2 py-0.5 rounded text-xs font-medium ${STATUS_BADGE[incident.status] ?? 'bg-gray-100 text-gray-500'}`}>
            {STATUS_LABEL[incident.status] ?? incident.status}
          </span>
        </div>
      </div>

      {/* Infos machine */}
      <div className="bg-white rounded-2xl border border-gray-200 p-4 space-y-3">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ backgroundColor: '#BF0D0D' }}>
            <FileText size={14} className="text-white" />
          </div>
          <div>
            <p className="text-sm font-semibold text-gray-900">{machineName}</p>
            {contractNumber && <p className="text-xs text-gray-400 font-mono">{contractNumber}</p>}
          </div>
        </div>
        {clientName && (
          <div className="flex items-center gap-2 text-sm text-gray-600">
            <Building2 size={14} className="text-gray-400 shrink-0" />
            {clientName}
          </div>
        )}
        {machineLocation && (
          <div className="flex items-center gap-2 text-sm text-gray-600">
            <MapPin size={14} className="text-gray-400 shrink-0" />
            {machineLocation}
          </div>
        )}
        {incident.description && (
          <div className="pt-2 border-t border-gray-100">
            <p className="text-xs font-medium text-gray-400 mb-1">Description du problème</p>
            <p className="text-sm text-gray-600">{incident.description}</p>
          </div>
        )}
      </div>

      {/* Formulaire intervention */}
      <form action={formAction} className="space-y-5">
        <input type="hidden" name="old_status" value={incident.status} />

        {state?.error && (
          <div className="px-4 py-3 rounded-xl bg-red-50 border border-red-200 text-sm text-red-700">
            {state.error}
          </div>
        )}

        {/* Statut */}
        <div className="bg-white rounded-2xl border border-gray-200 p-4">
          <p className="text-sm font-semibold text-gray-700 mb-3">Statut de l&apos;intervention</p>
          <div className="space-y-2">
            {STATUS_OPTIONS.map((o) => (
              <label key={o.value} className="flex items-center gap-3 p-3 rounded-xl border border-gray-200 cursor-pointer">
                <input
                  type="radio"
                  name="status"
                  value={o.value}
                  defaultChecked={incident.status === o.value || (incident.status === 'assigné' && o.value === 'en_cours')}
                  className="accent-red-600"
                />
                <span className="text-sm text-gray-700">{o.label}</span>
              </label>
            ))}
          </div>
        </div>

        {/* Rapport */}
        <div className="bg-white rounded-2xl border border-gray-200 p-4">
          <p className="text-sm font-semibold text-gray-700 mb-3">Rapport d&apos;intervention</p>
          <textarea
            name="rapport"
            rows={4}
            defaultValue={incident.rapport_intervention ?? ''}
            placeholder="Décrivez les actions effectuées, l'état de la machine, les pièces changées..."
            className="w-full px-3 py-2.5 rounded-xl border border-gray-200 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-red-500 focus:border-transparent resize-none"
          />
        </div>

        {/* Pièces remplacées */}
        <div className="bg-white rounded-2xl border border-gray-200 p-4">
          <p className="text-sm font-semibold text-gray-700 mb-3">Pièces remplacées</p>
          <div className="grid grid-cols-2 gap-2">
            {PARTS.map((p) => (
              <label key={p.id} className="flex items-center gap-2.5 p-2.5 rounded-xl border border-gray-200 cursor-pointer">
                <input
                  type="checkbox"
                  name={`part_${p.id}`}
                  defaultChecked={checkedParts.has(p.id)}
                  className="w-4 h-4 rounded accent-red-600"
                />
                <span className="text-sm text-gray-700">{p.name}</span>
              </label>
            ))}
          </div>
          <div className="mt-3">
            <input
              name="autres_pieces"
              type="text"
              defaultValue={incident.autres_pieces ?? ''}
              placeholder="Autres pièces (libre)"
              className="w-full px-3 py-2.5 rounded-xl border border-gray-200 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-red-500 focus:border-transparent"
            />
          </div>
        </div>

        {/* Commentaire */}
        <div className="bg-white rounded-2xl border border-gray-200 p-4">
          <p className="text-sm font-semibold text-gray-700 mb-1">Commentaire</p>
          <p className="text-xs text-gray-400 mb-3">Ajouté à l&apos;historique si le statut change</p>
          <input
            name="comment"
            type="text"
            placeholder="Ex : Pièce commandée, retour prévu demain"
            className="w-full px-3 py-2.5 rounded-xl border border-gray-200 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-red-500 focus:border-transparent"
          />
        </div>

        <button
          type="submit"
          disabled={pending}
          className="w-full flex items-center justify-center gap-2 py-3.5 rounded-2xl text-sm font-semibold text-white disabled:opacity-60 transition-opacity"
          style={{ backgroundColor: '#BF0D0D' }}
        >
          {pending && <Loader2 size={16} className="animate-spin" />}
          Enregistrer l&apos;intervention
        </button>
      </form>
    </div>
  )
}
