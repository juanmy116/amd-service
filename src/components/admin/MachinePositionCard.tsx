'use client'

import { useActionState, useState, useTransition } from 'react'
import { MapPin, ExternalLink } from 'lucide-react'
import { Card } from '@/components/ui/Card'

type FormState = { error: string } | null

type Props = {
  lat: number | null
  lng: number | null
  accuracy: number | null
  source: 'first_scan' | 'admin' | null
  setAt: string | null
  /** Nom du technicien qui a fait le premier scan (résolu côté serveur), pour l'origine « admin » c'est inutile. */
  setByName: string | null
  setAction: (prev: FormState, data: FormData) => Promise<FormState>
  clearAction: () => Promise<FormState>
}

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' })
}

const inputClass =
  'w-full px-3.5 py-2.5 rounded-lg border border-line text-ink text-sm placeholder-ink-muted bg-card focus:outline-none focus:ring-2 focus:ring-accent/30 focus:border-accent'

export default function MachinePositionCard({
  lat, lng, accuracy, source, setAt, setByName, setAction, clearAction,
}: Props) {
  const [state, formAction, pending] = useActionState(setAction, null)
  const [clearing, startClear] = useTransition()
  const [clearError, setClearError] = useState<string | null>(null)

  const hasPosition = lat != null && lng != null
  const mapUrl = hasPosition ? `https://www.google.com/maps/search/?api=1&query=${lat},${lng}` : null

  const originText =
    source === 'first_scan'
      ? `Premier scan de ${setByName ?? 'un technicien'}${setAt ? ` le ${fmtDate(setAt)}` : ''}`
      : source === 'admin'
        ? `Saisie manuelle${setAt ? ` le ${fmtDate(setAt)}` : ''}`
        : null

  function handleClear() {
    if (!window.confirm('Effacer la position enregistrée de cette machine ?')) return
    setClearError(null)
    startClear(async () => {
      const result = await clearAction()
      if (result?.error) setClearError(result.error)
    })
  }

  return (
    <Card className="p-6 space-y-4 mt-6">
      <div className="flex items-center gap-2">
        <MapPin size={16} className="text-ink-muted" />
        <h2 className="text-sm font-semibold text-ink">Position</h2>
      </div>

      {hasPosition ? (
        <div className="space-y-1.5">
          <p className="text-sm font-mono text-ink">
            {lat!.toFixed(5)}, {lng!.toFixed(5)}
          </p>
          {accuracy != null && (
            <p className="text-xs text-ink-muted">Précision : ± {Math.round(accuracy)} m</p>
          )}
          {originText && <p className="text-xs text-ink-muted">{originText}</p>}
          {mapUrl && (
            <a
              href={mapUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 text-xs font-medium text-accent hover:underline"
            >
              Voir sur la carte <ExternalLink size={12} />
            </a>
          )}
        </div>
      ) : (
        <p className="text-sm text-ink-muted">
          Position inconnue — elle sera enregistrée au premier scan sur place.
        </p>
      )}

      {(state?.error || clearError) && (
        <div className="px-4 py-3 rounded-lg bg-accent-soft border border-accent/20 text-sm text-accent">
          {state?.error ?? clearError}
        </div>
      )}

      <form action={formAction} className="flex items-end gap-2">
        <div className="flex-1">
          <label className="block text-xs font-medium text-ink-soft mb-1.5">
            Coller un lien Google Maps ou « lat, lng »
          </label>
          <input name="text" type="text" placeholder="14.6928, -17.4467" className={inputClass} />
        </div>
        <button
          type="submit"
          disabled={pending}
          className="px-4 py-2.5 rounded-lg text-sm font-medium text-white bg-accent disabled:opacity-60 transition-opacity hover:opacity-90"
        >
          Enregistrer
        </button>
      </form>

      {hasPosition && (
        <button
          type="button"
          onClick={handleClear}
          disabled={clearing}
          className="text-xs font-medium text-accent hover:underline disabled:opacity-60"
        >
          Effacer la position
        </button>
      )}
    </Card>
  )
}
