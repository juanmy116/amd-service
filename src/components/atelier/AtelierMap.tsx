'use client'

import { useMemo } from 'react'
import { DAKAR_FRAME, bubbleRadius, isInsideFrame, latLngToPercent } from '@/lib/atelier/mapFrame'
import { NO_QUARTIER, countByQuartier, type BoardIncident, type BoardMaintenance } from '@/lib/atelier/board'
import type { Quartier } from '@/lib/quartiers'

type Props = {
  incidents: BoardIncident[]
  maintenances: BoardMaintenance[]
  quartiers: Quartier[]
  selectedQuartier: string | null
  onSelectQuartier: (code: string | null) => void
}

const DAKAR = 'Dakar'

export default function AtelierMap({
  incidents, maintenances, quartiers, selectedQuartier, onSelectQuartier,
}: Props) {
  const panneCounts = useMemo(() => countByQuartier(incidents), [incidents])
  const maintCounts = useMemo(() => countByQuartier(maintenances), [maintenances])

  // Burbujas: solo las zonas de Dakar que caen dentro de la foto y tienen algo que enseñar.
  const bubbles = quartiers
    .filter((q) => q.ville === DAKAR)
    .map((q) => {
      const point = latLngToPercent(q.lat, q.lng, DAKAR_FRAME)
      return { quartier: q, point, pannes: panneCounts.get(q.code) ?? 0, maints: maintCounts.get(q.code) ?? 0 }
    })
    .filter((b) => isInsideFrame(b.point) && (b.pannes > 0 || b.maints > 0))

  // Chips: las otras ciudades con avisos, más los que no se pueden situar.
  const cityChips = useMemo(() => {
    const byCity = new Map<string, { codes: string[]; count: number }>()
    for (const q of quartiers) {
      const count = (panneCounts.get(q.code) ?? 0) + (maintCounts.get(q.code) ?? 0)
      if (count === 0) continue
      const entry = byCity.get(q.ville) ?? { codes: [], count: 0 }
      entry.codes.push(q.code)
      entry.count += count
      byCity.set(q.ville, entry)
    }
    return [...byCity.entries()]
      .filter(([ville]) => ville !== DAKAR)
      .map(([ville, { codes, count }]) => ({ ville, code: codes[0]!, count }))
      .sort((a, b) => b.count - a.count)
  }, [quartiers, panneCounts, maintCounts])

  const orphanCount = (panneCounts.get(NO_QUARTIER) ?? 0) + (maintCounts.get(NO_QUARTIER) ?? 0)
  const dakarCount = bubbles.reduce((sum, b) => sum + b.pannes + b.maints, 0)

  return (
    <section className="flex flex-1 flex-col min-h-0 gap-2">
      <div className="flex items-center justify-between px-1 shrink-0">
        <span className="text-sm font-bold uppercase tracking-wide text-white">
          {selectedQuartier ? 'Zone filtrée' : 'Dakar'}
        </span>
        <div className="flex items-center gap-4 text-xs font-semibold text-white/50">
          <span className="flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-full bg-accent" /> Pannes
          </span>
          <span className="flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-full" style={{ background: '#2563EB' }} /> Maintenances
          </span>
        </div>
      </div>

      <div className="relative flex-1 min-h-0 overflow-hidden rounded-xl border-2 border-white/[0.05]">
        {/* La foto es local: la Raspberry no necesita Internet ni servicio de mapas */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/images/atelier/dakar.jpg"
          alt="Carte de Dakar"
          className="absolute inset-0 h-full w-full object-cover"
        />

        {bubbles.map(({ quartier, point, pannes, maints }) => {
          const active = selectedQuartier === quartier.code
          const total = pannes + maints
          const radius = bubbleRadius(total)
          const hasPannes = pannes > 0

          return (
            <button
              key={quartier.code}
              type="button"
              onClick={() => onSelectQuartier(active ? null : quartier.code)}
              className="absolute -translate-x-1/2 -translate-y-1/2 transition-transform hover:scale-110 focus:outline-none"
              style={{ left: `${point.x}%`, top: `${point.y}%` }}
              title={`${quartier.label} — ${pannes} panne(s), ${maints} maintenance(s)`}
            >
              <span
                className="flex items-center justify-center rounded-full font-extrabold text-white shadow-lg"
                style={{
                  width: radius * 2,
                  height: radius * 2,
                  background: hasPannes ? '#BF0D0D' : '#2563EB',
                  fontSize: Math.max(14, radius * 0.8),
                  boxShadow: `0 0 0 ${active ? 6 : 10}px ${hasPannes ? 'rgba(191,13,13,.22)' : 'rgba(37,99,235,.22)'}${active ? ', 0 0 0 3px #fff' : ''}`,
                }}
              >
                {total}
              </span>
              <span className="mt-1.5 block whitespace-nowrap text-center text-[11px] font-bold uppercase tracking-wide text-white drop-shadow-[0_1px_3px_rgba(0,0,0,.9)]">
                {quartier.label.split(' · ')[0]}
              </span>
              {/* Cuando la zona mezcla pannes y maintenances, un punto azul lo avisa */}
              {hasPannes && maints > 0 && (
                <span
                  className="absolute right-0 top-0 h-3.5 w-3.5 rounded-full border-2 border-[#0E0E12]"
                  style={{ background: '#2563EB' }}
                />
              )}
            </button>
          )
        })}

        <p className="absolute bottom-1.5 right-2 rounded bg-black/40 px-1.5 py-0.5 text-[10px] text-white/45">
          Imagery: Esri, Maxar
        </p>
      </div>

      {/* Chips: Dakar (para deshacer el filtro), otras ciudades y los avisos sin ubicar */}
      <div className="flex flex-wrap gap-2 shrink-0">
        <button
          type="button"
          onClick={() => onSelectQuartier(null)}
          className={[
            'rounded-full border px-3 py-1 text-xs font-bold transition-colors',
            selectedQuartier === null
              ? 'border-accent/50 bg-accent/20 text-white'
              : 'border-white/10 bg-white/5 text-white/70 hover:text-white',
          ].join(' ')}
        >
          Tout Dakar <span className="text-accent">{dakarCount}</span>
        </button>

        {cityChips.map((chip) => (
          <button
            key={chip.ville}
            type="button"
            onClick={() => onSelectQuartier(selectedQuartier === chip.code ? null : chip.code)}
            className={[
              'rounded-full border px-3 py-1 text-xs font-bold transition-colors',
              selectedQuartier === chip.code
                ? 'border-accent/50 bg-accent/20 text-white'
                : 'border-white/10 bg-white/5 text-white/70 hover:text-white',
            ].join(' ')}
          >
            {chip.ville} <span className="text-accent">{chip.count}</span>
          </button>
        ))}

        {orphanCount > 0 && (
          <button
            type="button"
            onClick={() => onSelectQuartier(selectedQuartier === NO_QUARTIER ? null : NO_QUARTIER)}
            className={[
              'rounded-full border px-3 py-1 text-xs font-bold transition-colors',
              selectedQuartier === NO_QUARTIER
                ? 'border-warning/50 bg-warning/20 text-white'
                : 'border-white/10 bg-white/5 text-white/50 hover:text-white',
            ].join(' ')}
            title="Ces avis n'ont pas de quartier: à compléter dans /admin/clients"
          >
            Sans quartier <span className="text-warning">{orphanCount}</span>
          </button>
        )}
      </div>
    </section>
  )
}
