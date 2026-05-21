import { createClient } from '@/lib/supabase/server'
import Link from 'next/link'
import { Users, Plus } from 'lucide-react'
import SearchFilters from '@/components/admin/SearchFilters'
import { Card } from '@/components/ui/Card'
import { Badge } from '@/components/ui/Badge'
import { buttonClasses } from '@/components/ui/Button'
import {
  sanitizeSearchQuery,
  buildSafeOr,
  parseBooleanParam,
  firstParam,
} from '@/lib/search'

const SEARCH_COLUMNS = ['nom_client', 'ninea', 'ville'] as const
const RESULT_LIMIT = 200
const TH = 'text-left text-[10px] font-semibold text-ink-muted uppercase tracking-[0.06em] px-6 py-2.5'

type SearchParams = Promise<{ [key: string]: string | string[] | undefined }>

export default async function ClientsPage({ searchParams }: { searchParams: SearchParams }) {
  const sp = await searchParams
  const q = sanitizeSearchQuery(firstParam(sp.q))
  const activeFilter = parseBooleanParam(firstParam(sp.active))

  const supabase = await createClient()

  let query = supabase
    .from('clients')
    .select('id, nom_client, ninea, ville, active')
    .order('nom_client')
    .limit(RESULT_LIMIT)

  if (q) query = query.or(buildSafeOr(SEARCH_COLUMNS, q))
  if (activeFilter !== null) query = query.eq('active', activeFilter)

  const { data: clients } = await query
  const count = clients?.length ?? 0
  const hasFilters = q !== null || activeFilter !== null

  return (
    <div className="p-8">

      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="font-display text-2xl font-semibold text-ink">Clients</h1>
          <p className="text-sm text-ink-muted mt-1">
            {count} client{count !== 1 ? 's' : ''}
            {hasFilters ? ' trouvé' + (count !== 1 ? 's' : '') : ' enregistré' + (count !== 1 ? 's' : '')}
          </p>
        </div>
        <Link href="/admin/clients/new" className={buttonClasses('primary')}>
          <Plus size={16} />
          Nouveau client
        </Link>
      </div>

      <SearchFilters
        placeholder="Rechercher par nom, NINEA ou ville…"
        filters={[
          {
            param: 'active',
            label: 'Tous les statuts',
            options: [
              { value: 'true', label: 'Actifs' },
              { value: 'false', label: 'Inactifs' },
            ],
          },
        ]}
      />

      {/* Table */}
      <Card className="overflow-hidden">
        {!clients || clients.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <Users size={36} className="text-ink-muted mb-3" />
            <p className="text-sm font-medium text-ink-soft">
              {hasFilters ? 'Aucun client ne correspond aux filtres' : 'Aucun client enregistré'}
            </p>
            {!hasFilters && (
              <>
                <p className="text-xs text-ink-muted mt-1 mb-5">Commencez par ajouter votre premier client</p>
                <Link href="/admin/clients/new" className={buttonClasses('primary')}>
                  <Plus size={15} />
                  Ajouter un client
                </Link>
              </>
            )}
          </div>
        ) : (
          <table className="w-full">
            <thead>
              <tr className="bg-neutral-soft border-b border-line-subtle">
                <th className={TH}>Nom du client</th>
                <th className={TH}>NINEA</th>
                <th className={TH}>Ville</th>
                <th className={TH}>Statut</th>
                <th className="px-6 py-2.5" />
              </tr>
            </thead>
            <tbody className="divide-y divide-line-subtle">
              {clients.map((client) => (
                <tr key={client.id} className="hover:bg-neutral-soft transition-colors">
                  <td className="px-6 py-4 text-sm font-medium">
                    <Link
                      href={`/admin/clients/${client.id}`}
                      className="text-ink hover:text-accent transition-colors"
                    >
                      {client.nom_client}
                    </Link>
                  </td>
                  <td className="px-6 py-4 text-sm text-ink-muted font-mono">{client.ninea ?? '—'}</td>
                  <td className="px-6 py-4 text-sm text-ink-soft">{client.ville ?? '—'}</td>
                  <td className="px-6 py-4">
                    <Badge variant={client.active ? 'success' : 'neutral'}>
                      {client.active ? 'Actif' : 'Inactif'}
                    </Badge>
                  </td>
                  <td className="px-6 py-4 text-right">
                    <Link
                      href={`/admin/clients/${client.id}`}
                      className="text-sm font-medium text-accent hover:underline"
                    >
                      Modifier
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>
    </div>
  )
}
