import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { Wrench, AlertCircle, AlertTriangle } from 'lucide-react'

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

const STATUS_BADGE: Record<string, string> = {
  nouveau:  'bg-blue-50 text-blue-700',
  assigné:  'bg-purple-50 text-purple-700',
  en_cours: 'bg-amber-50 text-amber-700',
}
const STATUS_LABEL: Record<string, string> = {
  nouveau: 'Nouveau', assigné: 'Assigné', en_cours: 'En cours',
}

export default async function TechPlanningPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const now   = new Date()
  const in14  = new Date(now)
  in14.setDate(now.getDate() + 14)
  const in14Str = in14.toISOString().split('T')[0]

  const [{ data: rawVisits }, { data: incidents }] = await Promise.all([
    supabase
      .from('maintenance_visits')
      .select(`
        id, scheduled_date, status,
        maintenance_plans (
          contracts (
            lieu_installation,
            clients  ( nom_client ),
            machines ( numero_serie, marque, modele )
          )
        )
      `)
      .in('status', ['planifié', 'en_retard'])
      .order('scheduled_date')
      .limit(30),
    supabase
      .from('incidents')
      .select('id, title, status, priority, machine_id, created_at')
      .eq('assigned_to', user.id)
      .not('status', 'in', '("résolu","fermé")')
      .order('created_at', { ascending: false }),
  ])

  const visits = (rawVisits ?? []).filter(v =>
    v.status === 'en_retard' || v.scheduled_date <= in14Str
  )

  const overdueVisits  = visits.filter(v => v.status === 'en_retard')
  const plannedVisits  = visits.filter(v => v.status === 'planifié')

  return (
    <div className="p-4 space-y-6 pt-5">

      <div>
        <h1 className="text-lg font-semibold text-gray-900" style={{ fontFamily: 'Poppins, sans-serif' }}>
          Planning
        </h1>
        <p className="text-xs text-gray-400 mt-0.5">
          {now.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' })}
        </p>
      </div>

      {/* ── MAINTENANCES EN RETARD ── */}
      {overdueVisits.length > 0 && (
        <section className="space-y-2">
          <div className="flex items-center gap-2">
            <AlertTriangle size={14} className="text-red-500" />
            <p className="text-sm font-semibold text-red-600">En retard ({overdueVisits.length})</p>
          </div>
          {overdueVisits.map(v => {
            const plan     = v.maintenance_plans as any
            const contract = plan?.contracts as any
            const machine  = contract?.machines as any
            const { label } = fmtDate(v.scheduled_date)
            const serie = machine?.numero_serie as string | undefined
            return (
              <Link
                key={v.id}
                href={serie ? `/tech/scan/${encodeURIComponent(serie)}` : '/tech'}
                className="flex items-start gap-3 bg-white rounded-2xl border-2 border-red-200 p-4"
              >
                <div className="w-9 h-9 rounded-xl bg-red-50 flex items-center justify-center shrink-0">
                  <Wrench size={16} className="text-red-500" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold text-gray-900 truncate">
                    {contract?.clients?.nom_client ?? '—'}
                  </p>
                  <p className="text-xs text-gray-500 truncate">
                    {machine?.marque} {machine?.modele}
                  </p>
                  {contract?.lieu_installation && (
                    <p className="text-xs text-gray-400 truncate mt-0.5">{contract.lieu_installation}</p>
                  )}
                </div>
                <span className="shrink-0 text-xs font-semibold text-red-500 whitespace-nowrap">{label}</span>
              </Link>
            )
          })}
        </section>
      )}

      {/* ── MAINTENANCES PLANIFIÉES ── */}
      <section className="space-y-2">
        <div className="flex items-center gap-2">
          <Wrench size={14} className="text-gray-400" />
          <p className="text-sm font-semibold text-gray-700">
            Maintenance — 14 prochains jours
            {plannedVisits.length > 0 && (
              <span className="ml-2 text-xs font-normal text-gray-400">({plannedVisits.length})</span>
            )}
          </p>
        </div>

        {plannedVisits.length === 0 ? (
          <div className="bg-white rounded-2xl border border-gray-200 p-6 text-center">
            <p className="text-sm text-gray-400">Aucune visite planifiée dans 14 jours</p>
          </div>
        ) : (
          plannedVisits.map(v => {
            const plan     = v.maintenance_plans as any
            const contract = plan?.contracts as any
            const machine  = contract?.machines as any
            const { label, isOverdue } = fmtDate(v.scheduled_date)
            const serie = machine?.numero_serie as string | undefined
            return (
              <Link
                key={v.id}
                href={serie ? `/tech/scan/${encodeURIComponent(serie)}` : '/tech'}
                className="flex items-start gap-3 bg-white rounded-2xl border border-gray-200 p-4"
              >
                <div className="w-9 h-9 rounded-xl bg-blue-50 flex items-center justify-center shrink-0">
                  <Wrench size={16} className="text-blue-500" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold text-gray-900 truncate">
                    {contract?.clients?.nom_client ?? '—'}
                  </p>
                  <p className="text-xs text-gray-500 truncate">
                    {machine?.marque} {machine?.modele}
                  </p>
                  {contract?.lieu_installation && (
                    <p className="text-xs text-gray-400 truncate mt-0.5">{contract.lieu_installation}</p>
                  )}
                </div>
                <span className={`shrink-0 text-xs font-semibold whitespace-nowrap ${isOverdue ? 'text-red-500' : 'text-blue-500'}`}>
                  {label}
                </span>
              </Link>
            )
          })
        )}
      </section>

      {/* ── MES INTERVENTIONS ── */}
      <section className="space-y-2">
        <div className="flex items-center gap-2">
          <AlertCircle size={14} className="text-gray-400" />
          <p className="text-sm font-semibold text-gray-700">
            Mes interventions
            {(incidents?.length ?? 0) > 0 && (
              <span className="ml-2 text-xs font-normal text-gray-400">({incidents!.length})</span>
            )}
          </p>
        </div>

        {(!incidents || incidents.length === 0) ? (
          <div className="bg-white rounded-2xl border border-gray-200 p-6 text-center">
            <p className="text-sm text-gray-400">Aucune intervention assignée</p>
          </div>
        ) : (
          incidents.map(inc => (
            <Link
              key={inc.id}
              href={`/tech/incidents/${inc.id}`}
              className="flex items-start gap-3 bg-white rounded-2xl border border-gray-200 p-4"
            >
              <div className="w-9 h-9 rounded-xl bg-gray-100 flex items-center justify-center shrink-0">
                <AlertCircle size={16} className="text-gray-500" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold text-gray-900 truncate">{inc.title}</p>
                <p className="font-mono text-xs text-gray-400 mt-0.5">{inc.machine_id}</p>
                <p className="text-xs text-gray-400">
                  {new Date(inc.created_at).toLocaleDateString('fr-FR')}
                </p>
              </div>
              <span className={`shrink-0 inline-flex px-2 py-0.5 rounded text-xs font-medium ${STATUS_BADGE[inc.status] ?? 'bg-gray-100 text-gray-500'}`}>
                {STATUS_LABEL[inc.status] ?? inc.status}
              </span>
            </Link>
          ))
        )}
      </section>

    </div>
  )
}
