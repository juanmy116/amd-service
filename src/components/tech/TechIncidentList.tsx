'use client'

import Link from 'next/link'
import { useState } from 'react'

const PRIORITY_COLOR: Record<string, string> = {
  urgente: '#BF0D0D',
  haute:   '#F97316',
  normale: '#3B82F6',
  basse:   '#9CA3AF',
}

const PRIORITY_LABEL: Record<string, string> = {
  urgente: 'Urgente',
  haute:   'Haute',
  normale: 'Normale',
  basse:   'Basse',
}

const STATUS_STYLE: Record<string, string> = {
  nouveau:  'bg-blue-50 text-blue-700',
  assigné:  'bg-purple-50 text-purple-700',
  en_cours: 'bg-amber-50 text-amber-700',
  résolu:   'bg-green-50 text-green-700',
  fermé:    'bg-gray-100 text-gray-500',
}

const STATUS_LABEL: Record<string, string> = {
  nouveau: 'Nouveau', assigné: 'Assigné', en_cours: 'En cours', résolu: 'Résolu', fermé: 'Fermé',
}

export type TechIncident = {
  id: string
  numero_incident: string
  title: string
  status: string
  priority: string
  created_at: string
  clients: { nom_client: string } | null
}

type Filter = 'all' | 'urgent' | 'today'

function isToday(dateStr: string): boolean {
  const d = new Date(dateStr)
  const now = new Date()
  return (
    d.getFullYear() === now.getFullYear() &&
    d.getMonth()    === now.getMonth()    &&
    d.getDate()     === now.getDate()
  )
}

export default function TechIncidentList({ incidents }: { incidents: TechIncident[] }) {
  const [filter, setFilter] = useState<Filter>('all')

  const urgentCount = incidents.filter(i => i.priority === 'urgente').length
  const todayCount  = incidents.filter(i => isToday(i.created_at)).length

  const filtered = incidents.filter(i => {
    if (filter === 'urgent') return i.priority === 'urgente'
    if (filter === 'today')  return isToday(i.created_at)
    return true
  })

  const chips: { key: Filter; label: string; count: number }[] = [
    { key: 'all',    label: 'Tous',        count: incidents.length },
    { key: 'urgent', label: 'Urgents',     count: urgentCount },
    { key: 'today',  label: "Aujourd'hui", count: todayCount },
  ]

  return (
    <div className="space-y-4">
      <div className="flex gap-2 overflow-x-auto pb-1 -mx-4 px-4">
        {chips.map(chip => (
          <button
            key={chip.key}
            onClick={() => setFilter(chip.key)}
            className={`whitespace-nowrap px-4 py-1.5 rounded-full text-xs font-semibold border transition-colors ${
              filter === chip.key
                ? 'text-white border-transparent'
                : 'bg-white text-gray-500 border-gray-200 hover:border-gray-300'
            }`}
            style={filter === chip.key ? { backgroundColor: '#BF0D0D' } : {}}
          >
            {chip.label} ({chip.count})
          </button>
        ))}
      </div>

      {filtered.length === 0 ? (
        <p className="text-sm text-gray-400 text-center py-12">Aucune intervention</p>
      ) : (
        <div className="space-y-3">
          {filtered.map(inc => (
            <Link
              key={inc.id}
              href={`/tech/incidents/${inc.id}`}
              className="relative flex items-center justify-between bg-white rounded-xl border border-gray-200 p-4 pl-5 overflow-hidden active:scale-[0.98] transition-transform"
            >
              <div
                className="absolute left-0 top-0 bottom-0 w-1"
                style={{ backgroundColor: PRIORITY_COLOR[inc.priority] ?? '#9CA3AF' }}
              />
              <div className="min-w-0 flex-1">
                <p className="font-mono text-[10px] font-semibold tracking-wide mb-0.5" style={{ color: '#BF0D0D' }}>
                  {inc.numero_incident}
                </p>
                <p className="text-sm font-semibold text-gray-900 truncate">
                  {inc.clients?.nom_client ?? inc.title}
                </p>
                <p className="text-xs text-gray-500 truncate mt-0.5">{inc.title}</p>
                <div className="flex items-center gap-2 mt-1.5">
                  <span
                    className="text-[10px] font-bold uppercase tracking-wide"
                    style={{ color: PRIORITY_COLOR[inc.priority] ?? '#9CA3AF' }}
                  >
                    {PRIORITY_LABEL[inc.priority] ?? inc.priority}
                  </span>
                  <span className="text-gray-300">·</span>
                  <span className="text-[10px] text-gray-400">
                    {new Date(inc.created_at).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })}
                  </span>
                </div>
              </div>
              <span className={`shrink-0 ml-3 inline-flex px-2 py-0.5 rounded text-xs font-medium ${STATUS_STYLE[inc.status] ?? ''}`}>
                {STATUS_LABEL[inc.status] ?? inc.status}
              </span>
            </Link>
          ))}
        </div>
      )}
    </div>
  )
}
