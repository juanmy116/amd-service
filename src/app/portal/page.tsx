import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { Printer, AlertCircle, CheckCircle, Clock } from 'lucide-react'

const STATUS_STYLE: Record<string, string> = {
  nouveau:  'bg-blue-50 text-blue-700',
  assigné:  'bg-purple-50 text-purple-700',
  en_cours: 'bg-amber-50 text-amber-700',
  résolu:   'bg-green-50 text-green-700',
  fermé:    'bg-gray-100 text-gray-500',
}

const STATUS_LABEL: Record<string, string> = {
  nouveau: 'Nouveau', assigné: 'Assigné', en_cours: 'En cours', résolu: 'Résolu', fermé: 'Fermé',
}

export default async function PortalPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  // Check if verified
  const { data: clientProfile } = await supabase
    .from('client_profiles')
    .select('client_id, clients(nom_client)')
    .eq('profile_id', user.id)
    .single()

  if (!clientProfile) redirect('/portal/verify')

  const clientName = (clientProfile.clients as unknown as { nom_client: string } | null)?.nom_client ?? ''

  // Fetch machines + incidents in parallel
  const [{ data: contracts }, { data: incidents }] = await Promise.all([
    supabase
      .from('contracts')
      .select('id, numero_contrat, machine_id, lieu_installation, machines(marque, modele, type, localisation)')
      .eq('client_id', clientProfile.client_id)
      .eq('statut', 'actif'),
    supabase
      .from('incidents')
      .select('id, title, status, priority, created_at')
      .in('contract_id', (await supabase
        .from('contracts')
        .select('id')
        .eq('client_id', clientProfile.client_id)
        .then(r => r.data?.map(c => c.id) ?? []))
      )
      .order('created_at', { ascending: false })
      .limit(5),
  ])

  const openCount   = incidents?.filter(i => !['résolu', 'fermé'].includes(i.status)).length ?? 0
  const resolvedCount = incidents?.filter(i => ['résolu', 'fermé'].includes(i.status)).length ?? 0

  return (
    <div className="space-y-8">

      {/* Welcome */}
      <div>
        <h1 className="text-2xl font-semibold text-gray-900" style={{ fontFamily: 'Poppins, sans-serif' }}>
          Bonjour, {clientName}
        </h1>
        <p className="text-sm text-gray-500 mt-1">Voici l&apos;état de votre parc d&apos;impression.</p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-4">
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <div className="flex items-center gap-3 mb-2">
            <div className="w-8 h-8 rounded-lg bg-blue-50 flex items-center justify-center">
              <Printer size={16} className="text-blue-600" />
            </div>
            <span className="text-sm text-gray-500">Machines actives</span>
          </div>
          <p className="text-3xl font-semibold text-gray-900">{contracts?.length ?? 0}</p>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <div className="flex items-center gap-3 mb-2">
            <div className="w-8 h-8 rounded-lg bg-amber-50 flex items-center justify-center">
              <Clock size={16} className="text-amber-600" />
            </div>
            <span className="text-sm text-gray-500">Incidents ouverts</span>
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
      </div>

      {/* Machines */}
      <div>
        <h2 className="text-base font-semibold text-gray-900 mb-3">Mes machines</h2>
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-200 bg-gray-50">
                <th className="text-left px-5 py-3.5 font-medium text-gray-500">Machine</th>
                <th className="text-left px-5 py-3.5 font-medium text-gray-500">Type</th>
                <th className="text-left px-5 py-3.5 font-medium text-gray-500">Localisation</th>
                <th className="text-left px-5 py-3.5 font-medium text-gray-500">Contrat</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {(!contracts || contracts.length === 0) && (
                <tr><td colSpan={4} className="px-5 py-8 text-center text-gray-400">Aucune machine active</td></tr>
              )}
              {contracts?.map((c) => {
                const m = c.machines as unknown as { marque: string; modele: string; type: string; localisation: string | null } | null
                return (
                  <tr key={c.id} className="hover:bg-gray-50">
                    <td className="px-5 py-4 font-medium text-gray-900">{m ? `${m.marque} ${m.modele}` : c.machine_id}</td>
                    <td className="px-5 py-4">
                      <span className={`inline-flex px-2 py-0.5 rounded text-xs font-medium ${m?.type === 'color' ? 'bg-purple-50 text-purple-700' : 'bg-gray-100 text-gray-600'}`}>
                        {m?.type === 'color' ? 'Couleur' : 'N&B'}
                      </span>
                    </td>
                    <td className="px-5 py-4 text-gray-500">{m?.localisation ?? c.lieu_installation ?? '—'}</td>
                    <td className="px-5 py-4 font-mono text-xs text-gray-400">{c.numero_contrat}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Recent incidents */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-base font-semibold text-gray-900">Incidents récents</h2>
          <Link href="/portal/incidents" className="text-sm text-gray-500 hover:text-gray-900 underline underline-offset-2">
            Voir tout
          </Link>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          {(!incidents || incidents.length === 0) ? (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <AlertCircle size={32} className="text-gray-200 mb-3" />
              <p className="text-sm text-gray-400">Aucun incident signalé</p>
              <Link href="/portal/incidents/new" className="mt-3 text-sm font-medium underline underline-offset-2" style={{ color: '#BF0D0D' }}>
                Signaler un problème
              </Link>
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-200 bg-gray-50">
                  <th className="text-left px-5 py-3.5 font-medium text-gray-500">Titre</th>
                  <th className="text-left px-5 py-3.5 font-medium text-gray-500">Statut</th>
                  <th className="text-left px-5 py-3.5 font-medium text-gray-500">Date</th>
                  <th />
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {incidents.map((inc) => (
                  <tr key={inc.id} className="hover:bg-gray-50">
                    <td className="px-5 py-4 font-medium text-gray-900">{inc.title}</td>
                    <td className="px-5 py-4">
                      <span className={`inline-flex px-2 py-0.5 rounded text-xs font-medium ${STATUS_STYLE[inc.status] ?? 'bg-gray-100 text-gray-500'}`}>
                        {STATUS_LABEL[inc.status] ?? inc.status}
                      </span>
                    </td>
                    <td className="px-5 py-4 text-gray-400 text-xs">
                      {new Date(inc.created_at).toLocaleDateString('fr-FR')}
                    </td>
                    <td className="px-5 py-4 text-right">
                      <Link href={`/portal/incidents/${inc.id}`} className="text-xs text-gray-400 hover:text-gray-700 underline underline-offset-2">Voir</Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  )
}
