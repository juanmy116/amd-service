import type { AtelierKpis as Kpis } from './types'

const TONE = {
  accent:  { grad: 'from-accent/25',  label: 'text-accent'  },
  warning: { grad: 'from-warning/25', label: 'text-warning' },
  violet:  { grad: 'from-violet/25',  label: 'text-violet'  },
  success: { grad: 'from-success/25', label: 'text-success' },
}

const CARDS = [
  { key: 'sansAssigner',   label: 'Sans assigner',      sub: 'à dispatcher',          tone: 'accent'  },
  { key: 'enCours',        label: 'En cours',           sub: 'interventions actives', tone: 'warning' },
  { key: 'urgentes',       label: 'Urgentes',           sub: 'priorité haute',        tone: 'violet'  },
  { key: 'resolusSemaine', label: 'Résolus cette sem.', sub: 'cette semaine',         tone: 'success' },
] as const

export default function AtelierKpis({ kpis }: { kpis: Kpis }) {
  return (
    <div className="grid grid-cols-4 gap-4">
      {CARDS.map((c) => {
        const tone = TONE[c.tone]
        return (
          <div
            key={c.key}
            className={`rounded-2xl border border-white/10 bg-gradient-to-br ${tone.grad} to-transparent p-5`}
          >
            <p className={`text-xs font-bold uppercase tracking-wider ${tone.label}`}>{c.label}</p>
            <p className="font-display text-5xl font-extrabold text-white mt-2 leading-none">
              {kpis[c.key]}
            </p>
            <p className="text-xs text-white/40 mt-2">{c.sub}</p>
          </div>
        )
      })}
    </div>
  )
}
