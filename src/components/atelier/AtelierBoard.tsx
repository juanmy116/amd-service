'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import PanneList from './PanneList'
import MaintenanceList from './MaintenanceList'
import AtelierMap from './AtelierMap'
import IncidentDetail from './IncidentDetail'
import MaintenanceDetail from './MaintenanceDetail'
import { filterByQuartier, type BoardIncident, type BoardMaintenance } from '@/lib/atelier/board'
import { assignIncidentAction, assignMaintenanceVisitAction, setIncidentStatusAction } from '@/app/atelier/actions'
import type { Quartier } from '@/lib/quartiers'
import type { Technician } from '@/app/atelier/data'

type Props = {
  incidents: BoardIncident[]
  maintenances: BoardMaintenance[]
  quartiers: Quartier[]
  technicians: Technician[]
  /** Hoy en ISO, del servidor: el reloj de la Raspberry puede ir descuadrado. */
  today: string
  /** Instante del servidor. Se usa como valor inicial del reloj para que el primer pintado
   *  del navegador diga lo mismo que el HTML que llegó (si no, React avisa de desajuste). */
  serverNow: string
}

/** Cada cuánto se recarga el tablero cuando nadie lo está usando. */
const REFRESH_MS = 30_000
/** Si nadie toca nada este rato, la TV vuelve sola a la vista general. */
const IDLE_RESET_MS = 120_000

type Selection =
  | { kind: 'incident'; id: string }
  | { kind: 'maintenance'; id: string }
  | null

export default function AtelierBoard({
  incidents, maintenances, quartiers, technicians, today, serverNow,
}: Props) {
  const router = useRouter()
  const [quartierFilter, setQuartierFilter] = useState<string | null>(null)
  const [statusFilter, setStatusFilter] = useState<string | null>(null)
  const [selection, setSelection] = useState<Selection>(null)
  const [busy, setBusy] = useState(false)
  const [now, setNow] = useState(() => new Date(serverNow))

  const lastInteraction = useRef(Date.now())
  const touch = useCallback(() => { lastInteraction.current = Date.now() }, [])

  const isIdle = selection === null && quartierFilter === null && statusFilter === null

  // El reloj de las tarjetas («il y a 40 min») se refresca cada minuto sin tocar el servidor.
  useEffect(() => {
    setNow(new Date())
    const t = setInterval(() => setNow(new Date()), 60_000)
    return () => clearInterval(t)
  }, [])

  // Auto-refresco, pausado mientras alguien está trabajando: recargar con una ficha abierta
  // se la cerraría en las manos al despachador.
  useEffect(() => {
    if (!isIdle) return
    const t = setInterval(() => router.refresh(), REFRESH_MS)
    return () => clearInterval(t)
  }, [router, isIdle])

  // Vuelta sola a la vista general: si alguien filtró y se fue, la TV no se queda así toda la tarde.
  useEffect(() => {
    if (isIdle) return
    const t = setInterval(() => {
      if (Date.now() - lastInteraction.current < IDLE_RESET_MS) return
      setSelection(null)
      setQuartierFilter(null)
      setStatusFilter(null)
      router.refresh()
    }, 10_000)
    return () => clearInterval(t)
  }, [router, isIdle])

  const visibleIncidents = filterByQuartier(incidents, quartierFilter)
  const visibleMaintenances = filterByQuartier(maintenances, quartierFilter)

  const openIncident = incidents.find((i) => selection?.kind === 'incident' && i.id === selection.id) ?? null
  const openMaintenance = maintenances.find((m) => selection?.kind === 'maintenance' && m.id === selection.id) ?? null

  async function run(action: () => Promise<{ error?: string }>) {
    touch()
    setBusy(true)
    const result = await action()
    setBusy(false)
    if (!result?.error) router.refresh()
  }

  return (
    <div className="grid min-h-0 flex-1 grid-cols-4 gap-4" onPointerDown={touch}>
      <PanneList
        incidents={visibleIncidents}
        statusFilter={statusFilter}
        onStatusFilter={(s) => { touch(); setStatusFilter(s) }}
        selectedId={openIncident?.id ?? null}
        now={now}
        onOpen={(incident) => { touch(); setSelection({ kind: 'incident', id: incident.id }) }}
      />

      <div className="col-span-2 flex min-h-0 flex-col">
        {openIncident ? (
          <IncidentDetail
            incident={openIncident}
            technicians={technicians}
            busy={busy}
            now={now}
            onAssign={(technicianId) => run(() => assignIncidentAction(openIncident.id, technicianId))}
            onChangeStatus={(status) => run(() => setIncidentStatusAction(openIncident.id, status))}
            onClose={() => { touch(); setSelection(null) }}
          />
        ) : openMaintenance ? (
          <MaintenanceDetail
            visit={openMaintenance}
            technicians={technicians}
            busy={busy}
            onAssign={(technicianId) => run(() => assignMaintenanceVisitAction(openMaintenance.id, technicianId))}
            onClose={() => { touch(); setSelection(null) }}
          />
        ) : (
          <AtelierMap
            incidents={incidents}
            maintenances={maintenances}
            quartiers={quartiers}
            selectedQuartier={quartierFilter}
            onSelectQuartier={(code) => { touch(); setQuartierFilter(code) }}
          />
        )}
      </div>

      <MaintenanceList
        maintenances={visibleMaintenances}
        today={today}
        selectedId={openMaintenance?.id ?? null}
        onOpen={(visit) => { touch(); setSelection({ kind: 'maintenance', id: visit.id }) }}
      />
    </div>
  )
}
