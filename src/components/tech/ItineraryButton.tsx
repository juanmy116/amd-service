'use client'

/**
 * Bouton « Itinéraire » de la fiche technicien : ouvre un petit menu avec les trois apps
 * (Google Maps, Waze, Plans). Préfère les coordonnées de la machine ; à défaut, l'adresse en
 * texte. Sans destination du tout (`itineraryLinks` renvoie `null`), le bouton ne s'affiche pas.
 */

import { useEffect, useRef, useState } from 'react'
import { Navigation } from 'lucide-react'
import { itineraryLinks, type LatLng } from '@/lib/geo'

type Props = {
  coords: LatLng | null
  text: string | null
  /** Classes du bouton déclencheur ; par défaut, le style « tarjeta » du reste de /tech. */
  className?: string
}

const APPS = [
  { key: 'google', label: 'Google Maps' },
  { key: 'waze', label: 'Waze' },
  { key: 'apple', label: 'Plans' },
] as const

const DEFAULT_TRIGGER_CLASS =
  'flex items-center justify-center gap-2 px-4 min-h-[44px] rounded-xl border border-line bg-card text-sm font-semibold text-ink shrink-0'

export default function ItineraryButton({ coords, text, className }: Props) {
  const [open, setOpen] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)

  // Fermer au clic en dehors : sans ça, le menu reste ouvert par-dessus le reste de la page.
  useEffect(() => {
    if (!open) return
    function onPointerDown(e: PointerEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('pointerdown', onPointerDown)
    return () => document.removeEventListener('pointerdown', onPointerDown)
  }, [open])

  const links = itineraryLinks({ coords, text })
  if (!links) return null

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-haspopup="menu"
        className={className ?? DEFAULT_TRIGGER_CLASS}
      >
        <Navigation size={16} className="text-accent" />
        Itinéraire
      </button>

      {open && (
        <div
          role="menu"
          aria-label="Choisir une application d'itinéraire"
          className="absolute right-0 z-20 mt-2 w-48 overflow-hidden rounded-xl border border-line bg-card shadow-lg"
        >
          {APPS.map((app) => (
            <a
              key={app.key}
              role="menuitem"
              href={links[app.key]}
              target="_blank"
              rel="noopener noreferrer"
              onClick={() => setOpen(false)}
              className="flex min-h-[44px] items-center border-b border-line-subtle px-4 text-sm text-ink-soft last:border-0 hover:bg-neutral-soft"
            >
              {app.label}
            </a>
          ))}
        </div>
      )}
    </div>
  )
}
