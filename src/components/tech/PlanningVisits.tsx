'use client'

import Link from 'next/link'
import { Wrench, AlertTriangle, MapPin } from 'lucide-react'
import { sortByDistance, distanceMeters, formatTaskDistance, type TaskCoords } from '@/lib/geo'
import { NearestToggle, useNearestSort } from './NearestToggle'

export type VisitRow = {
  id: string
  scheduled_date: string
  status: string
  serie: string | null
  marque: string | null
  modele: string | null
  client: string
  lieu: string | null
}

type VisitGroup = { key: string; client: string; lieu: string | null; rows: VisitRow[] }

function groupByContract(rows: VisitRow[]): VisitGroup[] {
  const map = new Map<string, VisitGroup>()
  for (const r of rows) {
    const key = `${r.client}|${r.lieu ?? ''}`
    if (!map.has(key)) map.set(key, { key, client: r.client, lieu: r.lieu, rows: [] })
    map.get(key)!.rows.push(r)
  }
  return [...map.values()]
}

function fmtDate(dateStr: string): { label: string; isOverdue: boolean } {
  const d = new Date(dateStr + 'T00:00:00')
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const diff = Math.round((d.getTime() - today.getTime()) / 86400000)
  if (diff < 0)  return { label: `${Math.abs(diff)} jour${Math.abs(diff) > 1 ? 's' : ''} de retard`, isOverdue: true }
  if (diff === 0) return { label: "Aujourd'hui", isOverdue: false }
  if (diff === 1) return { label: 'Demain', isOverdue: false }
  return {
    label: d.toLocaleDateString('fr-FR', { weekday: 'short', day: 'numeric', month: 'short' }),
    isOverdue: false,
  }
}

/** Coordonnées de la visite (celles de sa machine, ou le centre du quartier), lues dans la map envoyée par le serveur. */
function coordsOf(row: VisitRow, coords: Record<string, TaskCoords | null>): TaskCoords | null {
  return row.serie ? coords[row.serie] ?? null : null
}

export default function PlanningVisits({
  overdueRows,
  plannedRows,
  coords,
}: {
  overdueRows: VisitRow[]
  plannedRows: VisitRow[]
  coords: Record<string, TaskCoords | null>
}) {
  const { origin, locating, noPosition, toggle } = useNearestSort()

  const overdueGroups = groupByContract(overdueRows)
  const plannedGroups = groupByContract(plannedRows)
  const overdueCount  = overdueRows.length
  const plannedCount  = plannedRows.length

  const flatRows = origin
    ? sortByDistance([...overdueRows, ...plannedRows], origin, r => coordsOf(r, coords)?.coords ?? null)
    : null

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs text-ink-muted">
          {overdueCount + plannedCount > 0
            ? `${overdueCount + plannedCount} visite${overdueCount + plannedCount > 1 ? 's' : ''}`
            : 'Aucune visite'}
        </p>
        <NearestToggle active={origin !== null} locating={locating} onToggle={toggle} />
      </div>

      {noPosition && (
        <p className="text-xs text-ink-muted -mt-4">Position indisponible.</p>
      )}

      {flatRows ? (
        <section className="space-y-2">
          {flatRows.length === 0 ? (
            <div className="bg-card rounded-[var(--radius-card)] border border-line p-6 text-center">
              <p className="text-sm text-ink-muted">Aucune visite</p>
            </div>
          ) : (
            flatRows.map(r => {
              const c = coordsOf(r, coords)
              const distance = origin && c ? formatTaskDistance(distanceMeters(origin, c.coords), c.approx) : null
              const { label, isOverdue: dateOverdue } = fmtDate(r.scheduled_date)
              const overdue = r.status === 'en_retard'
              return (
                <Link
                  key={r.id}
                  href={r.serie ? `/tech/scan/${encodeURIComponent(r.serie)}` : '/tech'}
                  className="flex items-center justify-between gap-3 bg-card rounded-[var(--radius-card)] border border-line p-4"
                >
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold text-ink truncate">{r.client}</p>
                    <p className="text-xs text-ink-soft truncate flex items-center gap-1.5 mt-0.5">
                      <Wrench size={12} className={overdue ? 'text-accent shrink-0' : 'text-ink-muted shrink-0'} />
                      {r.marque} {r.modele}
                    </p>
                    {distance && (
                      <p className="flex items-center gap-1 text-[10px] text-ink-muted mt-1">
                        <MapPin size={10} />
                        {distance}
                      </p>
                    )}
                  </div>
                  <span className={`shrink-0 text-xs font-semibold whitespace-nowrap ${
                    overdue || dateOverdue ? 'text-accent' : 'text-info'
                  }`}>
                    {label}
                  </span>
                </Link>
              )
            })
          )}
        </section>
      ) : (
        <>
          {/* ── MAINTENANCES EN RETARD ── */}
          {overdueCount > 0 && (
            <section className="space-y-2">
              <div className="flex items-center gap-2">
                <AlertTriangle size={14} className="text-accent" />
                <p className="text-sm font-semibold text-accent">En retard ({overdueCount})</p>
              </div>
              {overdueGroups.map(group => (
                <div key={group.key} className="bg-card rounded-[var(--radius-card)] border-2 border-accent/30 p-4 space-y-2">
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-ink truncate">{group.client}</p>
                    {group.lieu && <p className="text-xs text-ink-muted truncate">{group.lieu}</p>}
                  </div>
                  <div className="space-y-1.5">
                    {group.rows.map(r => {
                      const { label } = fmtDate(r.scheduled_date)
                      return (
                        <Link
                          key={r.id}
                          href={r.serie ? `/tech/scan/${encodeURIComponent(r.serie)}` : '/tech'}
                          className="flex items-center justify-between gap-3 rounded-lg bg-accent-soft/50 px-3 py-2"
                        >
                          <span className="text-xs text-ink-soft truncate flex items-center gap-1.5">
                            <Wrench size={12} className="text-accent shrink-0" />
                            {r.marque} {r.modele}
                          </span>
                          <span className="shrink-0 text-xs font-semibold text-accent whitespace-nowrap">{label}</span>
                        </Link>
                      )
                    })}
                  </div>
                </div>
              ))}
            </section>
          )}

          {/* ── MAINTENANCES PLANIFIÉES ── */}
          <section className="space-y-2">
            <div className="flex items-center gap-2">
              <Wrench size={14} className="text-ink-muted" />
              <p className="text-sm font-semibold text-ink-soft">
                Maintenance — 14 prochains jours
                {plannedCount > 0 && (
                  <span className="ml-2 text-xs font-normal text-ink-muted">({plannedCount})</span>
                )}
              </p>
            </div>

            {plannedCount === 0 ? (
              <div className="bg-card rounded-[var(--radius-card)] border border-line p-6 text-center">
                <p className="text-sm text-ink-muted">Aucune visite planifiée dans 14 jours</p>
              </div>
            ) : (
              plannedGroups.map(group => (
                <div key={group.key} className="bg-card rounded-[var(--radius-card)] border border-line p-4 space-y-2">
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-ink truncate">{group.client}</p>
                    {group.lieu && <p className="text-xs text-ink-muted truncate">{group.lieu}</p>}
                  </div>
                  <div className="space-y-1.5">
                    {group.rows.map(r => {
                      const { label, isOverdue } = fmtDate(r.scheduled_date)
                      return (
                        <Link
                          key={r.id}
                          href={r.serie ? `/tech/scan/${encodeURIComponent(r.serie)}` : '/tech'}
                          className="flex items-center justify-between gap-3 rounded-lg bg-info-soft/40 px-3 py-2"
                        >
                          <span className="text-xs text-ink-soft truncate flex items-center gap-1.5">
                            <Wrench size={12} className="text-info shrink-0" />
                            {r.marque} {r.modele}
                          </span>
                          <span className={`shrink-0 text-xs font-semibold whitespace-nowrap ${isOverdue ? 'text-accent' : 'text-info'}`}>
                            {label}
                          </span>
                        </Link>
                      )
                    })}
                  </div>
                </div>
              ))
            )}
          </section>
        </>
      )}
    </div>
  )
}
