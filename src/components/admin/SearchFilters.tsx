'use client'

import { useEffect, useRef, useState, useTransition } from 'react'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { Search, X } from 'lucide-react'

const QUERY_PARAM = 'q'
const DEBOUNCE_MS = 300

export type FilterOption = { value: string; label: string }

export type FilterDef = {
  param: string
  label: string
  options: FilterOption[]
}

type Props = {
  placeholder?: string
  filters?: FilterDef[]
}

export default function SearchFilters({ placeholder = 'Rechercher…', filters = [] }: Props) {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const [, startTransition] = useTransition()

  const [value, setValue] = useState(searchParams.get(QUERY_PARAM) ?? '')
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    setValue(searchParams.get(QUERY_PARAM) ?? '')
  }, [searchParams])

  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current)
    }
  }, [])

  function pushWith(updates: Record<string, string | null>) {
    const next = new URLSearchParams(searchParams.toString())
    for (const [key, val] of Object.entries(updates)) {
      if (val === null || val === '') next.delete(key)
      else next.set(key, val)
    }
    const qs = next.toString()
    startTransition(() => {
      router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false })
    })
  }

  function onQueryChange(next: string) {
    setValue(next)
    if (timerRef.current) clearTimeout(timerRef.current)
    timerRef.current = setTimeout(() => {
      pushWith({ [QUERY_PARAM]: next.trim() || null })
    }, DEBOUNCE_MS)
  }

  function clearAll() {
    setValue('')
    startTransition(() => {
      router.replace(pathname, { scroll: false })
    })
  }

  const hasActiveFilters =
    !!searchParams.get(QUERY_PARAM) ||
    filters.some((f) => searchParams.get(f.param))

  return (
    <div className="flex flex-wrap items-center gap-2 mb-5">
      <div className="relative flex-1 min-w-[220px] max-w-md">
        <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-muted pointer-events-none" />
        <input
          type="search"
          value={value}
          onChange={(e) => onQueryChange(e.target.value)}
          placeholder={placeholder}
          maxLength={80}
          className="w-full pl-9 pr-3 py-2 text-sm text-ink border border-line rounded-lg bg-card focus:outline-none focus:ring-2 focus:ring-accent/20 focus:border-accent"
        />
      </div>

      {filters.map((filter) => {
        const current = searchParams.get(filter.param) ?? ''
        return (
          <select
            key={filter.param}
            value={current}
            onChange={(e) => pushWith({ [filter.param]: e.target.value || null })}
            className="text-sm text-ink border border-line rounded-lg bg-card px-3 py-2 focus:outline-none focus:ring-2 focus:ring-accent/20 focus:border-accent"
          >
            <option value="">{filter.label}</option>
            {filter.options.map((opt) => (
              <option key={opt.value} value={opt.value}>{opt.label}</option>
            ))}
          </select>
        )
      })}

      {hasActiveFilters && (
        <button
          type="button"
          onClick={clearAll}
          className="inline-flex items-center gap-1 text-xs font-medium text-ink-soft hover:text-ink px-2 py-1.5"
        >
          <X size={13} />
          Effacer
        </button>
      )}
    </div>
  )
}
