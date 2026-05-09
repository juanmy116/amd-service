import { createClient } from '@/lib/supabase/server'
import { Users, Printer, FileText, AlertCircle } from 'lucide-react'

async function getStats() {
  const supabase = await createClient()

  const [clients, machines, contracts, incidents] = await Promise.all([
    supabase.from('clients').select('*', { count: 'exact', head: true }).eq('active', true),
    supabase.from('machines').select('*', { count: 'exact', head: true }).eq('active', true),
    supabase.from('contracts').select('*', { count: 'exact', head: true }).eq('statut', 'actif'),
    supabase.from('incidents').select('*', { count: 'exact', head: true }).neq('status', 'fermé'),
  ])

  return {
    clients:   clients.count   ?? 0,
    machines:  machines.count  ?? 0,
    contracts: contracts.count ?? 0,
    incidents: incidents.count ?? 0,
  }
}

async function getRecentIncidents() {
  const supabase = await createClient()
  const { data } = await supabase
    .from('incidents')
    .select('id, title, status, priority, created_at, machine_id')
    .order('created_at', { ascending: false })
    .limit(5)
  return data ?? []
}

const STATUS_LABELS: Record<string, { label: string; color: string }> = {
  'nouveau':  { label: 'Nouveau',    color: 'bg-blue-100 text-blue-700' },
  'assigné':  { label: 'Assigné',    color: 'bg-yellow-100 text-yellow-700' },
  'en_cours': { label: 'En cours',   color: 'bg-orange-100 text-orange-700' },
  'résolu':   { label: 'Résolu',     color: 'bg-green-100 text-green-700' },
  'fermé':    { label: 'Fermé',      color: 'bg-gray-100 text-gray-600' },
}

const PRIORITY_LABELS: Record<string, { label: string; color: string }> = {
  'basse':    { label: 'Basse',    color: 'bg-gray-100 text-gray-600' },
  'normale':  { label: 'Normale',  color: 'bg-blue-100 text-blue-700' },
  'haute':    { label: 'Haute',    color: 'bg-orange-100 text-orange-700' },
  'urgente':  { label: 'Urgente',  color: 'bg-red-100 text-red-700' },
}

export default async function Dashboard() {
  const [stats, incidents] = await Promise.all([getStats(), getRecentIncidents()])

  const CARDS = [
    { label: 'Clients actifs',    value: stats.clients,   icon: Users,        accent: '#3B82F6' },
    { label: 'Machines actives',  value: stats.machines,  icon: Printer,      accent: '#10B981' },
    { label: 'Contrats actifs',   value: stats.contracts, icon: FileText,     accent: '#8B5CF6' },
    { label: 'Incidents ouverts', value: stats.incidents, icon: AlertCircle,  accent: '#BF0D0D' },
  ]

  return (
    <div className="p-8">

      {/* Header */}
      <div className="mb-8">
        <h1 className="text-2xl font-semibold text-gray-900" style={{ fontFamily: 'Poppins, sans-serif' }}>
          Tableau de bord
        </h1>
        <p className="text-sm text-gray-500 mt-1">Vue d'ensemble du parc AMD Service</p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-4 gap-5 mb-8">
        {CARDS.map(({ label, value, icon: Icon, accent }) => (
          <div key={label} className="bg-white rounded-xl border border-gray-200 p-5">
            <div className="flex items-center justify-between mb-4">
              <p className="text-sm font-medium text-gray-500">{label}</p>
              <div className="w-9 h-9 rounded-lg flex items-center justify-center" style={{ backgroundColor: `${accent}18` }}>
                <Icon size={18} style={{ color: accent }} />
              </div>
            </div>
            <p className="text-3xl font-bold text-gray-900" style={{ fontFamily: 'Poppins, sans-serif' }}>
              {value}
            </p>
          </div>
        ))}
      </div>

      {/* Incidents récents */}
      <div className="bg-white rounded-xl border border-gray-200">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200">
          <h2 className="text-sm font-semibold text-gray-900">Incidents récents</h2>
        </div>

        {incidents.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <AlertCircle size={32} className="text-gray-300 mb-3" />
            <p className="text-sm font-medium text-gray-500">Aucun incident pour le moment</p>
            <p className="text-xs text-gray-400 mt-1">Les incidents apparaîtront ici dès leur création</p>
          </div>
        ) : (
          <table className="w-full">
            <thead>
              <tr className="border-b border-gray-100">
                <th className="text-left text-xs font-medium text-gray-400 px-6 py-3">Titre</th>
                <th className="text-left text-xs font-medium text-gray-400 px-6 py-3">Machine</th>
                <th className="text-left text-xs font-medium text-gray-400 px-6 py-3">Priorité</th>
                <th className="text-left text-xs font-medium text-gray-400 px-6 py-3">Statut</th>
                <th className="text-left text-xs font-medium text-gray-400 px-6 py-3">Date</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {incidents.map((inc) => {
                const status   = STATUS_LABELS[inc.status]   ?? { label: inc.status,   color: 'bg-gray-100 text-gray-600' }
                const priority = PRIORITY_LABELS[inc.priority] ?? { label: inc.priority, color: 'bg-gray-100 text-gray-600' }
                return (
                  <tr key={inc.id} className="hover:bg-gray-50 transition-colors">
                    <td className="px-6 py-4 text-sm text-gray-900">{inc.title}</td>
                    <td className="px-6 py-4 text-sm text-gray-500 font-mono">{inc.machine_id}</td>
                    <td className="px-6 py-4">
                      <span className={`inline-flex text-xs font-medium px-2 py-0.5 rounded-full ${priority.color}`}>
                        {priority.label}
                      </span>
                    </td>
                    <td className="px-6 py-4">
                      <span className={`inline-flex text-xs font-medium px-2 py-0.5 rounded-full ${status.color}`}>
                        {status.label}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-400">
                      {new Date(inc.created_at).toLocaleDateString('fr-FR')}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}
