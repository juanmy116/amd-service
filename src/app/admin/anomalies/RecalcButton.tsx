'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { RefreshCw, Loader2 } from 'lucide-react'
import { recalcAnomaliesAction } from './actions'

export default function RecalcButton() {
  const [pending, startTransition] = useTransition()
  const [msg, setMsg] = useState<string | null>(null)
  const router = useRouter()

  function recalc() {
    setMsg(null)
    startTransition(async () => {
      try {
        const res = await recalcAnomaliesAction()
        if (res && 'ok' in res) {
          setMsg(`${res.count ?? 0} anomalie(s) détectée(s)`)
          router.refresh()
        } else {
          setMsg(res?.error ?? 'Erreur')
        }
      } catch {
        setMsg('Erreur réseau. Réessayez.')
      }
    })
  }

  return (
    <div className="flex items-center gap-3">
      {msg && <span className="text-xs text-ink-muted">{msg}</span>}
      <button
        onClick={recalc}
        disabled={pending}
        className="flex items-center gap-2 px-3.5 py-2.5 rounded-lg text-sm font-medium text-white bg-accent disabled:opacity-60 transition-opacity"
      >
        {pending ? <Loader2 size={15} className="animate-spin" /> : <RefreshCw size={15} />}
        Recalculer
      </button>
    </div>
  )
}
