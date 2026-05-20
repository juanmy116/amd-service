import { createClient } from '@/lib/supabase/server'
import Link from 'next/link'
import { Plus, Clock, AlertTriangle, Wrench } from 'lucide-react'
import SearchFilters from '@/components/admin/SearchFilters'
import {
  sanitizeSearchQuery,
  buildIlikePattern,
  firstParam,
} from '@/lib/search'
import { parseEnum, MAINTENANCE_FREQUENCIES, VISIT_STATUSES } from '@/lib/enums'

const RESULT_LIMIT = 300
// Límite holgado para lookups intermedios que alimentan filtros: si truncaran,
// el filtro de búsqueda devolvería resultados incompletos sin avisar.
const LOOKUP_LIMIT = 1000

const FREQ_LABEL: Record<string, string> = {
  mensuel:     'Mensuel',
  trimestriel: 'Trimestriel',
}

const STATUS_CFG = {
  fait:      { label: 'Fait',       class: 'bg-green-50 text-green-700' },
  planifié:  { label: 'Planifié',   class: 'bg-blue-50 text-blue-700'  },
  en_retard: { label: 'En retard',  class: 'bg-red-50 text-red-700'    },
}

type SearchParams = Promise<{ [key: string]: string | string[] | undefined }>

export default async function MaintenancePage({ searchParams }: { searchParams: SearchParams }) {
  const sp = await searchParams
  const q = sanitizeSearchQuery(firstParam(sp.q))
  const frequencyFilter = parseEnum(firstParam(sp.frequency), MAINTENANCE_FREQUENCIES)
  const statusFilter = parseEnum(firstParam(sp.status), VISIT_STATUSES)

  const supabase = await createClient()

  // 1. Si hay búsqueda: resolver contratos que matchean (nº contrato o nombre cliente).
  let contractIdFilter: string[] | null = null
  if (q) {
    const pattern = buildIlikePattern(q)
    const [{ data: matchedClients }, { data: matchedContracts }] = await Promise.all([
      supabase
        .from('clients')
        .select('id')
        .ilike('nom_client', pattern)
        .limit(LOOKUP_LIMIT),
      supabase
        .from('contracts')
        .select('id')
        .ilike('numero_contrat', pattern)
        .limit(LOOKUP_LIMIT),
    ])
    const clientIds = (matchedClients ?? []).map((c) => c.id).filter((id): id is number => typeof id === 'number')
    const contractIdsFromNumero = (matchedContracts ?? []).map((c) => c.id).filter((id): id is string => typeof id === 'string')

    let contractIdsFromClients: string[] = []
    if (clientIds.length > 0) {
      const { data } = await supabase
        .from('contracts')
        .select('id')
        .in('client_id', clientIds)
        .limit(LOOKUP_LIMIT)
      contractIdsFromClients = (data ?? []).map((c) => c.id).filter((id): id is string => typeof id === 'string')
    }

    contractIdFilter = Array.from(new Set([...contractIdsFromNumero, ...contractIdsFromClients]))
  }

  // 2. Query principal.
  let plansQuery = supabase
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
    .limit(RESULT_LIMIT)

  if (frequencyFilter) plansQuery = plansQuery.eq('frequency', frequencyFilter)
  if (contractIdFilter !== null) {
    // .in() con array vacío genera 0 resultados (búsqueda sin contratos coincidentes).
    plansQuery = plansQuery.in('contract_id', contractIdFilter)
  }

  const { data: plans } = await plansQuery
  const plansTruncated = (plans?.length ?? 0) >= RESULT_LIMIT

  // 3. Construir rows y aplicar filtro de status de la próxima visita (cliente).
  const allRows = (plans ?? []).map((p) => {
    const contract = p.contracts as unknown as {
      id: string; numero_contrat: string
      clients:  { nom_client: string }
      machines: { numero_serie: string; marque: string; modele: string }
    }
    const visits = (p.maintenance_visits ?? []) as {
      id: string; scheduled_date: string; status: string; done_at: string | null
    }[]
    const nextVisit = visits
      .filter((v) => v.status !== 'fait')
      .sort((a, b) => a.scheduled_date.localeCompare(b.scheduled_date))[0] ?? null
    const lastDone = visits
      .filter((v) => v.status === 'fait')
      .sort((a, b) => b.scheduled_date.localeCompare(a.scheduled_date))[0] ?? null
    return { plan: p, contract, visits, nextVisit, lastDone }
  })

  const rows = statusFilter
    ? allRows.filter((r) => {
        // "fait" = el plan tiene al menos una visita realizada (independiente de pendientes).
        // "planifié" / "en_retard" = estado de la próxima visita pendiente.
        if (statusFilter === 'fait') return r.lastDone !== null
        return r.nextVisit?.status === statusFilter
      })
    : allRows

  const totalPlans  = rows.length
  const overdue     = rows.filter((r) => r.nextVisit?.status === 'en_retard').length
  const dueThisWeek = rows.filter((r) => {
    if (!r.nextVisit || r.nextVisit.status !== 'planifié') return false
    const diff = (new Date(r.nextVisit.scheduled_date).getTime() - Date.now()) / 86400000
    return diff >= 0 && diff <= 7
  }).length

  const hasFilters = q !== null || frequencyFilter !== null || statusFilter !== null

  return (
    <div className="p-8 space-y-6">

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900" style={{ fontFamily: 'Poppins, sans-serif' }}>
            Maintenance préventive
          </h1>
          <p className="text-sm text-gray-400 mt-0.5">
            {totalPlans} plan{totalPlans !== 1 ? 's' : ''}
            {hasFilters ? ' trouvé' + (totalPlans !== 1 ? 's' : '') : ' actif' + (totalPlans !== 1 ? 's' : '')}
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

      <SearchFilters
        placeholder="Rechercher par client ou nº contrat…"
        filters={[
          {
            param: 'frequency',
            label: 'Toutes les fréquences',
            options: [
              { value: 'mensuel',     label: 'Mensuel'     },
              { value: 'trimestriel', label: 'Trimestriel' },
            ],
          },
          {
            param: 'status',
            label: 'Tous les statuts',
            options: [
              { value: 'planifié',  label: 'Planifié'  },
              { value: 'en_retard', label: 'En retard' },
              { value: 'fait',      label: 'Fait'      },
            ],
          },
        ]}
      />

      {plansTruncated && (
        <p className="text-xs text-amber-600 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
          Affichage limité aux {RESULT_LIMIT} premiers plans. Affinez votre recherche pour voir le reste.
        </p>
      )}

      {/* KPI strip */}
      <div className="grid grid-cols-3 gap-4">
        {[
          { label: 'Plans',              value: totalPlans,  icon: Wrench,         color: 'text-gray-700'  },
          { label: 'En retard',          value: overdue,     icon: AlertTriangle,  color: 'text-red-600'   },
          { label: 'À faire cette sem.', value: dueThisWeek, icon: Clock,          color: 'text-amber-600' },
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
          <p className="text-sm text-gray-400">
            {hasFilters ? 'Aucun plan ne correspond aux filtres' : 'Aucun plan de maintenance enregistré'}
          </p>
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
                const href = `/admin/maintenance/${plan.id}`
                const overdueRow = nextVisit?.status === 'en_retard'
                const statusKey = nextVisit?.status ?? (lastDone ? 'fait' : 'planifié')
                const cfg = STATUS_CFG[statusKey as keyof typeof STATUS_CFG] ?? STATUS_CFG.planifié
                return (
                  <tr key={plan.id} className="hover:bg-gray-50">
                    <td className="px-5 py-3.5">
                      <Link href={href} className="font-medium text-gray-900 hover:text-[#BF0D0D] hover:underline transition-colors">
                        {contract.clients.nom_client}
                      </Link>
                      <p className="text-xs text-gray-400 font-mono mt-0.5">
                        {contract.machines.marque} {contract.machines.modele}
                      </p>
                    </td>
                    <td className="px-4 py-3.5 font-mono text-xs">
                      <Link href={href} className="text-gray-500 hover:text-[#BF0D0D] hover:underline transition-colors">
                        {contract.numero_contrat}
                      </Link>
                    </td>
                    <td className="px-4 py-3.5 text-gray-700">
                      {FREQ_LABEL[plan.frequency]}
                    </td>
                    <td className="px-4 py-3.5">
                      {nextVisit ? (
                        <span className={overdueRow ? 'text-red-600 font-semibold' : 'text-gray-700'}>
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
                      <span className={`inline-flex px-2 py-0.5 rounded text-xs font-medium ${cfg.class}`}>
                        {cfg.label}
                      </span>
                    </td>
                    <td className="px-4 py-3.5 text-right">
                      <Link
                        href={href}
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
