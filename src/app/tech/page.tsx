import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { signOut } from '@/app/login/actions'
import { LogOut, Clock, CheckCircle, AlertCircle, Printer, ChevronRight } from 'lucide-react'

const STATUS_STYLE: Record<string, string> = {
  nouveau:  'bg-blue-50 text-blue-700',
  assigné:  'bg-purple-50 text-purple-700',
  en_cours: 'bg-amber-50 text-amber-700',
  résolu:   'bg-green-50 text-green-700',
}
const STATUS_LABEL: Record<string, string> = {
  nouveau: 'Nouveau', assigné: 'Assigné', en_cours: 'En cours', résolu: 'Résolu',
}
const PRIORITY_STYLE: Record<string, string> = {
  basse:   'bg-gray-100 text-gray-500',
  normale: 'bg-blue-50 text-blue-600',
  haute:   'bg-orange-50 text-orange-700',
  urgente: 'bg-red-50 text-red-700',
}
const PRIORITY_LABEL: Record<string, string> = {
  basse: 'Basse', normale: 'Normale', haute: 'Haute', urgente: 'Urgente',
}
const PRIORITY_RANK: Record<string, number> = {
  urgente: 0, haute: 1, normale: 2, basse: 3,
}

type HomeIncident = {
  id: string
  title: string
  status: string
  priority: string
  created_at: string
  clients: { nom_client: string } | null
}

export default async function TechPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const now = new Date()
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1)

  const [profileRes, incidentsRes] = await Promise.all([
    supabase.from('profiles').select('full_name').eq('id', user.id).single(),
    supabase
      .from('incidents')
      .select('id, title, status, priority, created_at, clients!client_id(nom_client)')
      .eq('assigned_to', user.id)
      .order('created_at', { ascending: false }),
  ])

  const incidents = (incidentsRes.data ?? []) as unknown as HomeIncident[]
  const firstName  = profileRes.data?.full_name?.split(' ')[0] ?? 'Technicien'

  const openCount          = incidents.filter(i => !['résolu', 'fermé'].includes(i.status)).length
  const urgentCount        = incidents.filter(i => i.priority === 'urgente' && !['résolu', 'fermé'].includes(i.status)).length
  const resolvedMonthCount = incidents.filter(i =>
    ['résolu', 'fermé'].includes(i.status) && i.created_at >= startOfMonth.toISOString()
  ).length
  const totalCount = incidents.length

  const nextIntervention = incidents
    .filter(i => !['résolu', 'fermé'].includes(i.status))
    .sort((a, b) => (PRIORITY_RANK[a.priority] ?? 4) - (PRIORITY_RANK[b.priority] ?? 4))[0] ?? null

  const activeIncidents = incidents.filter(i => !['résolu', 'fermé'].includes(i.status))

  return (
    <div className="p-4 lg:p-8 space-y-6">

      {/* Header móvil */}
      <div className="flex items-center justify-between pt-2 lg:hidden">
        <div>
          <p className="text-xs text-gray-400">Bonjour,</p>
          <h1 className="text-xl font-semibold text-gray-900" style={{ fontFamily: 'Poppins, sans-serif' }}>{firstName}</h1>
        </div>
        <form action={signOut}>
          <button type="submit" className="w-9 h-9 flex items-center justify-center rounded-xl border border-gray-200 bg-white text-gray-400">
            <LogOut size={16} />
          </button>
        </form>
      </div>

      {/* Header desktop */}
      <div className="hidden lg:block">
        <h1 className="text-2xl font-semibold text-gray-900" style={{ fontFamily: 'Poppins, sans-serif' }}>
          Bonjour, {firstName}
        </h1>
        <p className="text-sm text-gray-500 mt-1">Voici vos interventions en cours.</p>
      </div>

      {/* Stats 2×2 bento */}
      <div className="grid grid-cols-2 gap-3">
        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <div className="w-8 h-8 rounded-lg bg-amber-50 flex items-center justify-center mb-3">
            <Clock size={16} className="text-amber-600" />
          </div>
          <p className="text-2xl font-semibold text-gray-900">{openCount}</p>
          <p className="text-xs text-gray-500 mt-0.5">En cours</p>
        </div>
        <div className={`rounded-xl border p-4 ${urgentCount > 0 ? 'bg-red-50 border-red-100' : 'bg-white border-gray-200'}`}>
          <div className={`w-8 h-8 rounded-lg flex items-center justify-center mb-3 ${urgentCount > 0 ? 'bg-red-100' : 'bg-gray-100'}`}>
            <AlertCircle size={16} className={urgentCount > 0 ? 'text-red-600' : 'text-gray-400'} />
          </div>
          <p className={`text-2xl font-semibold ${urgentCount > 0 ? 'text-red-700' : 'text-gray-900'}`}>{urgentCount}</p>
          <p className={`text-xs mt-0.5 ${urgentCount > 0 ? 'text-red-500' : 'text-gray-500'}`}>Urgents</p>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <div className="w-8 h-8 rounded-lg bg-green-50 flex items-center justify-center mb-3">
            <CheckCircle size={16} className="text-green-600" />
          </div>
          <p className="text-2xl font-semibold text-gray-900">{resolvedMonthCount}</p>
          <p className="text-xs text-gray-500 mt-0.5">Résolus ce mois</p>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <div className="w-8 h-8 rounded-lg bg-blue-50 flex items-center justify-center mb-3">
            <Printer size={16} className="text-blue-600" />
          </div>
          <p className="text-2xl font-semibold text-gray-900">{totalCount}</p>
          <p className="text-xs text-gray-500 mt-0.5">Total assignés</p>
        </div>
      </div>

      {/* Prochaine intervention */}
      {nextIntervention && (
        <Link
          href={`/tech/incidents/${nextIntervention.id}`}
          className="block bg-white rounded-xl border border-gray-200 p-4"
        >
          <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">
            Prochaine intervention
          </h2>
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold text-gray-900 truncate">
                {nextIntervention.clients?.nom_client ?? '—'}
              </p>
              <p className="text-xs text-gray-500 mt-0.5 truncate">{nextIntervention.title}</p>
              <span className={`inline-flex mt-2 px-2 py-0.5 rounded text-xs font-medium ${PRIORITY_STYLE[nextIntervention.priority] ?? ''}`}>
                {PRIORITY_LABEL[nextIntervention.priority] ?? nextIntervention.priority}
              </span>
            </div>
            <ChevronRight size={18} className="text-gray-400 shrink-0" />
          </div>
        </Link>
      )}

      {/* Interventions actives */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-semibold text-gray-900 lg:text-base">
            Interventions en cours
          </h2>
          <span className="text-xs text-gray-400">{activeIncidents.length} actives</span>
        </div>

        {/* Mobile: cards */}
        <div className="lg:hidden">
          {activeIncidents.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-center bg-white rounded-2xl border border-gray-200">
              <Clock size={32} className="text-gray-200 mb-3" />
              <p className="text-sm font-medium text-gray-500">Aucune intervention assignée</p>
            </div>
          ) : (
            <div className="space-y-3">
              {activeIncidents.map((inc) => (
                <Link key={inc.id} href={`/tech/incidents/${inc.id}`} className="block bg-white rounded-2xl border border-gray-200 p-4">
                  <div className="flex items-start justify-between gap-3 mb-3">
                    <p className="text-sm font-semibold text-gray-900 leading-snug">{inc.title}</p>
                    <span className={`shrink-0 inline-flex px-2 py-0.5 rounded text-xs font-medium ${PRIORITY_STYLE[inc.priority] ?? ''}`}>
                      {PRIORITY_LABEL[inc.priority] ?? inc.priority}
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <p className="text-xs text-gray-400">{inc.clients?.nom_client ?? '—'}</p>
                    <span className={`inline-flex px-2 py-0.5 rounded text-xs font-medium ${STATUS_STYLE[inc.status] ?? ''}`}>
                      {STATUS_LABEL[inc.status] ?? inc.status}
                    </span>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </div>

        {/* Desktop: table */}
        <div className="hidden lg:block bg-white rounded-xl border border-gray-200 overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-200 bg-gray-50">
                <th className="text-left px-5 py-3.5 font-medium text-gray-500">Titre</th>
                <th className="text-left px-5 py-3.5 font-medium text-gray-500">Client</th>
                <th className="text-left px-5 py-3.5 font-medium text-gray-500">Priorité</th>
                <th className="text-left px-5 py-3.5 font-medium text-gray-500">Statut</th>
                <th className="text-left px-5 py-3.5 font-medium text-gray-500">Date</th>
                <th />
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {activeIncidents.length === 0 && (
                <tr><td colSpan={6} className="px-5 py-10 text-center text-gray-400">Aucune intervention en cours</td></tr>
              )}
              {activeIncidents.map((inc) => (
                <tr key={inc.id} className="hover:bg-gray-50 transition-colors">
                  <td className="px-5 py-4 font-medium text-gray-900">{inc.title}</td>
                  <td className="px-5 py-4 text-gray-500 text-xs">{inc.clients?.nom_client ?? '—'}</td>
                  <td className="px-5 py-4">
                    <span className={`inline-flex px-2 py-0.5 rounded text-xs font-medium ${PRIORITY_STYLE[inc.priority] ?? ''}`}>
                      {PRIORITY_LABEL[inc.priority] ?? inc.priority}
                    </span>
                  </td>
                  <td className="px-5 py-4">
                    <span className={`inline-flex px-2 py-0.5 rounded text-xs font-medium ${STATUS_STYLE[inc.status] ?? ''}`}>
                      {STATUS_LABEL[inc.status] ?? inc.status}
                    </span>
                  </td>
                  <td className="px-5 py-4 text-gray-400 text-xs">{new Date(inc.created_at).toLocaleDateString('fr-FR')}</td>
                  <td className="px-5 py-4 text-right">
                    <Link href={`/tech/incidents/${inc.id}`} className="text-sm font-medium text-gray-600 hover:text-gray-900 underline underline-offset-2">
                      Voir
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
