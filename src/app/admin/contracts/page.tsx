import { createClient } from '@/lib/supabase/server'
import Link from 'next/link'
import { Plus } from 'lucide-react'
import SearchFilters from '@/components/admin/SearchFilters'
import {
  sanitizeSearchQuery,
  buildIlikePattern,
  buildSafeOr,
  firstParam,
} from '@/lib/search'
import { parseEnum, CONTRACT_STATUSES } from '@/lib/enums'

const RESULT_LIMIT = 200
// Límite holgado para el lookup intermedio de clientes que alimenta el filtro.
const LOOKUP_LIMIT = 1000

const STATUT_STYLE = {
  actif:    'bg-green-50 text-green-700',
  suspendu: 'bg-amber-50 text-amber-700',
  terminé:  'bg-gray-100 text-gray-500',
} as const

const STATUT_LABEL = {
  actif:    'Actif',
  suspendu: 'Suspendu',
  terminé:  'Terminé',
} as const

function formatDate(d: string | null) {
  if (!d) return '—'
  return new Date(d).toLocaleDateString('fr-FR')
}

type SearchParams = Promise<{ [key: string]: string | string[] | undefined }>

export default async function ContractsPage({ searchParams }: { searchParams: SearchParams }) {
  const sp = await searchParams
  const q = sanitizeSearchQuery(firstParam(sp.q))
  const statutFilter = parseEnum(firstParam(sp.statut), CONTRACT_STATUSES)

  const supabase = await createClient()

  let clientIds: number[] = []
  if (q) {
    const { data: matchedClients } = await supabase
      .from('clients')
      .select('id')
      .ilike('nom_client', buildIlikePattern(q))
      .limit(LOOKUP_LIMIT)
    clientIds = (matchedClients ?? [])
      .map((c) => c.id)
      .filter((id): id is number => typeof id === 'number')
  }

  let query = supabase
    .from('contracts')
    .select('id, numero_contrat, date_debut, date_renouvellement, lieu_installation, statut, client_id, clients(nom_client), machines(marque, modele)')
    .order('created_at', { ascending: false })
    .limit(RESULT_LIMIT)

  if (q) {
    const conditions = [buildSafeOr(['numero_contrat'], q)]
    if (clientIds.length > 0) {
      conditions.push(`client_id.in.(${clientIds.join(',')})`)
    }
    query = query.or(conditions.join(','))
  }
  if (statutFilter) query = query.eq('statut', statutFilter)

  const { data: contracts } = await query
  const hasFilters = q !== null || statutFilter !== null

  return (
    <div className="p-8">
      <div className="flex items-center justify-between mb-8">
        <h1 className="text-2xl font-semibold text-gray-900" style={{ fontFamily: 'Poppins, sans-serif' }}>
          Contrats
        </h1>
        <Link
          href="/admin/contracts/new"
          className="flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium text-white transition-opacity hover:opacity-90"
          style={{ backgroundColor: '#BF0D0D' }}
        >
          <Plus size={16} />
          Nouveau contrat
        </Link>
      </div>

      <SearchFilters
        placeholder="Rechercher par nº contrat ou nom du client…"
        filters={[
          {
            param: 'statut',
            label: 'Tous les statuts',
            options: [
              { value: 'actif',    label: 'Actif' },
              { value: 'suspendu', label: 'Suspendu' },
              { value: 'terminé',  label: 'Terminé' },
            ],
          },
        ]}
      />

      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-200 bg-gray-50">
              <th className="text-left px-5 py-3.5 font-medium text-gray-500">Nº Contrat</th>
              <th className="text-left px-5 py-3.5 font-medium text-gray-500">Client</th>
              <th className="text-left px-5 py-3.5 font-medium text-gray-500">Machine</th>
              <th className="text-left px-5 py-3.5 font-medium text-gray-500">Début</th>
              <th className="text-left px-5 py-3.5 font-medium text-gray-500">Renouvellement</th>
              <th className="text-left px-5 py-3.5 font-medium text-gray-500">Statut</th>
              <th />
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {(!contracts || contracts.length === 0) && (
              <tr>
                <td colSpan={7} className="px-5 py-10 text-center text-gray-400">
                  {hasFilters ? 'Aucun contrat ne correspond aux filtres' : 'Aucun contrat enregistré'}
                </td>
              </tr>
            )}
            {contracts?.map((c) => {
              const statut = c.statut as keyof typeof STATUT_STYLE
              const client  = c.clients  as unknown as { nom_client: string } | null
              const machine = c.machines as unknown as { marque: string; modele: string } | null
              const href = `/admin/contracts/${c.id}`
              return (
                <tr key={c.id} className="hover:bg-gray-50 transition-colors">
                  <td className="px-5 py-4 font-mono text-xs">
                    <Link href={href} className="text-gray-600 hover:text-[#BF0D0D] hover:underline transition-colors">
                      {c.numero_contrat}
                    </Link>
                  </td>
                  <td className="px-5 py-4 font-medium">
                    {client ? (
                      <Link href={href} className="text-gray-900 hover:text-[#BF0D0D] hover:underline transition-colors">
                        {client.nom_client}
                      </Link>
                    ) : (
                      <span className="text-gray-400">—</span>
                    )}
                  </td>
                  <td className="px-5 py-4 text-gray-600">
                    {machine ? `${machine.marque} ${machine.modele}` : '—'}
                  </td>
                  <td className="px-5 py-4 text-gray-600">{formatDate(c.date_debut)}</td>
                  <td className="px-5 py-4 text-gray-600">{formatDate(c.date_renouvellement)}</td>
                  <td className="px-5 py-4">
                    <span className={`inline-flex px-2 py-0.5 rounded text-xs font-medium ${STATUT_STYLE[statut] ?? 'bg-gray-100 text-gray-500'}`}>
                      {STATUT_LABEL[statut] ?? statut}
                    </span>
                  </td>
                  <td className="px-5 py-4 text-right">
                    <Link
                      href={href}
                      className="text-sm font-medium text-gray-600 hover:text-gray-900 underline underline-offset-2"
                    >
                      Modifier
                    </Link>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}
