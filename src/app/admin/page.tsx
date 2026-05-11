import { createClient } from '@/lib/supabase/server'
import { Users, Printer, FileText, AlertCircle, BarChart2 } from 'lucide-react'
import Link from 'next/link'
import { CsatTrendChart, IncidentsTrendChart } from '@/components/admin/DashboardCharts'
import type { CsatPoint, IncidentPoint } from '@/components/admin/DashboardCharts'

const MONTHS_FR = ['', 'Jan', 'Fév', 'Mar', 'Avr', 'Mai', 'Juin', 'Juil', 'Août', 'Sep', 'Oct', 'Nov', 'Déc']

const STATUS_CONFIG: Record<string, { label: string; color: string }> = {
  nouveau:  { label: 'Nouveau',  color: '#3B82F6' },
  assigné:  { label: 'Assigné',  color: '#F59E0B' },
  en_cours: { label: 'En cours', color: '#F97316' },
  résolu:   { label: 'Résolu',   color: '#10B981' },
  fermé:    { label: 'Fermé',    color: '#6B7280' },
}

type TechPerf = {
  id: string
  fullName: string
  total: number
  resolved: number
  active: number
  rate: number
}

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

  // --- KPIs ---
  const openIncidents = incidents.filter(i => !['résolu', 'fermé'].includes(i.status)).length
  const totalBW    = counters.reduce((s, c) => s + (c.counter_bw    ?? 0), 0)
  const totalColor = counters.reduce((s, c) => s + (c.counter_color ?? 0), 0)
  const totalCopies = totalBW + totalColor

  const avgCsat = csatData.length
    ? csatData.reduce((s, r) => s + r.rating, 0) / csatData.length
    : 0

  // --- CSAT trend (6 months) ---
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

  // --- Incidents per month (6 months) ---
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

  // --- Status distribution ---
  const statusDist = incidents.reduce((acc, inc) => {
    acc[inc.status] = (acc[inc.status] ?? 0) + 1
    return acc
  }, {} as Record<string, number>)
  const statusTotal = Object.values(statusDist).reduce((a, b) => a + b, 0)

  // --- Technician performance ---
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
    currentMonthLabel: `${MONTHS_FR[currentMonth]} ${currentYear}`,
  }
}

function KpiCard({
  label, value, sub, icon: Icon, accent,
}: {
  label: string
  value: string | number
  sub?: string
  icon: React.ElementType
  accent: string
}) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 p-5">
      <div className="flex items-start justify-between mb-3">
        <p className="text-xs font-medium text-gray-400 uppercase tracking-wider leading-none">{label}</p>
        <div
          className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0"
          style={{ backgroundColor: `${accent}18` }}
        >
          <Icon size={16} style={{ color: accent }} />
        </div>
      </div>
      <p className="text-3xl font-bold text-gray-900 leading-none" style={{ fontFamily: 'Poppins, sans-serif' }}>
        {value}
      </p>
      {sub && <p className="text-xs text-gray-400 mt-2">{sub}</p>}
    </div>
  )
}

function CsatStars({ avg }: { avg: number }) {
  const filled = Math.round(avg)
  return (
    <div className="flex gap-0.5 mt-2">
      {[1, 2, 3, 4, 5].map(n => (
        <span key={n} className="text-base leading-none" style={{ color: n <= filled ? '#F59E0B' : '#E5E7EB' }}>
          ★
        </span>
      ))}
    </div>
  )
}

function RateChip({ rate, total }: { rate: number; total: number }) {
  if (total === 0) return <span className="text-xs text-gray-400">—</span>
  const cls =
    rate >= 80 ? 'bg-green-100 text-green-700' :
    rate >= 50 ? 'bg-orange-100 text-orange-700' :
                 'bg-red-100 text-red-700'
  return (
    <span className={`inline-flex text-xs font-semibold px-2 py-0.5 rounded-full ${cls}`}>
      {rate}%
    </span>
  )
}

export default async function Dashboard() {
  const data = await getDashboardData()

  return (
    <div className="p-8 space-y-6">

      {/* Header */}
      <div className="flex items-end justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900" style={{ fontFamily: 'Poppins, sans-serif' }}>
            Tableau de bord
          </h1>
          <p className="text-sm text-gray-400 mt-0.5">Vue direction — {data.today}</p>
        </div>
        <div className="text-right">
          <p className="text-[11px] text-gray-400 uppercase tracking-wider">Période active</p>
          <p className="text-sm font-medium text-gray-700 mt-0.5">{data.currentMonthLabel}</p>
        </div>
      </div>

      {/* KPI strip */}
      <div className="grid grid-cols-5 gap-4">
        <KpiCard
          label="Clients actifs"
          value={data.stats.clients}
          icon={Users}
          accent="#3B82F6"
          sub="entreprises & institutions"
        />
        <KpiCard
          label="Machines actives"
          value={data.stats.machines}
          icon={Printer}
          accent="#10B981"
          sub="en location"
        />
        <KpiCard
          label="Contrats actifs"
          value={data.stats.contracts}
          icon={FileText}
          accent="#8B5CF6"
        />
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <div className="flex items-start justify-between mb-3">
            <p className="text-xs font-medium text-gray-400 uppercase tracking-wider leading-none">CSAT moyen</p>
            <div className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0" style={{ backgroundColor: '#F59E0B18' }}>
              <span style={{ color: '#F59E0B', fontSize: 16, lineHeight: 1 }}>★</span>
            </div>
          </div>
          <p className="text-3xl font-bold text-gray-900 leading-none" style={{ fontFamily: 'Poppins, sans-serif' }}>
            {data.avgCsat > 0 ? data.avgCsat.toFixed(1) : '—'}
            {data.avgCsat > 0 && <span className="text-sm font-normal text-gray-400 ml-1">/5</span>}
          </p>
          {data.avgCsat > 0
            ? <CsatStars avg={data.avgCsat} />
            : <p className="text-xs text-gray-400 mt-2">Aucune réponse</p>
          }
        </div>
        <KpiCard
          label="Incidents ouverts"
          value={data.stats.openIncidents}
          icon={AlertCircle}
          accent="#BF0D0D"
          sub={data.stats.openIncidents > 0 ? 'en attente de résolution' : 'tout est résolu ✓'}
        />
      </div>

      {/* Copies KPI — full width banner */}
      {data.totalCopies > 0 && (
        <div
          className="rounded-xl p-5 flex items-center justify-between"
          style={{ backgroundColor: '#BF0D0D', color: 'white' }}
        >
          <div className="flex items-center gap-3">
            <BarChart2 size={20} className="opacity-80" />
            <div>
              <p className="text-xs font-medium opacity-70 uppercase tracking-wider">Copies enregistrées ce mois</p>
              <p className="text-2xl font-bold mt-0.5" style={{ fontFamily: 'Poppins, sans-serif' }}>
                {data.totalCopies.toLocaleString('fr-FR')}
              </p>
            </div>
          </div>
          <Link
            href="/admin/contadores"
            className="text-sm font-medium opacity-80 hover:opacity-100 transition-opacity border border-white/30 rounded-lg px-3 py-1.5"
          >
            Voir les compteurs →
          </Link>
        </div>
      )}

      {/* Charts row */}
      <div className="grid grid-cols-5 gap-5">

        {/* CSAT trend */}
        <div className="col-span-3 bg-white rounded-xl border border-gray-200 p-6">
          <div className="flex items-center justify-between mb-5">
            <div>
              <h2 className="text-sm font-semibold text-gray-900">Évolution CSAT</h2>
              <p className="text-xs text-gray-400 mt-0.5">Note moyenne de satisfaction sur 6 mois</p>
            </div>
            {data.csatCount > 0 && (
              <span className="text-xs text-gray-400 bg-gray-50 border border-gray-100 rounded-full px-2.5 py-1">
                {data.csatCount} réponses
              </span>
            )}
          </div>
          <CsatTrendChart data={data.csatTrend} />
          {data.avgCsat > 0 && (
            <p className="text-xs text-gray-400 mt-3">
              Ligne verte = objectif 4/5
            </p>
          )}
        </div>

        {/* Incidents per month */}
        <div className="col-span-2 bg-white rounded-xl border border-gray-200 p-6">
          <div className="mb-5">
            <h2 className="text-sm font-semibold text-gray-900">Nouvelles interventions</h2>
            <p className="text-xs text-gray-400 mt-0.5">Incidents créés par mois (6 mois)</p>
          </div>
          <IncidentsTrendChart data={data.incidentsTrend} />
        </div>
      </div>

      {/* Bottom row */}
      <div className="grid grid-cols-5 gap-5">

        {/* Technician performance table */}
        <div className="col-span-3 bg-white rounded-xl border border-gray-200 overflow-hidden">
          <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
            <h2 className="text-sm font-semibold text-gray-900">Performance équipe technique</h2>
            <Link
              href="/admin/team"
              className="text-xs text-gray-400 hover:text-gray-700 transition-colors"
            >
              Gérer l&apos;équipe →
            </Link>
          </div>
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-50 bg-gray-50/60">
                <th className="text-left text-[11px] font-medium text-gray-400 px-6 py-3">Technicien</th>
                <th className="text-right text-[11px] font-medium text-gray-400 px-4 py-3">Total</th>
                <th className="text-right text-[11px] font-medium text-gray-400 px-4 py-3">Résolus</th>
                <th className="text-right text-[11px] font-medium text-gray-400 px-4 py-3">En cours</th>
                <th className="text-right text-[11px] font-medium text-gray-400 px-6 py-3">Taux</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {data.techPerf.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-6 py-10 text-center text-sm text-gray-400">
                    Aucun technicien enregistré
                  </td>
                </tr>
              ) : (
                data.techPerf.map(tech => (
                  <tr key={tech.id} className="hover:bg-gray-50/60 transition-colors">
                    <td className="px-6 py-3.5 font-medium text-gray-900">{tech.fullName}</td>
                    <td className="px-4 py-3.5 text-right text-gray-600">{tech.total}</td>
                    <td className="px-4 py-3.5 text-right font-medium text-green-600">{tech.resolved}</td>
                    <td className="px-4 py-3.5 text-right text-orange-500">{tech.active}</td>
                    <td className="px-6 py-3.5 text-right">
                      <RateChip rate={tech.rate} total={tech.total} />
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Status distribution */}
        <div className="col-span-2 bg-white rounded-xl border border-gray-200 p-6">
          <div className="flex items-center justify-between mb-5">
            <h2 className="text-sm font-semibold text-gray-900">Statut des incidents</h2>
            <Link
              href="/admin/incidents"
              className="text-xs text-gray-400 hover:text-gray-700 transition-colors"
            >
              Voir le kanban →
            </Link>
          </div>

          {data.statusTotal === 0 ? (
            <div className="flex items-center justify-center h-32 text-sm text-gray-400">
              Aucun incident enregistré
            </div>
          ) : (
            <div className="space-y-4">
              {Object.entries(STATUS_CONFIG).map(([key, { label, color }]) => {
                const count = data.statusDist[key] ?? 0
                const pct   = data.statusTotal > 0 ? Math.round((count / data.statusTotal) * 100) : 0
                return (
                  <div key={key}>
                    <div className="flex items-center justify-between mb-1.5">
                      <div className="flex items-center gap-2">
                        <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: color }} />
                        <span className="text-xs font-medium text-gray-600">{label}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-semibold text-gray-800">{count}</span>
                        <span className="text-xs text-gray-400 w-8 text-right">{pct}%</span>
                      </div>
                    </div>
                    <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
                      <div
                        className="h-full rounded-full transition-all duration-500"
                        style={{ width: `${pct}%`, backgroundColor: color }}
                      />
                    </div>
                  </div>
                )
              })}
            </div>
          )}

          <div className="mt-5 pt-4 border-t border-gray-100 flex items-center justify-between">
            <p className="text-xs text-gray-400">Total enregistrés</p>
            <p className="text-sm font-semibold text-gray-900">{data.statusTotal}</p>
          </div>
        </div>
      </div>
    </div>
  )
}
