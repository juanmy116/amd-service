import { createClient } from '@/lib/supabase/server'
import Link from 'next/link'
import { Plus } from 'lucide-react'
import SearchFilters from '@/components/admin/SearchFilters'
import { Card } from '@/components/ui/Card'
import { Badge } from '@/components/ui/Badge'
import type { BadgeVariant } from '@/components/ui/Badge'
import { buttonClasses } from '@/components/ui/Button'
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
const TH = 'text-left text-[10px] font-semibold text-ink-muted uppercase tracking-[0.06em] px-5 py-2.5'

const STATUT: Record<string, { label: string; variant: BadgeVariant }> = {
  actif:    { label: 'Actif',    variant: 'success' },
  suspendu: { label: 'Suspendu', variant: 'warning' },
  terminé:  { label: 'Terminé',  variant: 'neutral' },
}

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
        <h1 className="font-display text-2xl font-semibold text-ink">Contrats</h1>
        <Link href="/admin/contracts/new" className={buttonClasses('primary')}>
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

      <Card className="overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-neutral-soft border-b border-line-subtle">
              <th className={TH}>Nº Contrat</th>
              <th className={TH}>Client</th>
              <th className={TH}>Machine</th>
              <th className={TH}>Début</th>
              <th className={TH}>Renouvellement</th>
              <th className={TH}>Statut</th>
              <th className="px-5 py-2.5" />
            </tr>
          </thead>
          <tbody className="divide-y divide-line-subtle">
            {(!contracts || contracts.length === 0) && (
              <tr>
                <td colSpan={7} className="px-5 py-10 text-center text-ink-muted">
                  {hasFilters ? 'Aucun contrat ne correspond aux filtres' : 'Aucun contrat enregistré'}
                </td>
              </tr>
            )}
            {contracts?.map((c) => {
              const client  = c.clients  as unknown as { nom_client: string } | null
              const machine = c.machines as unknown as { marque: string; modele: string } | null
              const statut = STATUT[c.statut]
              const href = `/admin/contracts/${c.id}`
              return (
                <tr key={c.id} className="hover:bg-neutral-soft transition-colors">
                  <td className="px-5 py-4 font-mono text-xs">
                    <Link href={href} className="text-ink-soft hover:text-accent transition-colors">
                      {c.numero_contrat}
                    </Link>
                  </td>
                  <td className="px-5 py-4 font-medium">
                    {client ? (
                      <Link href={href} className="text-ink hover:text-accent transition-colors">
                        {client.nom_client}
                      </Link>
                    ) : (
                      <span className="text-ink-muted">—</span>
                    )}
                  </td>
                  <td className="px-5 py-4 text-ink-soft">
                    {machine ? `${machine.marque} ${machine.modele}` : '—'}
                  </td>
                  <td className="px-5 py-4 text-ink-soft">{formatDate(c.date_debut)}</td>
                  <td className="px-5 py-4 text-ink-soft">{formatDate(c.date_renouvellement)}</td>
                  <td className="px-5 py-4">
                    {statut
                      ? <Badge variant={statut.variant}>{statut.label}</Badge>
                      : <span className="text-xs text-ink-muted">{c.statut}</span>}
                  </td>
                  <td className="px-5 py-4 text-right">
                    <Link
                      href={href}
                      className="text-sm font-medium text-ink-soft hover:text-ink"
                    >
                      Modifier
                    </Link>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </Card>
    </div>
  )
}
