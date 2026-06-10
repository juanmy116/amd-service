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

const SEARCH_COLUMNS = ['numero_incident', 'title'] as const
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

  // Para incidencias nuevas (post-refactor) el cliente está en contract_machines,
  // no en contracts. Cargamos los IDs de líneas del cliente seleccionado.
  const contractIds = (contractIdsRes.data ?? []).map((c) => c.id)
  const cmIds: string[] = clientId && contractIds.length > 0
    ? ((await supabase.from('contract_machines').select('id').in('contract_id', contractIds)).data ?? []).map((l) => l.id)
    : []

  let query = supabase
    .from('incidents')
    .select(`
      id, numero_incident, title, category, priority, status, machine_id, created_at,
      contract_machine_id, assigned_to,
      contract_machines(machine_id, machines(numero_serie), contracts(client_id, clients(nom_client))),
      profiles!assigned_to(full_name)
    `)
    .order('created_at', { ascending: false })
    .limit(RESULT_LIMIT)

  if (q) query = query.or(buildSafeOr(SEARCH_COLUMNS, q))
  if (statusFilter) query = query.eq('status', statusFilter)
  if (priorityFilter) query = query.eq('priority', priorityFilter)
  if (clientId) {
    // El cliente de una incidencia se resuelve por su línea de contrato.
    if (cmIds.length > 0) {
      query = query.in('contract_machine_id', cmIds)
    } else {
      // Cliente sin líneas → sin resultados
      query = query.eq('id', '00000000-0000-0000-0000-000000000000')
    }
  }

  const { data: incidents, error } = await query
  if (error) { console.error('[incidents]', error); throw new Error('DATA_FETCH_ERROR') }
  const truncated = (incidents?.length ?? 0) >= RESULT_LIMIT

  // Transformación a filas planas para los dos renderizados.
  type CmNested = {
    machine_id: string
    machines: { numero_serie: string } | null
    contracts: { client_id: number; clients: { nom_client: string } | null } | null
  } | null
  type Row = NonNullable<typeof incidents>[number] & {
    contract_machines: CmNested
    profiles: { full_name: string | null } | null
  }

  const rows = ((incidents ?? []) as unknown as Row[]).map((inc) => {
    const cm = inc.contract_machines
    const resolvedMachineId = cm?.machine_id ?? inc.machine_id
    const resolvedClientName = cm?.contracts?.clients?.nom_client ?? null
    return {
      id: inc.id,
      numero_incident: inc.numero_incident,
      title: inc.title,
      status: inc.status,
      priority: inc.priority,
      category: inc.category,
      machine_id: resolvedMachineId,
      created_at: inc.created_at,
      clientName: resolvedClientName,
      technicianName: (inc.profiles as unknown as { full_name: string | null } | null)?.full_name ?? null,
    }
  })

  const kanbanIncidents = rows.map((r) => ({
    id: r.id,
    numero_incident: r.numero_incident,
    title: r.title,
    machine_id: r.machine_id,
    category: r.category,
    priority: r.priority,
    status: r.status,
    technicianName: r.technicianName,
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
