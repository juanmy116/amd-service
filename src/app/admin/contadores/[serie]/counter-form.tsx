'use client'

import { useActionState, useState } from 'react'
import { saveCounterAction, CounterFormState } from './actions'
import { ChevronDown } from 'lucide-react'
import { MONTHS_FR_LONG } from '../constants'

const now = new Date()
const CURRENT_YEAR  = now.getFullYear()
const CURRENT_MONTH = now.getMonth() + 1
const YEARS = Array.from({ length: 6 }, (_, i) => CURRENT_YEAR - i)

interface Props { machineId: string }

export default function CounterForm({ machineId }: Props) {
  const [state, action, pending] = useActionState<CounterFormState, FormData>(saveCounterAction, null)
  const [isReplacement, setIsReplacement] = useState(false)

  return (
    <form action={action} className="space-y-4">
      <input type="hidden" name="machine_id" value={machineId} />

      {/* Période */}
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-xs font-medium text-gray-700 mb-1.5">Mois</label>
          <div className="relative">
            <select
              name="month"
              defaultValue={CURRENT_MONTH}
              className="w-full appearance-none text-sm border border-gray-200 rounded-lg px-3 py-2.5 pr-8 bg-white focus:outline-none focus:ring-2"
              style={{ '--tw-ring-color': '#BF0D0D' } as React.CSSProperties}
            >
              {MONTHS_FR_LONG.slice(1).map((m, i) => (
                <option key={i + 1} value={i + 1}>{m}</option>
              ))}
            </select>
            <ChevronDown size={14} className="absolute right-2.5 top-3 text-gray-400 pointer-events-none" />
          </div>
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-700 mb-1.5">Année</label>
          <div className="relative">
            <select
              name="year"
              defaultValue={CURRENT_YEAR}
              className="w-full appearance-none text-sm border border-gray-200 rounded-lg px-3 py-2.5 pr-8 bg-white focus:outline-none focus:ring-2"
              style={{ '--tw-ring-color': '#BF0D0D' } as React.CSSProperties}
            >
              {YEARS.map(y => <option key={y} value={y}>{y}</option>)}
            </select>
            <ChevronDown size={14} className="absolute right-2.5 top-3 text-gray-400 pointer-events-none" />
          </div>
        </div>
      </div>

      {/* Jour du relevé */}
      <div>
        <label className="block text-xs font-medium text-gray-700 mb-1.5">Jour du relevé</label>
        <div className="relative">
          <select
            name="day"
            defaultValue=""
            className="w-full appearance-none text-sm border border-gray-200 rounded-lg px-3 py-2.5 pr-8 bg-white focus:outline-none focus:ring-2"
            style={{ '--tw-ring-color': '#BF0D0D' } as React.CSSProperties}
          >
            <option value="">— Non précisé</option>
            {Array.from({ length: 31 }, (_, i) => i + 1).map(d => (
              <option key={d} value={d}>{d}</option>
            ))}
          </select>
          <ChevronDown size={14} className="absolute right-2.5 top-3 text-gray-400 pointer-events-none" />
        </div>
      </div>

      {/* Compteurs */}
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-xs font-medium text-gray-700 mb-1.5">
            Compteur N&amp;B <span className="text-red-500">*</span>
          </label>
          <input
            type="number"
            name="counter_bw"
            min={0}
            required
            placeholder="ex: 45231"
            className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2.5 focus:outline-none focus:ring-2"
            style={{ '--tw-ring-color': '#BF0D0D' } as React.CSSProperties}
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-700 mb-1.5">
            Compteur Couleur <span className="text-red-500">*</span>
          </label>
          <input
            type="number"
            name="counter_color"
            min={0}
            required
            placeholder="ex: 8540"
            className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2.5 focus:outline-none focus:ring-2"
            style={{ '--tw-ring-color': '#BF0D0D' } as React.CSSProperties}
          />
        </div>
      </div>

      {/* Notes */}
      <div>
        <label className="block text-xs font-medium text-gray-700 mb-1.5">Notes</label>
        <input
          type="text"
          name="notes"
          placeholder="Observations (optionnel)"
          className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2.5 focus:outline-none focus:ring-2"
          style={{ '--tw-ring-color': '#BF0D0D' } as React.CSSProperties}
        />
      </div>

      {/* Remplacement */}
      <div className="space-y-2">
        <label className="flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            name="is_replacement_start"
            checked={isReplacement}
            onChange={e => setIsReplacement(e.target.checked)}
            className="w-4 h-4 rounded"
            style={{ accentColor: '#BF0D0D' }}
          />
          <span className="text-xs font-medium text-gray-700">
            Ce relevé correspond à un remplacement de machine
          </span>
        </label>

        {isReplacement && (
          <div>
            <label className="block text-xs text-gray-500 mb-1.5">
              N° série de la machine remplacée
            </label>
            <input
              type="text"
              name="previous_machine_id"
              placeholder="ex: SN-2021-00847"
              className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2.5 focus:outline-none focus:ring-2"
              style={{ '--tw-ring-color': '#BF0D0D' } as React.CSSProperties}
            />
          </div>
        )}
      </div>

      {/* Estado */}
      {state?.error && (
        <p className="text-xs text-red-600 bg-red-50 rounded-lg px-3 py-2">{state.error}</p>
      )}
      {state?.success && (
        <p className="text-xs text-green-700 bg-green-50 rounded-lg px-3 py-2">Relevé enregistré avec succès.</p>
      )}

      <button
        type="submit"
        disabled={pending}
        className="w-full py-2.5 text-sm font-semibold text-white rounded-lg disabled:opacity-50 transition-opacity hover:opacity-90"
        style={{ backgroundColor: '#BF0D0D' }}
      >
        {pending ? 'Enregistrement...' : 'Enregistrer le relevé'}
      </button>
    </form>
  )
}
