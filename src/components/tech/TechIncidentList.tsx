'use client'

import Link from 'next/link'
import { useState } from 'react'
import { Navigation, MapPin, Loader2 } from 'lucide-react'
import { Badge } from '@/components/ui/Badge'
import type { BadgeVariant } from '@/components/ui/Badge'
import { getIncidentDisplayName } from '@/lib/incident'
import { getPositionOnce } from '@/lib/pwa/geolocation'
import { sortByDistance, distanceMeters, formatDistance, type LatLng } from '@/lib/geo'

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

const STATUS_BADGE: Record<string, BadgeVariant> = {
  nouveau: 'info', assigné: 'violet', en_cours: 'warning', résolu: 'success', fermé: 'neutral',
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
  machine_id: string | null
  clients: { nom_client: string } | null
  /** Coordonnées de la machine (les siennes, ou le centre de son quartier), pour « Plus proche ». */
  coords: LatLng | null
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
  const [nearest, setNearest] = useState(false)
  const [origin, setOrigin] = useState<LatLng | null>(null)
  const [locating, setLocating] = useState(false)
  const [noPosition, setNoPosition] = useState(false)

  const urgentCount = incidents.filter(i => i.priority === 'urgente').length
  const todayCount  = incidents.filter(i => isToday(i.created_at)).length

  let filtered = incidents.filter(i => {
    if (filter === 'urgent') return i.priority === 'urgente'
    if (filter === 'today')  return isToday(i.created_at)
    return true
  })
  // « Plus proche » ne change pas l'ordre par défaut tant qu'on ne l'a pas activé.
  if (nearest && origin) {
    filtered = sortByDistance(filtered, origin, i => i.coords)
  }

  const chips: { key: Filter; label: string; count: number }[] = [
    { key: 'all',    label: 'Tous',        count: incidents.length },
    { key: 'urgent', label: 'Urgents',     count: urgentCount },
    { key: 'today',  label: "Aujourd'hui", count: todayCount },
  ]

  async function toggleNearest() {
    if (nearest) { setNearest(false); return }
    setLocating(true)
    setNoPosition(false)
    const pos = await getPositionOnce(6000)
    setLocating(false)
    if (!pos) { setNoPosition(true); return }
    setOrigin({ lat: pos.lat, lng: pos.lng })
    setNearest(true)
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 overflow-x-auto pb-1 -mx-4 px-4">
        {chips.map(chip => (
          <button
            key={chip.key}
            onClick={() => setFilter(chip.key)}
            className={`whitespace-nowrap px-4 py-1.5 rounded-full text-xs font-semibold border transition-colors ${
              filter === chip.key
                ? 'bg-accent text-white border-transparent'
                : 'bg-card text-ink-muted border-line hover:border-line'
            }`}
          >
            {chip.label} ({chip.count})
          </button>
        ))}
        <button
          onClick={toggleNearest}
          disabled={locating}
          className={`flex items-center gap-1.5 whitespace-nowrap px-4 py-2 rounded-full text-xs font-semibold border transition-colors disabled:opacity-60 ${
            nearest
              ? 'bg-accent text-white border-transparent'
              : 'bg-card text-ink-muted border-line hover:border-line'
          }`}
        >
          {locating ? <Loader2 size={13} className="animate-spin" /> : <Navigation size={13} />}
          Plus proche
        </button>
      </div>

      {noPosition && (
        <p className="text-xs text-ink-muted px-1">Position indisponible.</p>
      )}

      {filtered.length === 0 ? (
        <p className="text-sm text-ink-muted text-center py-12">Aucune intervention</p>
      ) : (
        <div className="space-y-3">
          {filtered.map(inc => {
            const distance = nearest && origin && inc.coords
              ? formatDistance(distanceMeters(origin, inc.coords))
              : null
            return (
            <Link
              key={inc.id}
              href={`/tech/incidents/${inc.id}`}
              className="relative flex items-center justify-between bg-card rounded-[var(--radius-card)] border border-line p-4 pl-5 overflow-hidden active:scale-[0.98] transition-transform"
            >
              <div
                className="absolute left-0 top-0 bottom-0 w-1"
                style={{ backgroundColor: PRIORITY_COLOR[inc.priority] ?? '#9CA3AF' }}
              />
              <div className="min-w-0 flex-1">
                <p className="font-mono text-[10px] font-semibold tracking-wide mb-0.5 text-accent">
                  {inc.numero_incident}
                </p>
                <p className="text-sm font-semibold text-ink truncate">
                  {getIncidentDisplayName(inc)}
                </p>
                <p className="text-xs text-ink-muted truncate mt-0.5">{inc.title}</p>
                <div className="flex items-center gap-2 mt-1.5">
                  <span
                    className="text-[10px] font-bold uppercase tracking-wide"
                    style={{ color: PRIORITY_COLOR[inc.priority] ?? '#9CA3AF' }}
                  >
                    {PRIORITY_LABEL[inc.priority] ?? inc.priority}
                  </span>
                  <span className="text-gray-300">·</span>
                  <span className="text-[10px] text-ink-muted">
                    {new Date(inc.created_at).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })}
                  </span>
                  {distance && (
                    <>
                      <span className="text-gray-300">·</span>
                      <span className="flex items-center gap-0.5 text-[10px] text-ink-muted">
                        <MapPin size={10} />
                        {distance}
                      </span>
                    </>
                  )}
                </div>
              </div>
              <span className="shrink-0 ml-3">
                <Badge variant={STATUS_BADGE[inc.status] ?? 'neutral'}>
                  {STATUS_LABEL[inc.status] ?? inc.status}
                </Badge>
              </span>
            </Link>
            )
          })}
        </div>
      )}
    </div>
  )
}
