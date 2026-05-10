'use client'

import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip, Legend, ResponsiveContainer,
} from 'recharts'

const MONTHS_FR = ['', 'Jan', 'Fév', 'Mar', 'Avr', 'Mai', 'Juin',
                   'Juil', 'Août', 'Sep', 'Oct', 'Nov', 'Déc']

export interface ChartEntry {
  label: string
  bw:    number | null
  color: number | null
}

export default function CounterChart({ data }: { data: ChartEntry[] }) {
  if (!data.length) {
    return (
      <div className="flex items-center justify-center h-48 text-sm text-gray-400">
        Pas encore de données pour afficher le graphique
      </div>
    )
  }

  return (
    <ResponsiveContainer width="100%" height={260}>
      <BarChart data={data} margin={{ top: 4, right: 8, left: 0, bottom: 4 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#F3F4F6" />
        <XAxis dataKey="label" tick={{ fontSize: 11, fill: '#9CA3AF' }} />
        <YAxis tick={{ fontSize: 11, fill: '#9CA3AF' }} width={48} />
        <Tooltip
          contentStyle={{ fontSize: 12, borderRadius: 8, border: '1px solid #E5E7EB' }}
          formatter={(v: unknown) => typeof v === 'number' ? v.toLocaleString('fr-FR') : String(v)}
        />
        <Legend iconSize={10} wrapperStyle={{ fontSize: 12 }} />
        <Bar dataKey="bw"    name="N&B"     fill="#6B7280" radius={[3, 3, 0, 0]} />
        <Bar dataKey="color" name="Couleur" fill="#BF0D0D" radius={[3, 3, 0, 0]} />
      </BarChart>
    </ResponsiveContainer>
  )
}

export { MONTHS_FR }
