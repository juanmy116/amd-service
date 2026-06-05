import { requireDispatcher } from '@/lib/auth'
import { createAdminClient } from '@/lib/supabase/admin'
import AtelierHeader from '@/components/atelier/AtelierHeader'
import AtelierKpis from '@/components/atelier/AtelierKpis'
import AtelierKanban from '@/components/atelier/AtelierKanban'
import AtelierMaintenanceWeek from '@/components/atelier/AtelierMaintenanceWeek'
import AutoRefresh from '@/components/atelier/AutoRefresh'
import type { AtelierIncident, AtelierMaintenanceVisit, Technician } from '@/components/atelier/types'

export const dynamic = 'force-dynamic'

function mondayOf(d: Date): Date {
  const date = new Date(d)
  const day = date.getDay()
  const diff = day === 0 ? -6 : 1 - day
  date.setDate(date.getDate() + diff)
  date.setHours(0, 0, 0, 0)
  return date
}

function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10)
}

export default async function AtelierPage() {
  await requireDispatcher()
  const admin = createAdminClient()

  const now = new Date()
  const monday = mondayOf(now)
  const weekStart = monday.getTime()
  const weekDates: string[] = Array.from({ length: 5 }, (_, i) => {
    const d = new Date(monday)
    d.setDate(monday.getDate() + i)
    return isoDate(d)
  })
  const mondayIso = isoDate(monday)
  const fridayDate = new Date(monday)
  fridayDate.setDate(monday.getDate() + 4)
  const fridayIso = isoDate(fridayDate)

  const [incidentsRes, visitsRes, techsRes] = await Promise.all([
    admin
      .from('incidents')
      .select(`
        id, numero_incident, title, status, priority, resolved_at, assigned_to,
        contract_machines ( contracts ( clients ( nom_client ) ) ),
        profiles!assigned_to ( full_name )
      `)
      .neq('status', 'fermé')
      .order('created_at', { ascending: false })
      .limit(400),
    admin
      .from('maintenance_visits')
      .select(`
        id, scheduled_date, status, assigned_to,
        contract_machines ( machines ( marque, modele ), contracts ( clients ( nom_client ) ) ),
        profiles!assigned_to ( full_name )
      `)
      .gte('scheduled_date', mondayIso)
      .lte('scheduled_date', fridayIso),
    admin
      .from('profiles')
      .select('id, full_name')
      .eq('role', 'technician')
      .neq('is_dispatcher', true)
      .order('full_name'),
  ])

  type IncRow = {
    id: string
    numero_incident: string
    title: string
    status: string
    priority: string
    resolved_at: string | null
    assigned_to: string | null
    contract_machines: { contracts: { clients: { nom_client: string } | null } | null } | null
    profiles: { full_name: string | null } | null
  }
  const rawIncidents = (incidentsRes.data ?? []) as unknown as IncRow[]

  const resolvedThisWeek = (i: IncRow) =>
    i.resolved_at !== null && new Date(i.resolved_at).getTime() >= weekStart

  const boardIncidents: AtelierIncident[] = rawIncidents
    .filter((i) => i.status !== 'résolu' || resolvedThisWeek(i))
    .map((i) => ({
      id: i.id,
      numeroIncident: i.numero_incident,
      title: i.title,
      status: i.status,
      priority: i.priority,
      clientName: i.contract_machines?.contracts?.clients?.nom_client ?? null,
      technicianId: i.assigned_to,
      technicianName: i.profiles?.full_name ?? null,
    }))

  const openIncidents = rawIncidents.filter((i) => i.status !== 'résolu')
  const kpis = {
    sansAssigner:   openIncidents.filter((i) => i.assigned_to === null).length,
    enCours:        rawIncidents.filter((i) => i.status === 'en_cours').length,
    urgentes:       openIncidents.filter((i) => i.priority === 'urgente').length,
    resolusSemaine: rawIncidents.filter(resolvedThisWeek).length,
  }

  type VisitRow = {
    id: string
    scheduled_date: string
    status: string
    assigned_to: string | null
    contract_machines: {
      machines: { marque: string; modele: string } | null
      contracts: { clients: { nom_client: string } | null } | null
    } | null
    profiles: { full_name: string | null } | null
  }
  const rawVisits = (visitsRes.data ?? []) as unknown as VisitRow[]
  const visits: AtelierMaintenanceVisit[] = rawVisits.map((v) => {
    const line = v.contract_machines
    const contract = line?.contracts
    const machine = line?.machines
    return {
      id: v.id,
      scheduledDate: v.scheduled_date,
      clientName: contract?.clients?.nom_client ?? '—',
      machineLabel: machine
        ? `${machine.marque} ${machine.modele}`
        : '—',
      status: v.status,
      technicianId: v.assigned_to,
      technicianName: v.profiles?.full_name ?? null,
    }
  })

  const technicians: Technician[] = (techsRes.data ?? []).map((t) => ({
    id: t.id,
    fullName: t.full_name ?? '—',
  }))

  return (
    <div className="h-full flex flex-col gap-4 p-6">
      <AutoRefresh intervalMs={30000} />
      <AtelierHeader />
      <AtelierKpis kpis={kpis} />

      <section className="flex-[1.6] flex flex-col min-h-0">
        <p className="text-xs font-bold uppercase tracking-widest text-white/30 mb-2">Incidents SAV</p>
        <div className="flex-1 min-h-0">
          <AtelierKanban incidents={boardIncidents} technicians={technicians} />
        </div>
      </section>

      <section className="flex-[0.9] flex flex-col min-h-0">
        <p className="text-xs font-bold uppercase tracking-widest text-white/30 mb-2">
          Maintenances — cette semaine
        </p>
        <div className="flex-1 min-h-0">
          <AtelierMaintenanceWeek visits={visits} weekDates={weekDates} technicians={technicians} />
        </div>
      </section>
    </div>
  )
}
