import { createClient } from '@/lib/supabase/server'
import Link from 'next/link'
import { Plus } from 'lucide-react'
import { CsatTrendChart, IncidentsTrendChart } from '@/components/admin/DashboardCharts'
import type { CsatPoint, IncidentPoint } from '@/components/admin/DashboardCharts'
import DashboardKpiStrip from '@/components/admin/DashboardKpiStrip'
import DashboardCopiesBanner from '@/components/admin/DashboardCopiesBanner'
import DashboardRecentIncidents from '@/components/admin/DashboardRecentIncidents'
import DashboardTechTable from '@/components/admin/DashboardTechTable'
import type { TechPerf } from '@/components/admin/DashboardTechTable'
import DashboardStatusDist from '@/components/admin/DashboardStatusDist'
import { Card } from '@/components/ui/Card'
import { buttonClasses } from '@/components/ui/Button'

const MONTHS_FR = ['', 'Jan', 'Fév', 'Mar', 'Avr', 'Mai', 'Juin', 'Juil', 'Août', 'Sep', 'Oct', 'Nov', 'Déc']

async function getDashboardData() {
  const supabase = await createClient()
  const now = new Date()
  const currentYear  = now.getFullYear()
  const currentMonth = now.getMonth() + 1

  const last6Months = Array.from({ length: 6 }, (_, i) => {
    const d = new Date(now)
    d.setMonth(d.getMonth() - (5 - i))
    return { year: d.getFullYear(), month: d.getMonth() + 1, label: MONTHS_FR[d.getMonth() + 1] }
  })

  const sixMonthsAgo = new Date(now)
  sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6)

  const [
    clientsRes,
    machinesRes,
    contractsRes,
    incidentsRes,
    csatRes,
    countersRes,
    techRes,
  ] = await Promise.all([
    supabase.from('clients').select('*', { count: 'exact', head: true }).eq('active', true),
    supabase.from('machines').select('*', { count: 'exact', head: true }).eq('active', true),
    supabase.from('contracts').select('*', { count: 'exact', head: true }).eq('statut', 'actif'),
    supabase
      .from('incidents')
      .select('id, status, assigned_to, created_at')
      .gte('created_at', sixMonthsAgo.toISOString())
      .limit(500),
    supabase
      .from('csat_responses')
      .select('rating, responded_at')
      .not('responded_at', 'is', null)
      .gte('responded_at', sixMonthsAgo.toISOString())
      .limit(300),
    supabase
      .from('machine_counters')
      .select('counter_bw, counter_color')
      .eq('year', currentYear)
      .eq('month', currentMonth)
      .eq('status', 'actif'),
    supabase.from('profiles').select('id, full_name').eq('role', 'technician').order('full_name'),
  ])

  const incidents  = incidentsRes.data  ?? []
  const csatData   = csatRes.data       ?? []
  const counters   = countersRes.data   ?? []
  const techs      = techRes.data       ?? []

  const openIncidents = incidents.filter(i => !['résolu', 'fermé'].includes(i.status)).length
  const totalCopies   = counters.reduce((s, c) => s + (c.counter_bw ?? 0) + (c.counter_color ?? 0), 0)
  const avgCsat       = csatData.length
    ? csatData.reduce((s, r) => s + r.rating, 0) / csatData.length
    : 0

  const csatByMonth: Record<string, { sum: number; count: number }> = {}
  csatData.forEach(r => {
    const d   = new Date(r.responded_at!)
    const key = `${d.getFullYear()}-${d.getMonth() + 1}`
    if (!csatByMonth[key]) csatByMonth[key] = { sum: 0, count: 0 }
    csatByMonth[key].sum   += r.rating
    csatByMonth[key].count += 1
  })
  const csatTrend: CsatPoint[] = last6Months.map(m => {
    const entry = csatByMonth[`${m.year}-${m.month}`]
    return {
      month: m.label,
      avg:   entry ? parseFloat((entry.sum / entry.count).toFixed(2)) : null,
      count: entry?.count ?? 0,
    }
  })

  const incidentMonthMap: Record<string, number> = {}
  incidents.forEach(inc => {
    const d   = new Date(inc.created_at)
    const key = `${d.getFullYear()}-${d.getMonth() + 1}`
    incidentMonthMap[key] = (incidentMonthMap[key] ?? 0) + 1
  })
  const incidentsTrend: IncidentPoint[] = last6Months.map(m => ({
    month: m.label,
    total: incidentMonthMap[`${m.year}-${m.month}`] ?? 0,
  }))

  const statusDist = incidents.reduce((acc, inc) => {
    acc[inc.status] = (acc[inc.status] ?? 0) + 1
    return acc
  }, {} as Record<string, number>)
  const statusTotal = Object.values(statusDist).reduce((a, b) => a + b, 0)

  const techPerf: TechPerf[] = techs
    .map(tech => {
      const mine     = incidents.filter(i => i.assigned_to === tech.id)
      const total    = mine.length
      const resolved = mine.filter(i => ['résolu', 'fermé'].includes(i.status)).length
      const active   = mine.filter(i => ['assigné', 'en_cours'].includes(i.status)).length
      const rate     = total > 0 ? Math.round((resolved / total) * 100) : 0
      return { id: tech.id, fullName: tech.full_name ?? '—', total, resolved, active, rate }
    })
    .sort((a, b) => b.total - a.total)

  return {
    stats: {
      clients:   clientsRes.count  ?? 0,
      machines:  machinesRes.count ?? 0,
      contracts: contractsRes.count ?? 0,
      openIncidents,
    },
    totalCopies,
    avgCsat,
    csatCount:  csatData.length,
    csatTrend,
    incidentsTrend,
    statusDist,
    statusTotal,
    techPerf,
    today: now.toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' }),
  }
}

export default async function Dashboard() {
  const data = await getDashboardData()

  return (
    <div className="p-8 space-y-6">

      {/* Header */}
      <div className="flex items-end justify-between">
        <div>
          <h1 className="font-display text-2xl font-semibold text-ink">
            Tableau de bord
          </h1>
          <p className="text-sm text-ink-muted mt-0.5">Vue direction — {data.today}</p>
        </div>
        <Link href="/admin/incidents/new" className={buttonClasses('primary')}>
          <Plus size={16} />
          Nouveau Ticket
        </Link>
      </div>

      <DashboardKpiStrip
        clients={data.stats.clients}
        machines={data.stats.machines}
        contracts={data.stats.contracts}
        openIncidents={data.stats.openIncidents}
        avgCsat={data.avgCsat}
      />

      <DashboardCopiesBanner totalCopies={data.totalCopies} />

      <DashboardRecentIncidents />

      {/* Charts */}
      <div className="grid grid-cols-5 gap-5">
        <div className="col-span-3">
          <Card>
            <div className="flex items-center justify-between px-4 py-3.5 border-b border-line-subtle">
              <div>
                <h3 className="font-display text-sm font-semibold text-ink">Évolution CSAT</h3>
                <p className="text-xs text-ink-muted mt-0.5">
                  Note moyenne de satisfaction sur 6 mois
                </p>
              </div>
              {data.csatCount > 0 && (
                <span className="text-xs text-ink-muted bg-neutral-soft border border-line rounded-full px-2.5 py-1">
                  {data.csatCount} réponses
                </span>
              )}
            </div>
            <div className="p-5">
              <CsatTrendChart data={data.csatTrend} />
              {data.avgCsat > 0 && (
                <p className="text-xs text-ink-muted mt-3">Ligne verte = objectif 4/5</p>
              )}
            </div>
          </Card>
        </div>

        <div className="col-span-2">
          <Card>
            <div className="flex items-center justify-between px-4 py-3.5 border-b border-line-subtle">
              <div>
                <h3 className="font-display text-sm font-semibold text-ink">
                  Nouvelles interventions
                </h3>
                <p className="text-xs text-ink-muted mt-0.5">
                  Incidents créés par mois (6 mois)
                </p>
              </div>
            </div>
            <div className="p-5">
              <IncidentsTrendChart data={data.incidentsTrend} />
            </div>
          </Card>
        </div>
      </div>

      {/* Performance */}
      <div className="grid grid-cols-5 gap-5">
        <DashboardTechTable techPerf={data.techPerf} />
        <DashboardStatusDist statusDist={data.statusDist} statusTotal={data.statusTotal} />
      </div>

    </div>
  )
}
