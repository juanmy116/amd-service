import { createClient } from '@/lib/supabase/server'
import Link from 'next/link'
import { Plus, Clock, AlertTriangle, Wrench } from 'lucide-react'

const FREQ_LABEL: Record<string, string> = {
  mensuel:      'Mensuel',
  trimestriel:  'Trimestriel',
}

const STATUS_CFG = {
  fait:      { label: 'Fait',       class: 'bg-green-50 text-green-700' },
  planifié:  { label: 'Planifié',   class: 'bg-blue-50 text-blue-700'  },
  en_retard: { label: 'En retard',  class: 'bg-red-50 text-red-700'    },
}

export default async function MaintenancePage() {
  const supabase = await createClient()

  const { data: plans } = await supabase
    .from('maintenance_plans')
    .select(`
      id, frequency, active, notes,
      contracts (
        id, numero_contrat,
        clients   ( nom_client ),
        machines  ( numero_serie, marque, modele )
      ),
      maintenance_visits (
        id, scheduled_date, status, done_at
      )
    `)
    .order('created_at', { ascending: false })

  const rows = (plans ?? []).map(p => {
    const contract = p.contracts as unknown as {
      id: string; numero_contrat: string
      clients:  { nom_client: string }
      machines: { numero_serie: string; marque: string; modele: string }
    }
    const visits = (p.maintenance_visits ?? []) as {
      id: string; scheduled_date: string; status: string; done_at: string | null
    }[]
    const nextVisit = visits
      .filter(v => v.status === 'planifié')
      .sort((a, b) => a.scheduled_date.localeCompare(b.scheduled_date))[0] ?? null
    const lastDone = visits
      .filter(v => v.status === 'fait')
      .sort((a, b) => b.scheduled_date.localeCompare(a.scheduled_date))[0] ?? null
    return { plan: p, contract, visits, nextVisit, lastDone }
  })

  const totalPlans    = rows.length
  const overdue       = rows.filter(r => r.visits.some(v => v.status === 'en_retard')).length
  const dueThisWeek   = rows.filter(r => {
    if (!r.nextVisit) return false
    const diff = (new Date(r.nextVisit.scheduled_date).getTime() - Date.now()) / 86400000
    return diff >= 0 && diff <= 7
  }).length

  return (
    <div className="p-8 space-y-6">

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900" style={{ fontFamily: 'Poppins, sans-serif' }}>
            Maintenance préventive
          </h1>
          <p className="text-sm text-gray-400 mt-0.5">
            {totalPlans} plan{totalPlans !== 1 ? 's' : ''} actif{totalPlans !== 1 ? 's' : ''}
            {overdue > 0 && <span className="ml-2 text-red-500 font-medium">· {overdue} en retard</span>}
            {dueThisWeek > 0 && <span className="ml-2 text-amber-500 font-medium">· {dueThisWeek} cette semaine</span>}
          </p>
        </div>
        <Link
          href="/admin/maintenance/new"
          className="flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium text-white"
          style={{ backgroundColor: '#BF0D0D' }}
        >
          <Plus size={16} />
          Nouveau plan
        </Link>
      </div>

      {/* KPI strip */}
      <div className="grid grid-cols-3 gap-4">
        {[
          { label: 'Plans actifs',      value: totalPlans,  icon: Wrench,         color: 'text-gray-700' },
          { label: 'En retard',         value: overdue,     icon: AlertTriangle,  color: 'text-red-600'  },
          { label: 'À faire cette sem.', value: dueThisWeek, icon: Clock,         color: 'text-amber-600'},
        ].map(({ label, value, icon: Icon, color }) => (
          <div key={label} className="bg-white rounded-xl border border-gray-200 p-4 flex items-center gap-3">
            <Icon size={18} className={`${color} shrink-0`} />
            <div>
              <p className="text-xs text-gray-400">{label}</p>
              <p className={`text-xl font-semibold ${color}`}>{value}</p>
            </div>
          </div>
        ))}
      </div>

      {/* Lista */}
      {rows.length === 0 ? (
        <div className="bg-white rounded-xl border border-gray-200 flex items-center justify-center py-20">
          <p className="text-sm text-gray-400">Aucun plan de maintenance enregistré</p>
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100 bg-gray-50">
                <th className="text-left px-5 py-3 text-xs font-medium text-gray-500">Client / Machine</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-gray-500">Contrat</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-gray-500">Fréquence</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-gray-500">Prochaine visite</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-gray-500">Dernière faite</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-gray-500">Statut</th>
                <th />
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {rows.map(({ plan, contract, nextVisit, lastDone }) => {
                const overdue = nextVisit?.status === 'en_retard'
                const statusKey = nextVisit?.status ?? 'planifié'
                const cfg = STATUS_CFG[statusKey as keyof typeof STATUS_CFG] ?? STATUS_CFG.planifié
                return (
                  <tr key={plan.id} className="hover:bg-gray-50">
                    <td className="px-5 py-3.5">
                      <p className="font-medium text-gray-900">{contract.clients.nom_client}</p>
                      <p className="text-xs text-gray-400 font-mono mt-0.5">
                        {contract.machines.marque} {contract.machines.modele}
                      </p>
                    </td>
                    <td className="px-4 py-3.5 font-mono text-xs text-gray-500">
                      {contract.numero_contrat}
                    </td>
                    <td className="px-4 py-3.5 text-gray-700">
                      {FREQ_LABEL[plan.frequency]}
                    </td>
                    <td className="px-4 py-3.5">
                      {nextVisit ? (
                        <span className={overdue ? 'text-red-600 font-semibold' : 'text-gray-700'}>
                          {new Date(nextVisit.scheduled_date).toLocaleDateString('fr-FR')}
                        </span>
                      ) : (
                        <span className="text-gray-300">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3.5 text-gray-500">
                      {lastDone
                        ? new Date(lastDone.scheduled_date).toLocaleDateString('fr-FR')
                        : <span className="text-gray-300">—</span>
                      }
                    </td>
                    <td className="px-4 py-3.5">
                      {nextVisit && (
                        <span className={`inline-flex px-2 py-0.5 rounded text-xs font-medium ${cfg.class}`}>
                          {cfg.label}
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3.5 text-right">
                      <Link
                        href={`/admin/maintenance/${plan.id}`}
                        className="text-xs font-medium text-gray-500 hover:text-gray-900"
                      >
                        Détail →
                      </Link>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
