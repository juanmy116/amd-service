'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import PanneList from './PanneList'
import MaintenanceList from './MaintenanceList'
import AtelierMap, { type QuartierSelection } from './AtelierMap'
import IncidentDetail from './IncidentDetail'
import MaintenanceDetail from './MaintenanceDetail'
import PanneAlert from './PanneAlert'
import UnattendedBanner from './UnattendedBanner'
import ResolutionDialog from '@/components/admin/ResolutionDialog'
import { filterByQuartier, findNewIncidents, unattendedIncidents, waitingLabel, type BoardIncident, type BoardMaintenance } from '@/lib/atelier/board'
import { assignIncidentAction, assignMaintenanceVisitAction, setIncidentStatusAction } from '@/app/atelier/actions'
import type { MapViewId } from '@/lib/atelier/mapView'
import type { Quartier } from '@/lib/quartiers'
import type { Technician } from './types'
import type { OfficeResolution } from '@/lib/resolution'

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
  const [quartierFilter, setQuartierFilter] = useState<QuartierSelection | null>(null)
  // Qué foto del mapa se mira. Vive aquí, y no dentro del mapa, porque la vuelta al reposo
  // tiene que devolver la TV a la vista de siempre igual que quita los filtros.
  const [mapView, setMapView] = useState<MapViewId>('dakar')
  const [statusFilter, setStatusFilter] = useState<string | null>(null)
  const [selection, setSelection] = useState<Selection>(null)
  const [busy, setBusy] = useState(false)
  // Avería a la que se le ha pulsado «Résolu» y espera el motivo. Vive aquí, y no en la ficha,
  // porque mientras la ventana está abierta el tablero no puede recargarse ni volver al reposo.
  const [resolving, setResolving] = useState<BoardIncident | null>(null)
  const [resolutionError, setResolutionError] = useState<string | null>(null)
  const [now, setNow] = useState(() => new Date(serverNow))

  // Identificadores vistos en el refresco anterior: con ellos se sabe qué ha entrado nuevo.
  // `null` en la primera carga, para que el kiosko no suene al encenderse.
  const knownIds = useRef<Set<string> | null>(null)
  const [alert, setAlert] = useState<{ count: number; numero: string | null; at: number }>(
    { count: 0, numero: null, at: 0 }
  )

  const lastInteraction = useRef(Date.now())
  const touch = useCallback(() => { lastInteraction.current = Date.now() }, [])

  // Alguien está usando el tablero: hay una ficha abierta, una ventana de resolución a medio
  // rellenar, o las listas están filtradas.
  const isBusy = selection !== null || resolving !== null || quartierFilter !== null || statusFilter !== null

  // Lo que hay que devolver a su sitio cuando el taller se queda solo. Incluye la vista del mapa,
  // que NO entra en `isBusy` a propósito: mirar la región no es trabajar sobre una avería, y si
  // pausara el refresco la TV se quedaría muda ante una panne nueva mientras nadie toca nada.
  //
  // Con la ventana de resolución abierta no se reinicia NADA: rellenarla lleva más de los dos
  // minutos de reposo, y como escribir no cuenta como interacción (solo los clics llaman a
  // `touch()`), la TV borraba el texto a medio escribir sin avisar. La segunda vez que eso pasa,
  // nadie vuelve a cerrar una avería desde el kiosko.
  const needsReset = resolving === null && (isBusy || mapView !== 'dakar')

  // Averías nuevas desde el último refresco → campana + cartel (ver NewIncidentAlert).
  useEffect(() => {
    const nuevas = findNewIncidents(incidents, knownIds.current)
    knownIds.current = new Set(incidents.map((i) => i.id))
    if (nuevas.length === 0) return
    // `at` fuerza un cambio de estado aunque entren dos veces seguidas el mismo número de avisos.
    setAlert({ count: nuevas.length, numero: nuevas[nuevas.length - 1]!.numeroIncident, at: Date.now() })
  }, [incidents])

  // El reloj de las tarjetas («il y a 40 min») se refresca cada minuto sin tocar el servidor.
  useEffect(() => {
    setNow(new Date())
    const t = setInterval(() => setNow(new Date()), 60_000)
    return () => clearInterval(t)
  }, [])

  // Auto-refresco, pausado mientras alguien está trabajando: recargar con una ficha abierta
  // se la cerraría en las manos al despachador.
  useEffect(() => {
    if (isBusy) return
    const t = setInterval(() => router.refresh(), REFRESH_MS)
    return () => clearInterval(t)
  }, [router, isBusy])

  // Vuelta sola a la vista general: si alguien filtró y se fue, la TV no se queda así toda la tarde.
  useEffect(() => {
    if (!needsReset) return
    const t = setInterval(() => {
      if (Date.now() - lastInteraction.current < IDLE_RESET_MS) return
      setSelection(null)
      setQuartierFilter(null)
      setStatusFilter(null)
      setMapView('dakar')
      router.refresh()
    }, 10_000)
    return () => clearInterval(t)
  }, [router, needsReset])

  // Averías que nadie ha cogido: se miran sobre TODAS, no sobre las filtradas por zona — un
  // filtro de barrio puesto en la pantalla no puede esconder una avería sin atender.
  const unattended = unattendedIncidents(incidents)
  const oldestLabel = unattended[0] ? waitingLabel(unattended[0].createdAt, now).text : null

  const visibleIncidents = filterByQuartier(incidents, quartierFilter?.codes ?? null)
  const visibleMaintenances = filterByQuartier(maintenances, quartierFilter?.codes ?? null)

  const openIncident = incidents.find((i) => selection?.kind === 'incident' && i.id === selection.id) ?? null
  const openMaintenance = maintenances.find((m) => selection?.kind === 'maintenance' && m.id === selection.id) ?? null

  async function run(action: () => Promise<{ error?: string }>) {
    touch()
    setBusy(true)
    const result = await action()
    setBusy(false)
    if (!result?.error) router.refresh()
    return result
  }

  return (
    <>
      {unattended.length > 0 && <UnattendedBanner count={unattended.length} oldestLabel={oldestLabel} />}

      <div className="grid min-h-0 flex-1 grid-cols-4 gap-4" onPointerDown={touch} onKeyDown={touch}>
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
            onChangeStatus={(status) => {
              touch()
              if (status === 'résolu') { setResolving(openIncident); return }
              run(() => setIncidentStatusAction(openIncident.id, status))
            }}
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
            selected={quartierFilter}
            view={mapView}
            onViewChange={(view) => { touch(); setMapView(view) }}
            onSelect={(selection) => { touch(); setQuartierFilter(selection) }}
          />
        )}
      </div>

      <PanneAlert
        newCount={alert.count}
        lastNumero={alert.numero}
        at={alert.at}
        unattendedCount={unattended.length}
      />

      <MaintenanceList
        maintenances={visibleMaintenances}
        today={today}
        selectedId={openMaintenance?.id ?? null}
        onOpen={(visit) => { touch(); setSelection({ kind: 'maintenance', id: visit.id }) }}
      />
      </div>

      {/* La ventana no se cierra hasta que la acción responde. Aquí importa más que en
          ningún otro sitio: se rellena de pie delante de la TV, y perder el texto sin
          explicación es la forma segura de que nadie vuelva a cerrar una avería aquí. */}
      <ResolutionDialog
        open={resolving !== null}
        variant="kiosk"
        incidentLabel={resolving ? `${resolving.numeroIncident} · ${resolving.title}` : ''}
        technicians={technicians.map((t) => ({ id: t.id, name: t.fullName }))}
        busy={busy}
        error={resolutionError}
        onCancel={() => { touch(); setResolving(null); setResolutionError(null) }}
        onConfirm={async (office) => {
          const incident = resolving
          if (!incident) return
          touch()
          setResolutionError(null)
          const result = await run(() => setIncidentStatusAction(incident.id, 'résolu', office))
          if (result?.error) {
            setResolutionError(result.error)
            return
          }
          setResolving(null)
        }}
      />
    </>
  )
}
