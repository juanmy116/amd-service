'use client'

import { useMemo } from 'react'
import { DAKAR_FRAME, bubbleRadius, isInsideFrame, latLngToPercent } from '@/lib/atelier/mapFrame'
import {
  NO_QUARTIER,
  countByQuartier,
  isPendingMaintenance,
  type BoardIncident,
  type BoardMaintenance,
} from '@/lib/atelier/board'
import type { Quartier } from '@/lib/quartiers'

/** Una selección del mapa: qué zonas incluye y cómo se llama lo seleccionado. */
export type QuartierSelection = { id: string; label: string; codes: string[] }

type Props = {
  incidents: BoardIncident[]
  maintenances: BoardMaintenance[]
  quartiers: Quartier[]
  selected: QuartierSelection | null
  onSelect: (selection: QuartierSelection | null) => void
}

const DAKAR = 'Dakar'

/**
 * Las medidas de las burbujas se expresan en `rem` para que crezcan con el tamaño base del
 * kiosko (ver `src/app/atelier/layout.tsx`). En píxeles fijos se quedarían pequeñas al agrandar
 * el texto, y el mapa perdería peso frente a las columnas.
 */
const rem = (px: number) => `${px / 16}rem`

export default function AtelierMap({ incidents, maintenances, quartiers, selected, onSelect }: Props) {
  const panneCounts = useMemo(() => countByQuartier(incidents), [incidents])

  // Solo lo PENDIENTE: la columna esconde las visitas ya hechas, así que contarlas aquí
  // pintaría burbujas que al pulsarlas no enseñan nada.
  const maintCounts = useMemo(
    () => countByQuartier(maintenances.filter(isPendingMaintenance)),
    [maintenances]
  )

  const countOf = (code: string) => (panneCounts.get(code) ?? 0) + (maintCounts.get(code) ?? 0)

  const dakarZones = useMemo(
    () => quartiers
      .filter((q) => q.ville === DAKAR)
      .map((q) => ({ quartier: q, point: latLngToPercent(q.lat, q.lng, DAKAR_FRAME) })),
    [quartiers]
  )

  // Burbujas: zonas de Dakar dentro de la foto y con algo que enseñar.
  const bubbles = dakarZones
    .filter(({ point }) => isInsideFrame(point))
    .map(({ quartier, point }) => ({
      quartier, point,
      pannes: panneCounts.get(quartier.code) ?? 0,
      maints: maintCounts.get(quartier.code) ?? 0,
    }))
    .filter((b) => b.pannes > 0 || b.maints > 0)

  // Chips: una ciudad = todas sus zonas (si Thiès tuviera dos barrios, el chip los agrupa).
  // Se añaden también las zonas de Dakar que caen FUERA del encuadre de la foto: sin chip,
  // sus avisos serían inalcanzables desde el mapa.
  const chips = useMemo(() => {
    const outsideDakar = new Set(
      dakarZones.filter(({ point }) => !isInsideFrame(point)).map(({ quartier }) => quartier.code)
    )

    const groups = new Map<string, { id: string; label: string; codes: string[]; count: number }>()
    for (const q of quartiers) {
      const count = (panneCounts.get(q.code) ?? 0) + (maintCounts.get(q.code) ?? 0)
      if (count === 0) continue
      if (q.ville === DAKAR && !outsideDakar.has(q.code)) continue // ya tiene burbuja

      // La clave agrupa; la etiqueta solo se pinta. Son espacios distintos (una ciudad puede
      // llamarse igual que el barrio de otra), así que la identidad va por clave.
      const key = outsideDakar.has(q.code) ? q.code : q.ville
      const entry = groups.get(key) ?? {
        id: key,
        label: outsideDakar.has(q.code) ? q.label : q.ville,
        codes: [],
        count: 0,
      }
      entry.codes.push(q.code)
      entry.count += count
      groups.set(key, entry)
    }
    return [...groups.values()].sort((a, b) => b.count - a.count)
  }, [quartiers, dakarZones, panneCounts, maintCounts])

  const orphanCount = countOf(NO_QUARTIER)
  const totalCount = incidents.length + maintenances.filter(isPendingMaintenance).length

  // Ojo: las clases van LITERALES. Tailwind rastrea el código buscando cadenas completas,
  // así que una construida con plantilla (`bg-${tone}/20`) no acaba nunca en el CSS y el chip
  // seleccionado se quedaría sin su relleno de color.
  const CHIP_BASE = 'rounded-full border px-3 py-1 text-xs font-bold transition-colors'
  const CHIP_OFF = 'border-white/10 bg-white/5 text-white/70 hover:text-white'
  const CHIP_ON = 'border-accent/50 bg-accent/20 text-white'
  const CHIP_ON_WARNING = 'border-warning/50 bg-warning/20 text-white'

  const chipClass = (active: boolean, tone: 'accent' | 'warning' = 'accent') =>
    [CHIP_BASE, active ? (tone === 'warning' ? CHIP_ON_WARNING : CHIP_ON) : CHIP_OFF].join(' ')

  return (
    <section className="flex flex-1 flex-col min-h-0 gap-2">
      <div className="flex items-center justify-between px-1 shrink-0">
        <span className="text-sm font-bold uppercase tracking-wide text-white">
          {selected ? selected.label : 'Dakar'}
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
          const active = selected?.codes.includes(quartier.code) ?? false
          const total = pannes + maints
          const radius = bubbleRadius(total)
          const hasPannes = pannes > 0

          return (
            <button
              key={quartier.code}
              type="button"
              onClick={() =>
                onSelect(active ? null : { id: quartier.code, label: quartier.label, codes: [quartier.code] })
              }
              className="absolute -translate-x-1/2 -translate-y-1/2 transition-transform hover:scale-110 focus:outline-none"
              style={{ left: `${point.x}%`, top: `${point.y}%` }}
              title={`${quartier.label} — ${pannes} panne(s), ${maints} maintenance(s)`}
            >
              <span
                className="flex items-center justify-center rounded-full font-extrabold text-white shadow-lg"
                style={{
                  width: rem(radius * 2),
                  height: rem(radius * 2),
                  background: hasPannes ? '#BF0D0D' : '#2563EB',
                  fontSize: rem(Math.max(14, radius * 0.8)),
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

      {/* «Tout» quita el filtro y por eso cuenta TODO, incluidas las otras ciudades y los
          avisos sin ubicar: si contara solo Dakar, el número no cuadraría con las listas. */}
      <div className="flex flex-wrap gap-2 shrink-0">
        <button type="button" onClick={() => onSelect(null)} className={chipClass(selected === null)}>
          Tout <span className="text-accent">{totalCount}</span>
        </button>

        {chips.map((chip) => {
          const active = selected?.id === chip.id
          return (
            <button
              key={chip.id}
              type="button"
              onClick={() =>
                onSelect(active ? null : { id: chip.id, label: chip.label, codes: chip.codes })
              }
              className={chipClass(active)}
            >
              {chip.label} <span className="text-accent">{chip.count}</span>
            </button>
          )
        })}

        {orphanCount > 0 && (
          <button
            type="button"
            onClick={() =>
              onSelect(
                selected?.id === NO_QUARTIER
                  ? null
                  : { id: NO_QUARTIER, label: 'Sans quartier', codes: [NO_QUARTIER] }
              )
            }
            className={chipClass(selected?.id === NO_QUARTIER, 'warning')}
            title="Ces avis n'ont pas de quartier: à compléter dans /admin/clients"
          >
            Sans quartier <span className="text-warning">{orphanCount}</span>
          </button>
        )}
      </div>
    </section>
  )
}
