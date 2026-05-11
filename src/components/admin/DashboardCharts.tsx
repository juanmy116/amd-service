'use client'

import {
  LineChart, Line, BarChart, Bar,
  XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, ReferenceLine,
} from 'recharts'

export type CsatPoint    = { month: string; avg: number | null; count: number }
export type IncidentPoint = { month: string; total: number }

const TICK = { fontSize: 11, fill: '#9CA3AF' }
const TIP_STYLE = {
  fontSize: 12,
  borderRadius: 8,
  border: '1px solid #E5E7EB',
  boxShadow: '0 2px 8px rgba(0,0,0,0.06)',
}

export function CsatTrendChart({ data }: { data: CsatPoint[] }) {
  const hasData = data.some(d => d.avg !== null && d.avg > 0)

  if (!hasData) {
    return (
      <div className="flex items-center justify-center h-[200px] text-sm text-gray-400">
        Pas encore de données CSAT disponibles
      </div>
    )
  }

  return (
    <ResponsiveContainer width="100%" height={200}>
      <LineChart data={data} margin={{ top: 4, right: 8, left: -24, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#F3F4F6" />
        <XAxis dataKey="month" tick={TICK} />
        <YAxis domain={[0, 5]} ticks={[1, 2, 3, 4, 5]} tick={TICK} />
        <Tooltip
          contentStyle={TIP_STYLE}
          formatter={(v: unknown) => typeof v === 'number' ? `${v.toFixed(1)} / 5` : String(v)}
        />
        <ReferenceLine y={4} stroke="#10B981" strokeDasharray="4 4" strokeOpacity={0.4} />
        <Line
          type="monotone"
          dataKey="avg"
          stroke="#BF0D0D"
          strokeWidth={2.5}
          dot={{ fill: '#BF0D0D', r: 4, strokeWidth: 0 }}
          activeDot={{ r: 5 }}
          connectNulls={false}
        />
      </LineChart>
    </ResponsiveContainer>
  )
}

export function IncidentsTrendChart({ data }: { data: IncidentPoint[] }) {
  const hasData = data.some(d => d.total > 0)

  if (!hasData) {
    return (
      <div className="flex items-center justify-center h-[200px] text-sm text-gray-400">
        Pas encore de données disponibles
      </div>
    )
  }

  return (
    <ResponsiveContainer width="100%" height={200}>
      <BarChart data={data} margin={{ top: 4, right: 8, left: -24, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#F3F4F6" />
        <XAxis dataKey="month" tick={TICK} />
        <YAxis tick={TICK} allowDecimals={false} />
        <Tooltip
          contentStyle={TIP_STYLE}
          formatter={(v: unknown) => typeof v === 'number' ? v.toLocaleString('fr-FR') : String(v)}
        />
        <Bar dataKey="total" name="Incidents" fill="#BF0D0D" radius={[4, 4, 0, 0]} opacity={0.85} />
      </BarChart>
    </ResponsiveContainer>
  )
}
