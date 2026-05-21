'use client'

import { useTransition } from 'react'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { LayoutGrid, List } from 'lucide-react'

const PARAM = 'view'

type View = 'kanban' | 'list'

export default function ViewToggle({ defaultView = 'kanban' }: { defaultView?: View }) {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const [, startTransition] = useTransition()

  const raw = searchParams.get(PARAM)
  const current: View = raw === 'list' || raw === 'kanban' ? raw : defaultView

  function setView(view: View) {
    if (view === current) return
    const next = new URLSearchParams(searchParams.toString())
    if (view === defaultView) next.delete(PARAM)
    else next.set(PARAM, view)
    const qs = next.toString()
    startTransition(() => {
      router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false })
    })
  }

  const base = 'flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium transition-colors'
  const active = 'bg-card text-ink shadow-card'
  const idle = 'text-ink-soft hover:text-ink'

  return (
    <div className="inline-flex items-center rounded-lg border border-line bg-neutral-soft p-0.5">
      <button
        type="button"
        onClick={() => setView('kanban')}
        className={`${base} rounded-md ${current === 'kanban' ? active : idle}`}
      >
        <LayoutGrid size={13} />
        Kanban
      </button>
      <button
        type="button"
        onClick={() => setView('list')}
        className={`${base} rounded-md ${current === 'list' ? active : idle}`}
      >
        <List size={13} />
        Liste
      </button>
    </div>
  )
}
