'use client'

import { useState } from 'react'
import { Navigation, Loader2 } from 'lucide-react'
import { getPositionOnce } from '@/lib/pwa/geolocation'
import type { LatLng } from '@/lib/geo'

/**
 * Estado de «Plus proche» (averías y planning del técnico): al activarlo pide la posición una
 * vez para ordenar la lista. No la guarda en ningún sitio — es un orden de pantalla, no una
 * prueba de presencia. `origin` solo es no-null con el orden activo.
 */
export function useNearestSort() {
  const [origin, setOrigin] = useState<LatLng | null>(null)
  const [locating, setLocating] = useState(false)
  const [noPosition, setNoPosition] = useState(false)

  async function toggle() {
    if (origin) { setOrigin(null); return }
    setLocating(true)
    setNoPosition(false)
    const pos = await getPositionOnce(6000)
    setLocating(false)
    if (!pos) { setNoPosition(true); return }
    setOrigin({ lat: pos.lat, lng: pos.lng })
  }

  return { origin, locating, noPosition, toggle }
}

export function NearestToggle({ active, locating, onToggle }: {
  active: boolean
  locating: boolean
  onToggle: () => void
}) {
  return (
    <button
      onClick={onToggle}
      disabled={locating}
      className={`flex items-center gap-1.5 whitespace-nowrap px-4 py-2 rounded-full text-xs font-semibold border transition-colors disabled:opacity-60 ${
        active
          ? 'bg-accent text-white border-transparent'
          : 'bg-card text-ink-muted border-line hover:border-line'
      }`}
    >
      {locating ? <Loader2 size={13} className="animate-spin" /> : <Navigation size={13} />}
      Plus proche
    </button>
  )
}
