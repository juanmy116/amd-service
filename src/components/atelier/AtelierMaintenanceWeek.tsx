'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { assignMaintenanceVisitAction } from '@/app/atelier/actions'
import AssignPanel from './AssignPanel'
import type { AtelierMaintenanceVisit, Technician } from './types'

const DAYS = ['Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi']

export default function AtelierMaintenanceWeek({
  visits,
  weekDates,
  technicians,
}: {
  visits: AtelierMaintenanceVisit[]
  weekDates: string[]
  technicians: Technician[]
}) {
  const router = useRouter()
  const [selected, setSelected] = useState<AtelierMaintenanceVisit | null>(null)
  const [busy, setBusy] = useState(false)

  async function handleAssign(technicianId: string | null) {
    if (!selected) return
    setBusy(true)
    const result = await assignMaintenanceVisitAction(selected.id, technicianId)
    setBusy(false)
    if (!result?.error) {
      setSelected(null)
      router.refresh()
    }
  }

  return (
    <>
      <div className="flex gap-3 h-full">
        {weekDates.map((date, i) => {
          const dayVisits = visits.filter((v) => v.scheduledDate === date)
          const dayNum = new Date(date + 'T00:00:00').getDate()
          return (
            <div key={date} className="flex-1 flex flex-col min-w-0">
              <div className="flex items-center justify-between mb-2 px-1">
                <span className="text-sm font-bold text-white uppercase tracking-wide">{DAYS[i]}</span>
                <span className="text-xs font-bold text-white/40">{dayNum}</span>
              </div>
              <div className="flex-1 rounded-xl p-2 space-y-2 overflow-y-auto bg-white/[0.02] border-2 border-white/[0.05]">
                {dayVisits.map((v) => (
                  <button
                    key={v.id}
                    type="button"
                    onClick={() => setSelected(v)}
                    className="w-full text-left bg-white rounded-xl p-3 hover:ring-2 hover:ring-accent/40 transition-all"
                  >
                    <p className="text-sm font-semibold text-ink leading-snug">{v.clientName}</p>
                    <p className="text-xs text-ink-muted mt-0.5">{v.machineLabel}</p>
                    <div className="mt-2 pt-2 border-t border-line-subtle">
                      {v.technicianName
                        ? <span className="text-xs font-medium text-ink-soft">{v.technicianName}</span>
                        : <span className="text-xs font-bold text-accent">À assigner</span>}
                    </div>
                  </button>
                ))}
                {dayVisits.length === 0 && (
                  <div className="flex items-center justify-center h-16 text-xs text-white/20">—</div>
                )}
              </div>
            </div>
          )
        })}
      </div>

      <AssignPanel
        open={selected !== null}
        title={selected ? selected.clientName : ''}
        subtitle="Assigner la visite à"
        technicians={technicians}
        currentTechnicianId={selected?.technicianId ?? null}
        busy={busy}
        onSelect={handleAssign}
        onClose={() => setSelected(null)}
      />
    </>
  )
}
