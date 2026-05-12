import { createClient } from '@/lib/supabase/server'
import Link from 'next/link'
import { Wrench, AlertCircle, BarChart2, AlertTriangle, Clock } from 'lucide-react'

function fmtDate(dateStr: string): { label: string; isOverdue: boolean } {
  const d = new Date(dateStr + 'T00:00:00')
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const diff = Math.round((d.getTime() - today.getTime()) / 86400000)
  if (diff < 0)  return { label: `${Math.abs(diff)}j de retard`, isOverdue: true }
  if (diff === 0) return { label: "Aujourd'hui", isOverdue: false }
  if (diff === 1) return { label: 'Demain', isOverdue: false }
  return { label: d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' }), isOverdue: false }
}

const PRIORITY_ICON_COLOR: Record<string, string> = {
  critique: 'text-red-500',
  haute:    'text-orange-400',
  normale:  'text-gray-300',
  basse:    'text-gray-200',
}

const STATUS_BADGE: Record<string, string> = {
  nouveau:  'bg-blue-50 text-blue-700',
  assigné:  'bg-purple-50 text-purple-700',
  en_cours: 'bg-amber-50 text-amber-700',
}

const STATUS_LABEL: Record<string, string> = {
  nouveau: 'Nouveau', assigné: 'Assigné', en_cours: 'En cours',
}

export default async function AdminAgendaPanel() {
  const supabase = await createClient()

  const now    = new Date()
  const in14   = new Date(now)
  in14.setDate(now.getDate() + 14)
  const in14Str = in14.toISOString().split('T')[0]
  const cYear  = now.getFullYear()
  const cMonth = now.getMonth() + 1

  const [
    { data: rawVisits },
    { data: incidents },
    { data: activeMachines },
    { data: currentCounters },
  ] = await Promise.all([
    supabase
      .from('maintenance_visits')
      .select(`
        id, scheduled_date, status,
        maintenance_plans (
          contracts (
            clients  ( nom_client ),
            machines ( marque, modele )
          )
        )
      `)
      .in('status', ['planifié', 'en_retard'])
      .order('scheduled_date')
      .limit(20),
    supabase
      .from('incidents')
      .select('id, title, status, priority')
      .not('status', 'in', '("résolu","fermé")')
      .order('created_at', { ascending: false })
      .limit(8),
    supabase
      .from('machines')
      .select('numero_serie')
      .eq('active', true),
    supabase
      .from('machine_counters')
      .select('machine_id')
      .eq('year', cYear)
      .eq('month', cMonth)
      .eq('status', 'actif'),
  ])

  const visits = (rawVisits ?? []).filter(v =>
    v.status === 'en_retard' || v.scheduled_date <= in14Str
  )

  const coveredSerials  = new Set((currentCounters ?? []).map(c => c.machine_id))
  const pendingCounters = (activeMachines ?? []).filter(m => !coveredSerials.has(m.numero_serie)).length

  return (
    <aside className="flex flex-col h-full bg-white border-l border-gray-200 overflow-y-auto">

      {/* Header */}
      <div className="px-4 py-5 border-b border-gray-100 sticky top-0 bg-white z-10">
        <h2 className="text-sm font-semibold text-gray-900" style={{ fontFamily: 'Poppins, sans-serif' }}>
          Agenda
        </h2>
        <p className="text-xs text-gray-400 mt-0.5">
          {now.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' })}
        </p>
      </div>

      <div className="px-4 py-4 space-y-5">

        {/* ── MAINTENANCE ── */}
        <section>
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-1.5">
              <Wrench size={13} className="text-gray-400" />
              <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Maintenance</span>
            </div>
            {visits.length > 0 && (
              <Link href="/admin/maintenance" className="text-xs text-gray-400 hover:text-gray-600 transition-colors">
                Voir tout →
              </Link>
            )}
          </div>

          {visits.length === 0 ? (
            <p className="text-xs text-gray-300 py-1">Aucune visite dans 14 jours</p>
          ) : (
            <div className="space-y-0.5">
              {visits.slice(0, 6).map(v => {
                const plan     = v.maintenance_plans as any
                const contract = plan?.contracts as any
                const { label, isOverdue } = fmtDate(v.scheduled_date)
                return (
                  <Link
                    key={v.id}
                    href="/admin/maintenance"
                    className="flex items-start gap-2.5 px-2.5 py-2 rounded-lg hover:bg-gray-50 transition-colors"
                  >
                    <div className={`mt-1 w-1.5 h-1.5 rounded-full shrink-0 ${isOverdue ? 'bg-red-500' : 'bg-blue-400'}`} />
                    <div className="min-w-0 flex-1">
                      <p className="text-xs font-medium text-gray-800 truncate leading-tight">
                        {contract?.clients?.nom_client ?? '—'}
                      </p>
                      <p className="text-[11px] text-gray-400 truncate">
                        {contract?.machines?.marque} {contract?.machines?.modele}
                      </p>
                    </div>
                    <span className={`shrink-0 text-[11px] font-medium whitespace-nowrap ${isOverdue ? 'text-red-500' : 'text-gray-400'}`}>
                      {label}
                    </span>
                  </Link>
                )
              })}
            </div>
          )}
        </section>

        <div className="border-t border-gray-100" />

        {/* ── INCIDENTS SAV ── */}
        <section>
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-1.5">
              <AlertCircle size={13} className="text-gray-400" />
              <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Incidents SAV</span>
            </div>
            {(incidents?.length ?? 0) > 0 && (
              <Link href="/admin/incidents" className="text-xs text-gray-400 hover:text-gray-600 transition-colors">
                Voir tout →
              </Link>
            )}
          </div>

          {(!incidents || incidents.length === 0) ? (
            <p className="text-xs text-gray-300 py-1">Aucun incident ouvert</p>
          ) : (
            <div className="space-y-0.5">
              {incidents.map(inc => (
                <Link
                  key={inc.id}
                  href={`/admin/incidents/${inc.id}`}
                  className="flex items-start gap-2.5 px-2.5 py-2 rounded-lg hover:bg-gray-50 transition-colors"
                >
                  <AlertTriangle
                    size={12}
                    className={`mt-0.5 shrink-0 ${PRIORITY_ICON_COLOR[inc.priority] ?? 'text-gray-300'}`}
                  />
                  <p className="min-w-0 flex-1 text-xs font-medium text-gray-800 truncate leading-tight">
                    {inc.title}
                  </p>
                  <span className={`shrink-0 inline-flex px-1.5 py-0.5 rounded text-[10px] font-medium ${STATUS_BADGE[inc.status] ?? 'bg-gray-100 text-gray-500'}`}>
                    {STATUS_LABEL[inc.status] ?? inc.status}
                  </span>
                </Link>
              ))}
            </div>
          )}
        </section>

        <div className="border-t border-gray-100" />

        {/* ── COMPTEURS ── */}
        <section>
          <div className="flex items-center gap-1.5 mb-2">
            <BarChart2 size={13} className="text-gray-400" />
            <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Compteurs</span>
          </div>

          <Link
            href="/admin/contadores"
            className="flex items-center justify-between px-3 py-2.5 rounded-lg bg-gray-50 hover:bg-gray-100 transition-colors"
          >
            <span className="text-xs text-gray-700">
              {pendingCounters === 0
                ? '✓ Tous à jour'
                : `${pendingCounters} relevé${pendingCounters > 1 ? 's' : ''} manquant${pendingCounters > 1 ? 's' : ''}`
              }
            </span>
            {pendingCounters > 0 && (
              <span className="flex items-center gap-1 text-amber-500">
                <Clock size={12} />
                <span className="text-[11px] font-semibold">À faire</span>
              </span>
            )}
          </Link>
        </section>

      </div>
    </aside>
  )
}
