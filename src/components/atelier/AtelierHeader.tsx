'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'
import { Map, Columns3 } from 'lucide-react'

type Props = {
  kpis: { sansTechnicien: number; enCours: number; urgentes: number; resolusSemaine: number }
  /** Vista activa, para resaltar el botón correspondiente. */
  view: 'carte' | 'kanban'
}

const KPI_STYLE = 'flex items-center gap-1.5 text-base font-bold tabular-nums'
const DOT = 'w-2.5 h-2.5 rounded-full'

export default function AtelierHeader({ kpis, view }: Props) {
  const [now, setNow] = useState<Date | null>(null)

  useEffect(() => {
    setNow(new Date())
    const t = setInterval(() => setNow(new Date()), 1000)
    return () => clearInterval(t)
  }, [])

  const clock = now
    ? now.toLocaleDateString('fr-FR', { weekday: 'short', day: 'numeric', month: 'short' }) +
      ' · ' +
      now.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })
    : ''

  return (
    <header className="flex items-center justify-between gap-6 shrink-0">
      <div className="flex items-center gap-3 shrink-0">
        {/* Logo oficial en blanco: el mismo SVG que la etiqueta QR, sobre fondo oscuro */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/images/logos/logo-amd-blanco.svg" alt="AMD Service" className="h-9 w-auto" />
        <span className="text-lg font-semibold text-white/40 border-l border-white/15 pl-3">
          Atelier
        </span>
      </div>

      {/* Los cuatro números del día, en la misma línea para no robarle alto al mapa */}
      <div className="flex items-center gap-6">
        <span className={`${KPI_STYLE} text-accent`}>
          <span className={DOT} style={{ background: '#BF0D0D' }} />
          {kpis.sansTechnicien}
          <span className="text-sm font-semibold text-white/50">sans technicien</span>
        </span>
        <span className={`${KPI_STYLE} text-warning`}>
          <span className={DOT} style={{ background: '#F59E0B' }} />
          {kpis.enCours}
          <span className="text-sm font-semibold text-white/50">en cours</span>
        </span>
        <span className={`${KPI_STYLE} text-violet`}>
          <span className={DOT} style={{ background: '#8B5CF6' }} />
          {kpis.urgentes}
          <span className="text-sm font-semibold text-white/50">urgentes</span>
        </span>
        <span className={`${KPI_STYLE} text-success`}>
          <span className={DOT} style={{ background: '#16A34A' }} />
          {kpis.resolusSemaine}
          <span className="text-sm font-semibold text-white/50">résolus cette sem.</span>
        </span>
      </div>

      <div className="flex items-center gap-4">
        {/* Conmutador de vista: el kanban con arrastrar y soltar sigue existiendo */}
        <nav className="flex items-center gap-1 rounded-xl bg-white/5 p-1">
          <Link
            href="/atelier"
            aria-current={view === 'carte' ? 'page' : undefined}
            className={[
              'flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-semibold transition-colors',
              view === 'carte' ? 'bg-white text-ink' : 'text-white/60 hover:text-white',
            ].join(' ')}
          >
            <Map size={15} />
            Carte
          </Link>
          <Link
            href="/atelier/kanban"
            aria-current={view === 'kanban' ? 'page' : undefined}
            className={[
              'flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-semibold transition-colors',
              view === 'kanban' ? 'bg-white text-ink' : 'text-white/60 hover:text-white',
            ].join(' ')}
          >
            <Columns3 size={15} />
            Kanban
          </Link>
        </nav>

        <p className="font-display text-lg font-semibold text-white/50 tabular-nums whitespace-nowrap">
          {clock}
        </p>
      </div>
    </header>
  )
}
