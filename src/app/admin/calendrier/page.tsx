import { createClient } from '@/lib/supabase/server'
import AdminCalendarView, { type CalEvent } from '@/components/admin/CalendarView'

const VISIT_COLOR: Record<string, { color: string }> = {
  planifié:  { color: '#3B82F6' },
  en_retard: { color: '#EF4444' },
  fait:      { color: '#D1D5DB' },
}

const INCIDENT_COLOR: Record<string, { color: string }> = {
  nouveau:  { color: '#F97316' },
  assigné:  { color: '#A855F7' },
  en_cours: { color: '#F59E0B' },
}

export default async function CalendrierPage() {
  const supabase = await createClient()

  const now  = new Date()
  const from = new Date(now.getFullYear() - 1, 0, 1).toISOString().split('T')[0]
  const to   = new Date(now.getFullYear() + 1, 11, 31).toISOString().split('T')[0]

  const [{ data: visits }, { data: incidents }] = await Promise.all([
    supabase
      .from('maintenance_visits')
      .select(`
        id, scheduled_date, status,
        maintenance_plans (
          id,
          contracts (
            clients  ( nom_client ),
            machines ( marque, modele )
          )
        )
      `)
      .gte('scheduled_date', from)
      .lte('scheduled_date', to)
      .order('scheduled_date'),
    supabase
      .from('incidents')
      .select('id, title, status, created_at')
      .not('status', 'in', '("résolu","fermé")')
      .gte('created_at', `${from}T00:00:00`)
      .order('created_at', { ascending: false }),
  ])

  const events: CalEvent[] = []

  for (const v of visits ?? []) {
    const plan     = v.maintenance_plans as any
    const contract = plan?.contracts as any
    const client   = contract?.clients?.nom_client ?? '—'
    const machine  = `${contract?.machines?.marque ?? ''} ${contract?.machines?.modele ?? ''}`.trim()
    const cfg      = VISIT_COLOR[v.status] ?? VISIT_COLOR.planifié

    events.push({
      id:        `visit-${v.id}`,
      title:     `${client} — ${machine}`,
      start:     v.scheduled_date,
      allDay:    true,
      color:     cfg.color,
      textColor: '#ffffff',
      href:      plan?.id ? `/admin/maintenance/${plan.id}` : '/admin/maintenance',
    })
  }

  for (const inc of incidents ?? []) {
    const cfg = INCIDENT_COLOR[inc.status] ?? INCIDENT_COLOR.nouveau
    events.push({
      id:        `inc-${inc.id}`,
      title:     `[SAV] ${inc.title}`,
      start:     inc.created_at.split('T')[0],
      allDay:    true,
      color:     cfg.color,
      textColor: '#ffffff',
      href:      `/admin/incidents/${inc.id}`,
    })
  }

  const totalVisits    = (visits ?? []).length
  const overdueVisits  = (visits ?? []).filter(v => v.status === 'en_retard').length
  const openIncidents  = (incidents ?? []).length

  return (
    <div className="p-8 space-y-6">

      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900" style={{ fontFamily: 'Poppins, sans-serif' }}>
            Calendrier
          </h1>
          <p className="text-sm text-gray-400 mt-0.5">
            {totalVisits} visite{totalVisits !== 1 ? 's' : ''} de maintenance
            {overdueVisits > 0 && (
              <span className="ml-2 text-red-500 font-medium">· {overdueVisits} en retard</span>
            )}
            {openIncidents > 0 && (
              <span className="ml-2 text-orange-500 font-medium">· {openIncidents} incident{openIncidents !== 1 ? 's' : ''} ouvert{openIncidents !== 1 ? 's' : ''}</span>
            )}
          </p>
        </div>
      </div>

      <AdminCalendarView events={events} />

    </div>
  )
}
