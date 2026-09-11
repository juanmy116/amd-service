import 'server-only'
import { createAdminClient } from '@/lib/supabase/admin'
import { resolveQuartierCode, toQuartiers, type Quartier } from '@/lib/quartiers'
import type { AtelierIncident, AtelierMaintenanceVisit } from '@/components/atelier/types'
import {
  LIVE_STATUSES,
  maintenanceWindow,
  type BoardIncident,
  type BoardMaintenance,
} from '@/lib/atelier/board'

/**
 * Consultas del kiosko `/atelier`. Viven aparte de `page.tsx` para que la página se lea de un
 * vistazo y para poder reutilizarlas en la vista kanban.
 *
 * Todo va con `createAdminClient()` (service_role): el kiosko es una pantalla de taller con
 * cuenta de dispatcher, y la autorización la hace `requireDispatcher()` antes de llamar aquí.
 */

export type Technician = { id: string; fullName: string }

export type BoardData = {
  incidents: BoardIncident[]
  maintenances: BoardMaintenance[]
  quartiers: Quartier[]
  technicians: Technician[]
  kpis: { sansTechnicien: number; enCours: number; urgentes: number; resolusSemaine: number }
}

/** Lunes de la semana en curso, para el contador de resueltas. */
function startOfWeek(now: Date): number {
  const d = new Date(now)
  const day = d.getDay()
  d.setDate(d.getDate() + (day === 0 ? -6 : 1 - day))
  d.setHours(0, 0, 0, 0)
  return d.getTime()
}

export async function getBoardData(now = new Date()): Promise<BoardData> {
  const admin = createAdminClient()
  const { from, to } = maintenanceWindow(now)

  const [incidentsRes, visitsRes, techsRes, quartiersRes] = await Promise.all([
    admin
      .from('incidents')
      .select(`
        id, numero_incident, title, description, status, priority, created_at, resolved_at,
        assigned_to, contact_phone, machine_id,
        contract_machines (
          machines ( marque, modele, numero_serie, quartier_code ),
          contracts ( clients ( nom_client, quartier_code ) )
        ),
        profiles!assigned_to ( full_name )
      `)
      .neq('status', 'fermé')
      .order('created_at', { ascending: true })
      .limit(400),
    admin
      .from('maintenance_visits')
      .select(`
        id, scheduled_date, status, assigned_to,
        contract_machines (
          machines ( marque, modele, quartier_code ),
          contracts ( clients ( nom_client, quartier_code ) )
        ),
        profiles!assigned_to ( full_name )
      `)
      .gte('scheduled_date', from)
      .lte('scheduled_date', to),
    admin.from('profiles').select('id, full_name').eq('role', 'technician').neq('is_dispatcher', true).order('full_name'),
    admin.from('quartiers').select('code, label, ville, lat, lng, sort_order, active').order('sort_order'),
  ])

  const rawIncidents = incidentsRes.data ?? []
  const quartiers = toQuartiers(quartiersRes.data)
  const labelByCode = new Map(quartiers.map((q) => [q.code, q.label]))

  // ── Incidencias sin línea de contrato ────────────────────────────────────────
  // Las del formulario público del QR guardan `machine_id` directo y no pasan por
  // `contract_machines`. Sin este rescate se quedarían sin cliente ni zona en el tablero
  // (hoy en producción, la única incidencia abierta es precisamente de este tipo).
  const orphanSeries = rawIncidents
    .filter((i) => i.contract_machines === null && i.machine_id !== null)
    .map((i) => i.machine_id as string)

  const orphanInfo = new Map<string, { clientName: string | null; quartierCode: string | null; machineLabel: string | null }>()

  if (orphanSeries.length > 0) {
    const [machinesRes, parkRes] = await Promise.all([
      admin.from('machines').select('numero_serie, marque, modele, quartier_code').in('numero_serie', orphanSeries),
      admin.from('v_machine_park').select('numero_serie, client_id').in('numero_serie', orphanSeries),
    ])

    const clientIds = [...new Set((parkRes.data ?? []).map((p) => p.client_id).filter((id): id is number => id !== null))]
    const clientsRes = clientIds.length > 0
      ? await admin.from('clients').select('id, nom_client, quartier_code').in('id', clientIds)
      : { data: [] }

    const clientById = new Map((clientsRes.data ?? []).map((c) => [c.id, c]))
    const parkBySerie = new Map((parkRes.data ?? []).map((p) => [p.numero_serie, p]))

    for (const m of machinesRes.data ?? []) {
      const client = clientById.get(parkBySerie.get(m.numero_serie)?.client_id ?? -1)
      orphanInfo.set(m.numero_serie, {
        clientName: client?.nom_client ?? null,
        quartierCode: resolveQuartierCode(m.quartier_code, client?.quartier_code),
        machineLabel: `${m.marque} ${m.modele}`,
      })
    }
  }

  // ── Fotos del cliente: una consulta y firma en lote ─────────────────────────
  const liveIncidents = rawIncidents.filter((i) => (LIVE_STATUSES as readonly string[]).includes(i.status))
  const photoUrlById = new Map<string, string>()
  if (liveIncidents.length > 0) {
    const { data: photoRows } = await admin
      .from('incident_photos')
      .select('incident_id, storage_path, created_at')
      .in('incident_id', liveIncidents.map((i) => i.id))
      .order('created_at', { ascending: true })

    const firstPathByIncident = new Map<string, string>()
    for (const r of photoRows ?? []) {
      if (!firstPathByIncident.has(r.incident_id)) firstPathByIncident.set(r.incident_id, r.storage_path)
    }
    if (firstPathByIncident.size > 0) {
      const { data: signed } = await admin.storage
        .from('incident-photos')
        .createSignedUrls([...firstPathByIncident.values()], 3600)
      const urlByPath = new Map((signed ?? []).map((s) => [s.path, s.signedUrl]))
      for (const [incidentId, path] of firstPathByIncident) {
        const url = urlByPath.get(path)
        if (url) photoUrlById.set(incidentId, url)
      }
    }
  }

  const incidents: BoardIncident[] = liveIncidents.map((i) => {
    const line = i.contract_machines
    const machine = line?.machines
    const client = line?.contracts?.clients
    const orphan = i.machine_id ? orphanInfo.get(i.machine_id) : undefined

    const quartierCode = line
      ? resolveQuartierCode(machine?.quartier_code, client?.quartier_code)
      : orphan?.quartierCode ?? null

    return {
      id: i.id,
      numeroIncident: i.numero_incident,
      title: i.title,
      description: i.description,
      status: i.status,
      priority: i.priority,
      createdAt: i.created_at,
      clientName: client?.nom_client ?? orphan?.clientName ?? null,
      machineLabel: machine ? `${machine.marque} ${machine.modele}` : orphan?.machineLabel ?? null,
      contactPhone: i.contact_phone,
      quartierCode,
      quartierLabel: quartierCode ? labelByCode.get(quartierCode) ?? null : null,
      technicianId: i.assigned_to,
      technicianName: i.profiles?.full_name ?? null,
      photoUrl: photoUrlById.get(i.id) ?? null,
    }
  })

  const maintenances: BoardMaintenance[] = (visitsRes.data ?? []).map((v) => {
    const line = v.contract_machines
    const machine = line?.machines
    const client = line?.contracts?.clients
    const quartierCode = resolveQuartierCode(machine?.quartier_code, client?.quartier_code)

    return {
      id: v.id,
      scheduledDate: v.scheduled_date,
      status: v.status,
      clientName: client?.nom_client ?? null,
      machineLabel: machine ? `${machine.marque} ${machine.modele}` : null,
      quartierCode,
      quartierLabel: quartierCode ? labelByCode.get(quartierCode) ?? null : null,
      technicianId: v.assigned_to,
      technicianName: v.profiles?.full_name ?? null,
    }
  })

  const weekStart = startOfWeek(now)
  const kpis = {
    sansTechnicien: incidents.filter((i) => i.technicianId === null).length,
    enCours: incidents.filter((i) => i.status === 'en_cours').length,
    urgentes: incidents.filter((i) => i.priority === 'urgente').length,
    resolusSemaine: rawIncidents.filter(
      (i) => i.resolved_at !== null && new Date(i.resolved_at).getTime() >= weekStart
    ).length,
  }

  const technicians: Technician[] = (techsRes.data ?? []).map((t) => ({
    id: t.id,
    fullName: t.full_name ?? '—',
  }))

  return { incidents, maintenances, quartiers, technicians, kpis }
}

// ─── Vista kanban (la de siempre) ─────────────────────────────────────────────

function mondayOf(now: Date): Date {
  const d = new Date(now)
  const day = d.getDay()
  d.setDate(d.getDate() + (day === 0 ? -6 : 1 - day))
  d.setHours(0, 0, 0, 0)
  return d
}

/**
 * Datos de `/atelier/kanban`. Se apoya en `getBoardData()` y solo añade lo que la vista carte
 * no necesita: las incidencias resueltas esta semana (el kanban tiene columna «Résolu») y las
 * visitas de lunes a viernes en su rejilla.
 */
export async function getKanbanData(now = new Date()): Promise<{
  incidents: AtelierIncident[]
  visits: AtelierMaintenanceVisit[]
  weekDates: string[]
  technicians: Technician[]
  kpis: BoardData['kpis']
}> {
  const board = await getBoardData(now)
  const admin = createAdminClient()

  const monday = mondayOf(now)
  const weekDates = Array.from({ length: 5 }, (_, i) => {
    const d = new Date(monday)
    d.setDate(monday.getDate() + i)
    return d.toISOString().slice(0, 10)
  })

  const { data: resolvedRows } = await admin
    .from('incidents')
    .select(`
      id, numero_incident, title, description, status, priority, assigned_to,
      contract_machines ( contracts ( clients ( nom_client ) ) ),
      profiles!assigned_to ( full_name )
    `)
    .eq('status', 'résolu')
    .gte('resolved_at', monday.toISOString())
    .limit(200)

  const resolved: AtelierIncident[] = (resolvedRows ?? []).map((i) => ({
    id: i.id,
    numeroIncident: i.numero_incident,
    title: i.title,
    status: i.status,
    priority: i.priority,
    clientName: i.contract_machines?.contracts?.clients?.nom_client ?? null,
    technicianId: i.assigned_to,
    technicianName: i.profiles?.full_name ?? null,
    description: i.description,
    photoUrl: null,
  }))

  const live: AtelierIncident[] = board.incidents.map((i) => ({
    id: i.id,
    numeroIncident: i.numeroIncident,
    title: i.title,
    status: i.status,
    priority: i.priority,
    clientName: i.clientName,
    technicianId: i.technicianId,
    technicianName: i.technicianName,
    description: i.description,
    photoUrl: i.photoUrl,
  }))

  const visits: AtelierMaintenanceVisit[] = board.maintenances
    .filter((v) => weekDates.includes(v.scheduledDate))
    .map((v) => ({
      id: v.id,
      scheduledDate: v.scheduledDate,
      clientName: v.clientName ?? '—',
      machineLabel: v.machineLabel ?? '—',
      status: v.status,
      technicianId: v.technicianId,
      technicianName: v.technicianName,
    }))

  return { incidents: [...live, ...resolved], visits, weekDates, technicians: board.technicians, kpis: board.kpis }
}
