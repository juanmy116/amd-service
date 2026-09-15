'use client'

import { useMemo } from 'react'
import { bubbleRadius } from '@/lib/atelier/mapFrame'
import {
  buildMapItems,
  isBubbleActive,
  isSelectionActive,
  viewForCodes,
  type MapChip,
  type MapViewId,
} from '@/lib/atelier/mapView'
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
  /** Qué foto se está mirando. Vive en el tablero para que el reposo la devuelva a «Dakar». */
  view: MapViewId
  onViewChange: (view: MapViewId) => void
  onSelect: (selection: QuartierSelection | null) => void
}

/** La foto de fondo de cada vista. Las dos son locales: la Raspberry no necesita Internet. */
const BACKGROUND: Record<MapViewId, string> = {
  dakar: '/images/atelier/dakar.jpg',
  region: '/images/atelier/region.jpg',
}

/** Tamaño de las dos fotos. Manda la proporción de la caja del mapa (ver mapFrame.ts). */
const MAP_WIDTH = 1100
const MAP_HEIGHT = 1000

const VIEW_LABEL: Record<MapViewId, string> = { dakar: 'Dakar', region: 'Région' }

/**
 * Las medidas de las burbujas se expresan en `rem` para que crezcan con el tamaño base del
 * kiosko (ver `src/app/atelier/layout.tsx`). En píxeles fijos se quedarían pequeñas al agrandar
 * el texto, y el mapa perdería peso frente a las columnas.
 */
const rem = (px: number) => `${px / 16}rem`

export default function AtelierMap({
  incidents, maintenances, quartiers, selected, view, onViewChange, onSelect,
}: Props) {
  const panneCounts = useMemo(() => countByQuartier(incidents), [incidents])

  // Solo lo PENDIENTE: la columna esconde las visitas ya hechas, así que contarlas aquí
  // pintaría burbujas que al pulsarlas no enseñan nada.
  const maintCounts = useMemo(
    () => countByQuartier(maintenances.filter(isPendingMaintenance)),
    [maintenances]
  )

  const { bubbles, chips } = useMemo(
    () => buildMapItems(quartiers, panneCounts, maintCounts, view),
    [quartiers, panneCounts, maintCounts, view]
  )

  const orphanCount = (panneCounts.get(NO_QUARTIER) ?? 0) + (maintCounts.get(NO_QUARTIER) ?? 0)
  const totalCount = incidents.length + maintenances.filter(isPendingMaintenance).length

  /**
   * Un chip lleva a la vista donde su zona se ve: pulsar «Diass» desde Dakar cambia de foto y
   * allí la zona ya es una burbuja. Lo que no está en ninguna de las dos fotos (Touba) solo
   * filtra las listas, sin mover el mapa.
   */
  function selectChip(chip: MapChip, active: boolean) {
    if (active) return onSelect(null)
    const target = viewForCodes(chip.codes, quartiers)
    if (target && target !== view) onViewChange(target)
    onSelect({ id: chip.id, label: chip.label, codes: chip.codes })
  }

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
      <div className="flex items-center justify-between gap-3 px-1 shrink-0">
        {/* Conmutador de foto: el casco urbano o toda la región (Diass, Thiès, Mbour…) */}
        <div className="flex items-center gap-1 rounded-lg bg-white/5 p-0.5">
          {(['dakar', 'region'] as const).map((id) => (
            <button
              key={id}
              type="button"
              onClick={() => onViewChange(id)}
              aria-pressed={view === id}
              className={[
                'rounded-md px-2.5 py-1 text-xs font-bold uppercase tracking-wide transition-colors',
                view === id ? 'bg-white text-ink' : 'text-white/60 hover:text-white',
              ].join(' ')}
            >
              {VIEW_LABEL[id]}
            </button>
          ))}
        </div>

        <span className="min-w-0 truncate text-sm font-bold uppercase tracking-wide text-white">
          {selected?.label ?? ''}
        </span>

        <div className="flex items-center gap-4 text-xs font-semibold text-white/50 shrink-0">
          <span className="flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-full bg-accent" /> Pannes
          </span>
          <span className="flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-full" style={{ background: '#2563EB' }} /> Maintenances
          </span>
        </div>
      </div>

      {/* La caja de la foto conserva SU proporción (ver mapFrame.ts): las burbujas se colocan en
          porcentaje sobre ella, así que si se deformara o se recortara dejarían de caer sobre su
          barrio. Por eso la foto manda sobre el hueco, y no al revés. */}
      <div className="flex flex-1 min-h-0 items-center justify-center" style={{ containerType: 'size' }}>
        <div
          // `w-full` es la red de seguridad del ancho de abajo: los hijos de esta caja son todos
          // absolutos, así que un navegador que no entienda `cqh` descartaría esa declaración
          // inline y se quedaría con un ancho de contenido de cero, es decir sin mapa. Al vivir en
          // una clase, este 100% sobrevive a ese descarte (el estilo inline solo lo tapa cuando es
          // válido), y el peor caso pasa a ser un mapa algo alto de más en vez de un hueco negro.
          className="relative w-full overflow-hidden rounded-xl border-2 border-white/[0.05]"
          style={{
            aspectRatio: `${MAP_WIDTH} / ${MAP_HEIGHT}`,
            // La foto crece hasta llenar el hueco por el lado que se agote antes: el ancho
            // disponible, o el que le permite el alto (`cqh` = alto del hueco). Sin esto habría
            // que elegir entre deformarla o recortarla, y las dos cosas descolocan las burbujas.
            width: `min(100%, ${((MAP_WIDTH / MAP_HEIGHT) * 100).toFixed(2)}cqh)`,
          }}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={BACKGROUND[view]}
            alt={view === 'dakar' ? 'Carte de Dakar' : 'Carte de la région de Dakar'}
            className="absolute inset-0 h-full w-full object-fill"
          />

          {bubbles.map((bubble) => {
            const active = isBubbleActive(bubble, selected?.codes ?? null)
            const total = bubble.pannes + bubble.maints
            const radius = bubbleRadius(total)
            const hasPannes = bubble.pannes > 0

            return (
              <button
                key={bubble.id}
                type="button"
                onClick={() =>
                  onSelect(active ? null : { id: bubble.id, label: bubble.label, codes: bubble.codes })
                }
                className="absolute -translate-x-1/2 -translate-y-1/2 transition-transform hover:scale-110 focus:outline-none"
                style={{ left: `${bubble.x}%`, top: `${bubble.y}%` }}
                title={`${bubble.label} — ${bubble.pannes} panne(s), ${bubble.maints} maintenance(s)`}
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
                  {bubble.label.split(' · ')[0]}
                </span>
                {/* Cuando la zona mezcla pannes y maintenances, un punto azul lo avisa */}
                {hasPannes && bubble.maints > 0 && (
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
      </div>

      {/* «Tout» quita el filtro y por eso cuenta TODO, incluidas las otras ciudades y los
          avisos sin ubicar: si contara solo Dakar, el número no cuadraría con las listas. */}
      <div className="flex flex-wrap gap-2 shrink-0">
        <button type="button" onClick={() => onSelect(null)} className={chipClass(selected === null)}>
          Tout <span className="text-accent">{totalCount}</span>
        </button>

        {chips.map((chip) => {
          const active = isSelectionActive(chip.codes, selected?.codes ?? null)
          return (
            <button
              key={chip.id}
              type="button"
              onClick={() => selectChip(chip, active)}
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
