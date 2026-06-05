'use client'

import { useState, useMemo } from 'react'
import {
  Combobox,
  ComboboxInput,
  ComboboxButton,
  ComboboxOptions,
  ComboboxOption,
} from '@headlessui/react'
import { ChevronDown, Check } from 'lucide-react'

type MachineOption = { numero_serie: string; marque: string; modele: string }

type Props = {
  options: MachineOption[]
  value: string
  onChange: (machineId: string) => void
  invalid?: boolean
}

export default function MachineCombobox({ options, value, onChange, invalid }: Props) {
  const [query, setQuery] = useState('')

  const selected = options.find((m) => m.numero_serie === value) ?? null

  const filtered = useMemo(() => {
    if (!query.trim()) return options
    const q = query.toLowerCase()
    return options.filter(
      (m) =>
        m.marque.toLowerCase().includes(q) ||
        m.modele.toLowerCase().includes(q) ||
        m.numero_serie.toLowerCase().includes(q)
    )
  }, [options, query])

  const borderClass = invalid
    ? 'border-accent ring-2 ring-accent/30'
    : 'border-line focus:ring-2 focus:ring-accent/30 focus:border-accent'

  return (
    <Combobox
      value={selected}
      onChange={(m: MachineOption | null) => {
        onChange(m?.numero_serie ?? '')
        setQuery('')
      }}
      onClose={() => setQuery('')}
    >
      <div className="relative">
        <ComboboxInput
          className={`w-full px-3 py-2 pr-8 rounded-lg border text-ink text-sm placeholder-ink-muted bg-card focus:outline-none ${borderClass}`}
          displayValue={(m: MachineOption | null) =>
            m ? `${m.marque} ${m.modele} — ${m.numero_serie}` : ''
          }
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Rechercher par marque, modèle ou série…"
        />
        <ComboboxButton className="absolute inset-y-0 right-0 flex items-center pr-2.5 text-ink-muted">
          <ChevronDown size={14} />
        </ComboboxButton>

        <ComboboxOptions className="absolute z-50 mt-1 w-full max-h-64 overflow-auto rounded-lg border border-line bg-card shadow-raised text-sm focus:outline-none">
          {filtered.length === 0 ? (
            <div className="px-4 py-3 text-ink-muted">Aucun résultat</div>
          ) : (
            filtered.map((m) => (
              <ComboboxOption
                key={m.numero_serie}
                value={m}
                className="group flex items-center gap-2.5 px-3 py-2.5 cursor-pointer select-none data-[focus]:bg-neutral-soft"
              >
                <Check
                  size={13}
                  className="shrink-0 text-accent opacity-0 group-data-[selected]:opacity-100"
                />
                <span className="flex-1 text-ink">
                  <span className="font-medium">{m.marque} {m.modele}</span>
                </span>
                <span className="font-mono text-xs text-ink-muted">{m.numero_serie}</span>
              </ComboboxOption>
            ))
          )}
        </ComboboxOptions>
      </div>
    </Combobox>
  )
}
