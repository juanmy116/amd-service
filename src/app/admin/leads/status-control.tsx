'use client'

import { useState, useTransition } from 'react'
import { updateLeadStatusAction } from './actions'

const STATUSES = [
  { value: 'nouveau', label: 'Nouveau' },
  { value: 'traité',  label: 'Traité'  },
  { value: 'archivé', label: 'Archivé' },
]

export default function StatusControl({ id, current }: { id: string; current: string }) {
  const [status, setStatus] = useState(current)
  const [pending, startTransition] = useTransition()

  function onChange(e: React.ChangeEvent<HTMLSelectElement>) {
    const next = e.target.value
    const prev = status
    setStatus(next)
    startTransition(async () => {
      const res = await updateLeadStatusAction(id, next)
      if (res.error) setStatus(prev) // revertir en error
    })
  }

  return (
    <select
      value={status}
      onChange={onChange}
      disabled={pending}
      className="px-3 py-1.5 rounded-lg border border-line text-ink text-xs bg-card focus:outline-none focus:ring-2 focus:ring-accent/30 disabled:opacity-60"
    >
      {STATUSES.map((s) => (
        <option key={s.value} value={s.value}>{s.label}</option>
      ))}
    </select>
  )
}
