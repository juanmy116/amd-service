import { createClient } from '@/lib/supabase/server'
import Link from 'next/link'
import { AlertTriangle, Building2, ChevronRight, Printer } from 'lucide-react'
import { MONTHS_FR, MONTHS_FR_LONG } from './constants'
import SearchFilters from '@/components/admin/SearchFilters'
import { Card } from '@/components/ui/Card'
import { sanitizeSearchQuery, firstParam } from '@/lib/search'

interface Machine {
  numero_serie: string
  marque:       string
  modele:       string
  clientId:     number | null
  clientName:   string | null
}

const MIN_YEAR = 2020
const MAX_YEAR = 2100

function parseMonthParam(value: string | null): number | null {
  if (value === null) return null
  if (!/^[0-9]{1,2}$/.test(value)) return null
  const n = Number(value)
  return Number.isInteger(n) && n >= 1 && n <= 12 ? n : null
}

function parseYearParam(value: string | null): number | null {
  if (value === null) return null
  if (!/^[0-9]{4}$/.test(value)) return null
  const n = Number(value)
  return Number.isInteger(n) && n >= MIN_YEAR && n <= MAX_YEAR ? n : null
}

function buildYearOptions(): { value: string; label: string }[] {
  const current = new Date().getFullYear()
  const years: number[] = []
  for (let y = current; y >= current - 5; y--) years.push(y)
  return years.map((y) => ({ value: String(y), label: String(y) }))
}

function buildMonthOptions(): { value: string; label: string }[] {
  return Array.from({ length: 12 }, (_, i) => ({
    value: String(i + 1),
    label: MONTHS_FR_LONG[i + 1],
  }))
}

type SearchParams = Promise<{ [key: string]: string | string[] | undefined }>

export default async function ContadoresPage({ searchParams }: { searchParams: SearchParams }) {
  const sp = await searchParams
  const q = sanitizeSearchQuery(firstParam(sp.q))
  const monthFilter = parseMonthParam(firstParam(sp.month))
  const yearFilter  = parseYearParam(firstParam(sp.year))

  const supabase = await createClient()

  const { data: rawMachines } = await supabase
    .from('machines')
    .select('numero_serie, marque, modele, contracts(statut, client_id, clients(id, nom_client))')
    .eq('active', true)
    .order('marque')

  const { data: allActiveCounters } = await supabase
    .from('machine_counters')
    .select('machine_id, year, month')
    .eq('status', 'actif')
    .order('year',  { ascending: false })
    .order('month', { ascending: false })

  // Set de pares (machine_id, year, month) presentes para chequeo exacto.
  const presence = new Set<string>()
  // También trackeamos la última lectura por máquina para mostrar "Dernier".
  const latestMap = new Map<string, { year: number; month: number }>()
  if (allActiveCounters) {
    const seen = new Set<string>()
    allActiveCounters.forEach((c) => {
      presence.add(`${c.machine_id}|${c.year}|${c.month}`)
      if (!seen.has(c.machine_id)) {
        latestMap.set(c.machine_id, { year: c.year, month: c.month })
        seen.add(c.machine_id)
      }
    })
  }

  const now    = new Date()
  const cYear  = yearFilter  ?? now.getFullYear()
  const cMonth = monthFilter ?? now.getMonth() + 1
  const periodLabel = `${MONTHS_FR_LONG[cMonth]} ${cYear}`
  const isCustomPeriod = monthFilter !== null || yearFilter !== null

  const machines: Machine[] = (rawMachines ?? []).map((m) => {
    const contracts = m.contracts as unknown as {
      statut: string
      client_id: number | null
      clients: { id: number; nom_client: string } | null
    }[] | null
    const active = contracts?.find((c) => c.statut === 'actif') ?? null
    return {
      numero_serie: m.numero_serie,
      marque:       m.marque,
      modele:       m.modele,
      clientId:     active?.client_id ?? null,
      clientName:   active?.clients?.nom_client ?? null,
    }
  })

  // Agrupar por cliente
  const clientMap = new Map<number, { name: string; machines: Machine[] }>()
  const noClient: Machine[] = []
  machines.forEach((m) => {
    if (m.clientId !== null && m.clientName !== null) {
      if (!clientMap.has(m.clientId)) {
        clientMap.set(m.clientId, { name: m.clientName, machines: [] })
      }
      clientMap.get(m.clientId)!.machines.push(m)
    } else {
      noClient.push(m)
    }
  })

  let clientGroups = [...clientMap.entries()]
    .map(([id, { name, machines }]) => ({ id, name, machines }))
    .sort((a, b) => a.name.localeCompare(b.name))

  // Filtro de búsqueda (cliente): coincidencia case-insensitive sobre el nombre ya cargado.
  if (q) {
    const needle = q.toLowerCase()
    clientGroups = clientGroups.filter((g) => g.name.toLowerCase().includes(needle))
  }

  // Una máquina está "manquant" si NO existe relevé activo para (year, month).
  const missingCount = (ms: Machine[]) =>
    ms.filter((m) => !presence.has(`${m.numero_serie}|${cYear}|${cMonth}`)).length

  // clientGroups ya está filtrado por la búsqueda: cuando hay un cliente buscado,
  // estos totales del cabecero reflejan solo el subset visible. Es intencional.
  const totalMachines = clientGroups.reduce((acc, g) => acc + g.machines.length, 0)
  const totalMissing  = clientGroups.reduce((acc, g) => acc + missingCount(g.machines), 0)
  const hasFilters    = q !== null || monthFilter !== null || yearFilter !== null

  return (
    <div className="p-8">
      <div className="flex items-start justify-between mb-6">
        <div>
          <h1 className="font-display text-2xl font-semibold text-ink">
            Compteurs
          </h1>
          <p className="text-sm text-ink-muted mt-0.5">
            {clientGroups.length} client{clientGroups.length !== 1 ? 's' : ''} · {totalMachines} machine{totalMachines !== 1 ? 's' : ''}
            {isCustomPeriod && <span className="ml-2 text-ink-soft">· période : {periodLabel}</span>}
            {totalMissing > 0 && (
              <span className="ml-2 text-warning font-medium">
                · {totalMissing} relevé{totalMissing !== 1 ? 's' : ''} manquant{totalMissing !== 1 ? 's' : ''}
              </span>
            )}
          </p>
        </div>
      </div>

      <SearchFilters
        placeholder="Rechercher un client…"
        filters={[
          { param: 'month', label: 'Tous les mois', options: buildMonthOptions() },
          { param: 'year',  label: 'Toutes les années', options: buildYearOptions() },
        ]}
      />

      {/* Con búsqueda activa la tarjeta "Sans contrat actif" se oculta, así que
          no debe contar como contenido visible para evaluar el empty-state. */}
      {clientGroups.length === 0 && (q !== null || noClient.length === 0) ? (
        <Card className="flex items-center justify-center py-20">
          <p className="text-sm text-ink-muted">
            {hasFilters ? 'Aucun client ne correspond aux filtres' : 'Aucune machine active enregistrée'}
          </p>
        </Card>
      ) : (
        <div className="space-y-3">
          {clientGroups.map((group) => {
            const missing = missingCount(group.machines)
            const allGood = missing === 0
            return (
              <Link key={group.id} href={`/admin/contadores/cliente/${group.id}`} className="block group">
                <Card className="flex items-center justify-between px-5 py-4 hover:shadow-raised transition-shadow">
                  <div className="flex items-center gap-4">
                    <div className="w-10 h-10 rounded-xl bg-accent-soft flex items-center justify-center shrink-0">
                      <Building2 size={18} className="text-accent" />
                    </div>
                    <div>
                      <p className="text-sm font-semibold text-ink group-hover:text-accent transition-colors">{group.name}</p>
                      <div className="flex items-center gap-3 mt-0.5">
                        <span className="flex items-center gap-1 text-xs text-ink-muted">
                          <Printer size={11} />
                          {group.machines.length} machine{group.machines.length !== 1 ? 's' : ''}
                        </span>
                        <span className="text-xs text-line">·</span>
                        <span className="text-xs text-ink-muted">
                          Dernier : {(() => {
                            const lasts = group.machines
                              .map((m) => latestMap.get(m.numero_serie))
                              .filter((l): l is { year: number; month: number } => l !== undefined)
                            if (!lasts.length) return 'aucun relevé'
                            const l = lasts.sort((a, b) => a.year !== b.year ? b.year - a.year : b.month - a.month)[0]
                            return `${MONTHS_FR[l.month]} ${l.year}`
                          })()}
                        </span>
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-4">
                    {!allGood ? (
                      <div className="flex items-center gap-1.5 text-warning">
                        <AlertTriangle size={14} />
                        <span className="text-xs font-medium">
                          {missing} {isCustomPeriod ? `manque(s) en ${MONTHS_FR[cMonth]}` : 'en attente'}
                        </span>
                      </div>
                    ) : (
                      <span className="text-xs font-medium text-success">
                        ✓ À jour{isCustomPeriod ? ` (${MONTHS_FR[cMonth]} ${cYear})` : ''}
                      </span>
                    )}
                    <ChevronRight size={16} className="text-ink-muted group-hover:text-ink-soft transition-colors" />
                  </div>
                </Card>
              </Link>
            )
          })}

          {/* Machines sans contrat actif — solo cuando no hay búsqueda activa */}
          {!q && noClient.length > 0 && (
            <Card className="flex items-center justify-between px-5 py-4 opacity-70 border-dashed">
              <div className="flex items-center gap-4">
                <div className="w-10 h-10 rounded-xl bg-neutral-soft flex items-center justify-center shrink-0">
                  <Printer size={18} className="text-ink-muted" />
                </div>
                <div>
                  <p className="text-sm font-medium text-ink-soft">Sans contrat actif</p>
                  <p className="text-xs text-ink-muted mt-0.5">
                    {noClient.length} machine{noClient.length !== 1 ? 's' : ''} sans client assigné
                  </p>
                </div>
              </div>
            </Card>
          )}
        </div>
      )}
    </div>
  )
}
