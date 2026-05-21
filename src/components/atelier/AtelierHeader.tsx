'use client'

import { useEffect, useState } from 'react'

export default function AtelierHeader() {
  const [now, setNow] = useState<Date | null>(null)

  useEffect(() => {
    setNow(new Date())
    const t = setInterval(() => setNow(new Date()), 1000)
    return () => clearInterval(t)
  }, [])

  const label = now
    ? now.toLocaleDateString('fr-FR', { weekday: 'short', day: 'numeric', month: 'long' }) +
      ' · ' +
      now.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })
    : ''

  return (
    <header className="flex items-center justify-between">
      <p className="font-display text-2xl font-extrabold text-white">
        AMD <span className="text-accent">·</span> Atelier
      </p>
      <p className="font-display text-xl font-semibold text-white/50 tabular-nums">{label}</p>
    </header>
  )
}
