import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { signOut } from '@/app/login/actions'
import { QrCode, LogOut, Clock, CheckCircle, AlertCircle } from 'lucide-react'

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
  basse: 'bg-gray-100 text-gray-500', normale: 'bg-blue-50 text-blue-600',
  haute: 'bg-orange-50 text-orange-700', urgente: 'bg-red-50 text-red-700',
}
const PRIORITY_LABEL: Record<string, string> = {
  basse: 'Basse', normale: 'Normale', haute: 'Haute', urgente: 'Urgente',
}

export default async function TechPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('profiles')
    .select('full_name')
    .eq('id', user.id)
    .single()

  const { data: incidents } = await supabase
    .from('incidents')
    .select('id, title, status, priority, machine_id, created_at')
    .eq('assigned_to', user.id)
    .not('status', 'in', '("résolu","fermé")')
    .order('created_at', { ascending: false })

  const { data: allIncidents } = await supabase
    .from('incidents')
    .select('id, status')
    .eq('assigned_to', user.id)

  const openCount     = allIncidents?.filter(i => !['résolu', 'fermé'].includes(i.status)).length ?? 0
  const resolvedCount = allIncidents?.filter(i =>  ['résolu', 'fermé'].includes(i.status)).length ?? 0
  const firstName     = profile?.full_name?.split(' ')[0] ?? 'Technicien'

  return (
    <div className="p-4 lg:p-8 space-y-6">

      {/* Header móvil (logout) — oculto en desktop porque tiene sidebar */}
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

      {/* Stats — desktop only */}
      <div className="hidden lg:grid grid-cols-3 gap-4">
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <div className="flex items-center gap-3 mb-2">
            <div className="w-8 h-8 rounded-lg bg-amber-50 flex items-center justify-center">
              <Clock size={16} className="text-amber-600" />
            </div>
            <span className="text-sm text-gray-500">En cours</span>
          </div>
          <p className="text-3xl font-semibold text-gray-900">{openCount}</p>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <div className="flex items-center gap-3 mb-2">
            <div className="w-8 h-8 rounded-lg bg-green-50 flex items-center justify-center">
              <CheckCircle size={16} className="text-green-600" />
            </div>
            <span className="text-sm text-gray-500">Résolus</span>
          </div>
          <p className="text-3xl font-semibold text-gray-900">{resolvedCount}</p>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <div className="flex items-center gap-3 mb-2">
            <div className="w-8 h-8 rounded-lg bg-blue-50 flex items-center justify-center">
              <AlertCircle size={16} className="text-blue-600" />
            </div>
            <span className="text-sm text-gray-500">Total assignés</span>
          </div>
          <p className="text-3xl font-semibold text-gray-900">{allIncidents?.length ?? 0}</p>
        </div>
      </div>

      {/* Quick scan — mobile only */}
      <Link
        href="/tech/scan"
        className="flex lg:hidden items-center gap-4 p-4 rounded-2xl text-white"
        style={{ backgroundColor: '#BF0D0D' }}
      >
        <div className="w-12 h-12 rounded-xl bg-white/20 flex items-center justify-center shrink-0">
          <QrCode size={24} className="text-white" />
        </div>
        <div>
          <p className="font-semibold text-sm">Scanner une machine</p>
          <p className="text-xs text-white/70 mt-0.5">Pointer la caméra sur le QR code</p>
        </div>
      </Link>

      {/* Incidents */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-semibold text-gray-900 lg:text-base">
            Interventions en cours
          </h2>
          <span className="text-xs text-gray-400">{incidents?.length ?? 0} actives</span>
        </div>

        {/* Mobile: cards */}
        <div className="lg:hidden">
          {(!incidents || incidents.length === 0) ? (
            <div className="flex flex-col items-center justify-center py-12 text-center bg-white rounded-2xl border border-gray-200">
              <Clock size={32} className="text-gray-200 mb-3" />
              <p className="text-sm font-medium text-gray-500">Aucune intervention assignée</p>
            </div>
          ) : (
            <div className="space-y-3">
              {incidents.map((inc) => (
                <Link key={inc.id} href={`/tech/incidents/${inc.id}`} className="block bg-white rounded-2xl border border-gray-200 p-4">
                  <div className="flex items-start justify-between gap-3 mb-3">
                    <p className="text-sm font-semibold text-gray-900 leading-snug">{inc.title}</p>
                    <span className={`shrink-0 inline-flex px-2 py-0.5 rounded text-xs font-medium ${PRIORITY_STYLE[inc.priority] ?? ''}`}>
                      {PRIORITY_LABEL[inc.priority] ?? inc.priority}
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <p className="font-mono text-xs text-gray-400">{inc.machine_id}</p>
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
                <th className="text-left px-5 py-3.5 font-medium text-gray-500">Machine</th>
                <th className="text-left px-5 py-3.5 font-medium text-gray-500">Priorité</th>
                <th className="text-left px-5 py-3.5 font-medium text-gray-500">Statut</th>
                <th className="text-left px-5 py-3.5 font-medium text-gray-500">Date</th>
                <th />
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {(!incidents || incidents.length === 0) && (
                <tr><td colSpan={6} className="px-5 py-10 text-center text-gray-400">Aucune intervention en cours</td></tr>
              )}
              {incidents?.map((inc) => (
                <tr key={inc.id} className="hover:bg-gray-50 transition-colors">
                  <td className="px-5 py-4 font-medium text-gray-900">{inc.title}</td>
                  <td className="px-5 py-4 font-mono text-xs text-gray-500">{inc.machine_id}</td>
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
