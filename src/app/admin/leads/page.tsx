import { createClient } from '@/lib/supabase/server'
import SearchFilters from '@/components/admin/SearchFilters'
import { Card } from '@/components/ui/Card'
import { Badge } from '@/components/ui/Badge'
import type { BadgeVariant } from '@/components/ui/Badge'
import { firstParam } from '@/lib/search'
import { NEEDS_LABELS } from '@/lib/lead-email'
import StatusControl from './status-control'

const RESULT_LIMIT = 300
const VALID_STATUSES = ['nouveau', 'traité', 'archivé']

const STATUS_VARIANT: Record<string, BadgeVariant> = {
  nouveau: 'info',
  traité:  'success',
  archivé: 'neutral',
}

type SearchParams = Promise<{ [key: string]: string | string[] | undefined }>

export default async function LeadsPage({ searchParams }: { searchParams: SearchParams }) {
  const sp = await searchParams
  const statusParam = firstParam(sp.status)
  const statusFilter = statusParam && VALID_STATUSES.includes(statusParam) ? statusParam : null

  const supabase = await createClient()
  let query = supabase
    .from('leads')
    .select('id, name, email, company, phone, needs, message, status, created_at')
    .order('created_at', { ascending: false })
    .limit(RESULT_LIMIT)
  if (statusFilter) query = query.eq('status', statusFilter)

  const { data: leads } = await query
  const rows = leads ?? []
  const newCount = rows.filter((l) => l.status === 'nouveau').length

  return (
    <div className="p-8 space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="font-display text-2xl font-semibold text-ink">Leads</h1>
          <p className="text-sm text-ink-muted mt-0.5">
            {rows.length} demande{rows.length !== 1 ? 's' : ''}
            {newCount > 0 && <span className="ml-2 text-accent font-medium">· {newCount} nouveau{newCount !== 1 ? 'x' : ''}</span>}
          </p>
        </div>
      </div>

      <SearchFilters
        placeholder=""
        filters={[
          {
            param: 'status',
            label: 'Tous les statuts',
            options: [
              { value: 'nouveau', label: 'Nouveau' },
              { value: 'traité',  label: 'Traité'  },
              { value: 'archivé', label: 'Archivé' },
            ],
          },
        ]}
      />

      {rows.length === 0 ? (
        <Card className="flex items-center justify-center py-20">
          <p className="text-sm text-ink-muted">Aucun lead pour le moment</p>
        </Card>
      ) : (
        <div className="space-y-3">
          {rows.map((lead) => (
            <Card key={lead.id} className="p-5">
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0">
                  <div className="flex items-center gap-2.5">
                    <p className="text-sm font-semibold text-ink">{lead.company}</p>
                    <Badge variant="violet">{NEEDS_LABELS[lead.needs] ?? lead.needs}</Badge>
                    <Badge variant={STATUS_VARIANT[lead.status] ?? 'neutral'}>{lead.status}</Badge>
                  </div>
                  <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mt-1.5 text-xs text-ink-muted">
                    <span>{lead.name}</span>
                    <a href={`mailto:${lead.email}`} className="text-ink-soft hover:text-accent transition-colors">{lead.email}</a>
                    <a href={`tel:${lead.phone}`} className="text-ink-soft hover:text-accent transition-colors">{lead.phone}</a>
                    <span>{new Date(lead.created_at).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' })}</span>
                  </div>
                  {lead.message && (
                    <p className="mt-2.5 text-sm text-ink-soft whitespace-pre-wrap">{lead.message}</p>
                  )}
                </div>
                <div className="shrink-0">
                  <StatusControl id={lead.id} current={lead.status} />
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  )
}
