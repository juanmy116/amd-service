import { createClient } from '@/lib/supabase/server'
import Link from 'next/link'
import { Plus, QrCode } from 'lucide-react'
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
import { parseEnum, MACHINE_TYPES } from '@/lib/enums'

const SEARCH_COLUMNS = ['numero_serie', 'marque', 'modele'] as const
const RESULT_LIMIT = 200
const TH = 'text-left text-[10px] font-semibold text-ink-muted uppercase tracking-[0.06em] px-5 py-2.5'

type SearchParams = Promise<{ [key: string]: string | string[] | undefined }>

export default async function MachinesPage({ searchParams }: { searchParams: SearchParams }) {
  const sp = await searchParams
  const q = sanitizeSearchQuery(firstParam(sp.q))
  const typeFilter = parseEnum(firstParam(sp.type), MACHINE_TYPES)
  const activeFilter = parseBooleanParam(firstParam(sp.active))

  const supabase = await createClient()

  let query = supabase
    .from('machines')
    .select('*')
    .order('marque')
    .limit(RESULT_LIMIT)

  if (q) query = query.or(buildSafeOr(SEARCH_COLUMNS, q))
  if (typeFilter) query = query.eq('type', typeFilter)
  if (activeFilter !== null) query = query.eq('active', activeFilter)

  const { data: machines } = await query
  const hasFilters = q !== null || typeFilter !== null || activeFilter !== null

  return (
    <div className="p-8">
      <div className="flex items-center justify-between mb-8">
        <h1 className="font-display text-2xl font-semibold text-ink">Machines</h1>
        <Link href="/admin/machines/new" className={buttonClasses('primary')}>
          <Plus size={16} />
          Nouvelle machine
        </Link>
      </div>

      <SearchFilters
        placeholder="Rechercher par nº série, marque ou modèle…"
        filters={[
          {
            param: 'type',
            label: 'Tous les types',
            options: [
              { value: 'color', label: 'Couleur' },
              { value: 'noir_blanc', label: 'N&B' },
            ],
          },
          {
            param: 'active',
            label: 'Tous les statuts',
            options: [
              { value: 'true', label: 'Actives' },
              { value: 'false', label: 'Inactives' },
            ],
          },
        ]}
      />

      <Card className="overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-neutral-soft border-b border-line-subtle">
              <th className={TH}>Nº Série</th>
              <th className={TH}>Marque / Modèle</th>
              <th className={TH}>Type</th>
              <th className={TH}>Localisation</th>
              <th className={TH}>Statut</th>
              <th className="px-5 py-2.5" />
            </tr>
          </thead>
          <tbody className="divide-y divide-line-subtle">
            {(!machines || machines.length === 0) && (
              <tr>
                <td colSpan={6} className="px-5 py-10 text-center text-ink-muted">
                  {hasFilters ? 'Aucune machine ne correspond aux filtres' : 'Aucune machine enregistrée'}
                </td>
              </tr>
            )}
            {machines?.map((m) => {
              const href = `/admin/machines/${encodeURIComponent(m.numero_serie)}`
              return (
                <tr key={m.numero_serie} className="hover:bg-neutral-soft transition-colors">
                  <td className="px-5 py-4 font-mono text-xs">
                    <Link href={href} className="text-ink-soft hover:text-accent transition-colors">
                      {m.numero_serie}
                    </Link>
                  </td>
                  <td className="px-5 py-4">
                    <Link href={href} className="group inline-flex items-center">
                      <span className="font-medium text-ink group-hover:text-accent transition-colors">{m.marque}</span>
                      <span className="text-line mx-1.5">·</span>
                      <span className="text-ink-soft group-hover:text-accent transition-colors">{m.modele}</span>
                    </Link>
                  </td>
                  <td className="px-5 py-4">
                    <Badge variant={m.type === 'color' ? 'violet' : 'neutral'}>
                      {m.type === 'color' ? 'Couleur' : 'N&B'}
                    </Badge>
                  </td>
                  <td className="px-5 py-4 text-ink-soft">{m.localisation || '—'}</td>
                  <td className="px-5 py-4">
                    <Badge variant={m.active ? 'success' : 'neutral'}>
                      {m.active ? 'Active' : 'Inactive'}
                    </Badge>
                  </td>
                  <td className="px-5 py-4 text-right">
                    <div className="flex items-center justify-end gap-3">
                      <Link
                        href={`${href}/qr`}
                        target="_blank"
                        title="Télécharger QR code"
                        className="flex items-center justify-center w-8 h-8 rounded-lg border border-line text-ink-soft hover:text-ink hover:border-ink-muted transition-colors"
                      >
                        <QrCode size={15} />
                      </Link>
                      <Link
                        href={href}
                        className="text-sm font-medium text-ink-soft hover:text-ink"
                      >
                        Modifier
                      </Link>
                    </div>
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
