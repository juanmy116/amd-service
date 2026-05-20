import type { ReactNode } from 'react'
import { Card } from './Card'

type Props = {
  icon: ReactNode
  value: string | number
  label: string
  delta?: { text: string; trend: 'up' | 'down' }
}

export function KpiCard({ icon, value, label, delta }: Props) {
  return (
    <Card className="p-4">
      <div className="flex items-center justify-between">
        <div className="flex h-9 w-9 items-center justify-center rounded-[10px] bg-accent-soft text-accent">
          {icon}
        </div>
        {delta && (
          <span
            className={`rounded-md px-1.5 py-0.5 text-[11px] font-semibold ${
              delta.trend === 'up' ? 'bg-success-soft text-success' : 'bg-accent-soft text-accent'
            }`}
          >
            {delta.text}
          </span>
        )}
      </div>
      <p className="mt-3 font-display text-2xl font-semibold text-ink">{value}</p>
      <p className="mt-1 text-xs text-ink-soft">{label}</p>
    </Card>
  )
}
