import { createClient } from '@/lib/supabase/server'
import Link from 'next/link'
import { Plus } from 'lucide-react'
import KanbanBoard from '@/components/admin/KanbanBoard'
import SearchFilters from '@/components/admin/SearchFilters'
import ViewToggle from '@/components/admin/ViewToggle'
import IncidentsListView, { type IncidentRow } from '@/components/admin/IncidentsListView'
import { buttonClasses } from '@/components/ui/Button'
import {
  sanitizeSearchQuery,
  buildSafeOr,
  firstParam,
  parsePositiveIntParam,
} from '@/lib/search'
import { parseEnum, INCIDENT_STATUSES, INCIDENT_PRIORITIES } from '@/lib/enums'

const SEARCH_COLUMNS = ['numero_incident', 'title', 'machine_id'] as const
const RESULT_LIMIT = 300

type SearchParams = Promise<{ [key: string]: string | string[] | undefined }>

export default async function IncidentsPage({ searchParams }: { searchParams: SearchParams }) {
  const sp = await searchParams
  const q = sanitizeSearchQuery(firstParam(sp.q))
  const clientId = parsePositiveIntParam(sp.client)
  const statusFilter = parseEnum(firstParam(sp.status), INCIDENT_STATUSES)
  const priorityFilter = parseEnum(firstParam(sp.priority), INCIDENT_PRIORITIES)
  const view = firstParam(sp.view) === 'list' ? 'list' : 'kanban'

  const supabase = await createClient()

  // Cargar listas en paralelo (clientes para el dropdown).
  const [clientsRes, contractIdsRes] = await Promise.all([
    supabase.from('clients').select('id, nom_client').order('nom_client'),
    clientId
      ? supabase.from('contracts').select('id').eq('client_id', clientId)
      : Promise.resolve({ data: null }),
  ])

  let query = supabase
    .from('incidents')
    .select(`
      id, numero_incident, title, category, priority, status, machine_id, created_at, contract_id, assigned_to,
      contracts(client_id, clients(nom_client)),
      profiles!assigned_to(full_name)
    `)
    .order('created_at', { ascending: false })
    .limit(RESULT_LIMIT)

  if (q) query = query.or(buildSafeOr(SEARCH_COLUMNS, q))
  if (statusFilter) query = query.eq('status', statusFilter)
  if (priorityFilter) query = query.eq('priority', priorityFilter)
  if (clientId) {
    // .in() con array vacío genera 0 resultados (cliente sin contratos).
    const ids = (contractIdsRes.data ?? []).map((c) => c.id)
    query = query.in('contract_id', ids)
  }

  const { data: incidents } = await query
  const truncated = (incidents?.length ?? 0) >= RESULT_LIMIT

  // Transformación a filas planas para los dos renderizados.
  type Row = NonNullable<typeof incidents>[number] & {
    contracts: { client_id: number; clients: { nom_client: string } | null } | null
    profiles: { full_name: string | null } | null
  }
  const rows = ((incidents ?? []) as unknown as Row[]).map((inc) => ({
    id: inc.id,
    numero_incident: inc.numero_incident,
    title: inc.title,
    status: inc.status,
    priority: inc.priority,
    category: inc.category,
    machine_id: inc.machine_id,
    created_at: inc.created_at,
    clientName: inc.contracts?.clients?.nom_client ?? null,
    technicianName: inc.profiles?.full_name ?? null,
  }))

  const kanbanIncidents = rows.map((r) => ({
    id: r.id,
    numero_incident: r.numero_incident,
    title: r.title,
    machine_id: r.machine_id,
    category: r.category,
    priority: r.priority,
    status: r.status,
  }))

  const listIncidents: IncidentRow[] = rows.map((r) => ({
    id: r.id,
    numero_incident: r.numero_incident,
    title: r.title,
    status: r.status,
    priority: r.priority,
    machine_id: r.machine_id,
    created_at: r.created_at,
    clientName: r.clientName,
    technicianName: r.technicianName,
  }))

  const clientOptions = (clientsRes.data ?? []).map((c) => ({
    value: String(c.id),
    label: c.nom_client,
  }))

  return (
    <div className="p-8 flex flex-col min-h-full">
      <div className="flex items-center justify-between mb-6">
        <h1 className="font-display text-2xl font-semibold text-ink">Incidents SAV</h1>
        <div className="flex items-center gap-3">
          <ViewToggle defaultView="kanban" />
          <Link href="/admin/incidents/new" className={buttonClasses('primary')}>
            <Plus size={16} />
            Nouvel incident
          </Link>
        </div>
      </div>

      <SearchFilters
        placeholder="Rechercher par nº incident, titre ou nº série…"
        filters={[
          {
            param: 'client',
            label: 'Tous les clients',
            options: clientOptions,
          },
          {
            param: 'status',
            label: 'Tous les statuts',
            options: [
              { value: 'nouveau',  label: 'Nouveau'  },
              { value: 'assigné',  label: 'Assigné'  },
              { value: 'en_cours', label: 'En cours' },
              { value: 'résolu',   label: 'Résolu'   },
              { value: 'fermé',    label: 'Fermé'    },
            ],
          },
          {
            param: 'priority',
            label: 'Toutes les priorités',
            options: [
              { value: 'urgente', label: 'Urgente' },
              { value: 'haute',   label: 'Haute'   },
              { value: 'normale', label: 'Normale' },
              { value: 'basse',   label: 'Basse'   },
            ],
          },
        ]}
      />

      {truncated && (
        <p className="text-xs text-warning bg-warning-soft border border-warning/30 rounded-lg px-3 py-2 mb-4">
          Affichage limité aux {RESULT_LIMIT} premiers incidents. Affinez votre recherche pour voir le reste.
        </p>
      )}

      {view === 'list' ? (
        <IncidentsListView incidents={listIncidents} />
      ) : (
        <KanbanBoard incidents={kanbanIncidents} />
      )}
    </div>
  )
}
