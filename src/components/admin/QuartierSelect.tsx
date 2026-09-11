'use client'

import { groupByVille, selectableQuartiers, type Quartier } from '@/lib/quartiers'

type Props = {
  quartiers: Quartier[]
  defaultValue?: string | null
  /** Nombre del campo en el FormData. */
  name?: string
  label: string
  hint?: string
}

const selectClass =
  'w-full px-3.5 py-2.5 rounded-lg border border-line text-ink text-sm bg-card focus:outline-none focus:ring-2 focus:ring-accent/30 focus:border-accent'

export default function QuartierSelect({
  quartiers,
  defaultValue,
  name = 'quartier_code',
  label,
  hint,
}: Props) {
  // Solo las zonas activas, más la que el registro ya tiene aunque esté desactivada:
  // si no apareciera, guardar el formulario la borraría sin avisar.
  const groups = groupByVille(selectableQuartiers(quartiers, defaultValue))

  return (
    <div>
      <label className="block text-sm font-medium text-ink-soft mb-1.5">{label}</label>
      <select name={name} defaultValue={defaultValue ?? ''} className={selectClass}>
        <option value="">— Non défini —</option>
        {groups.map((group) => (
          <optgroup key={group.ville} label={group.ville}>
            {group.quartiers.map((q) => (
              <option key={q.code} value={q.code}>
                {q.active ? q.label : `${q.label} (désactivé)`}
              </option>
            ))}
          </optgroup>
        ))}
      </select>
      {hint && <p className="text-xs text-ink-muted mt-1.5">{hint}</p>}
    </div>
  )
}
