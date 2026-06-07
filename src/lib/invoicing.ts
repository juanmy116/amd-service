import { createAdminClient } from '@/lib/supabase/admin'
import { calcDeltas, type Counter } from '@/lib/counters'
import {
  resolveEffectiveTariff,
  calculateMonthlyAmount,
  type ContractMachineWithBilling,
} from '@/lib/billing'

export type DraftLine = {
  contract_id: string
  numero_contrat: string
  machine_id: string
  machine_label: string
  plan_name: string
  billing_type: string
  fixed_fee: number | null
  price_bw: number | null
  price_color: number | null
  tiers: unknown
  delta_bw: number
  delta_color: number
  is_estimated: boolean
  amount_fixed: number
  amount_bw: number
  amount_color: number
  amount_total: number
}

export type ClientDraft = {
  client_id: number          // clients.id es BIGINT → number en JS
  client_name: string
  period_year: number
  period_month: number
  lines: DraftLine[]
  total_amount: number
  has_estimated: boolean
}

/**
 * Construye el borrador de factura de un cliente para (year, month).
 * Filtro de periodo (cubre activas, reemplazadas y terminadas dentro del mes):
 *   date_debut <= fin_periodo AND (date_fin IS NULL OR date_fin >= inicio_periodo)
 * Para cada línea con plan asignado busca el relevé del periodo y su delta vía calcDeltas;
 * si no hay relevé → línea estimada (consumo 0).
 */
export async function buildClientInvoiceDraft(
  clientId: number,
  year: number,
  month: number,
): Promise<ClientDraft | null> {
  const admin = createAdminClient()

  const { data: client } = await admin
    .from('clients').select('id, nom_client').eq('id', clientId).single()
  if (!client) return null

  const mm = String(month).padStart(2, '0')
  const periodStart = `${year}-${mm}-01`
  const periodEnd   = `${year}-${mm}-${String(new Date(year, month, 0).getDate()).padStart(2, '0')}`

  const { data: lines } = await admin
    .from('contract_machines')
    .select(`
      id, machine_id, billing_plan_id, date_debut, date_fin,
      price_bw_override, price_color_override, fixed_fee_override,
      billing_plans ( id, name, type, fixed_fee, price_bw, price_color, tiers ),
      machines ( numero_serie, marque, modele ),
      contracts!inner ( id, numero_contrat, client_id )
    `)
    .not('billing_plan_id', 'is', null)
    .eq('contracts.client_id', clientId)
    .lte('date_debut', periodEnd)
    .or(`date_fin.is.null,date_fin.gte.${periodStart}`)

  // N6 — cargar TODOS los relevés de las máquinas implicadas en UNA query (evita N+1)
  const machineIds = [...new Set((lines ?? []).map(l => l.machine_id).filter((id): id is string => !!id))]
  const { data: allCounters } = machineIds.length
    ? await admin
        .from('machine_counters')
        .select('id, machine_id, year, month, day, counter_bw, counter_color, status, is_replacement_start, previous_machine_id, annulation_reason, annule_at, notes, recorded_at')
        .in('machine_id', machineIds)
    : { data: [] as (Counter & { machine_id: string })[] }

  const countersByMachine = new Map<string, Counter[]>()
  for (const c of (allCounters ?? []) as (Counter & { machine_id: string })[]) {
    const arr = countersByMachine.get(c.machine_id) ?? []
    arr.push(c)
    countersByMachine.set(c.machine_id, arr)
  }

  const draftLines: DraftLine[] = []

  for (const line of lines ?? []) {
    const tariff = resolveEffectiveTariff(line as unknown as ContractMachineWithBilling)
    if (!tariff) continue

    const contract = line.contracts as unknown as { id: string; numero_contrat: string } | null
    const machine  = line.machines  as unknown as { numero_serie: string; marque: string; modele: string } | null
    const plan     = line.billing_plans as unknown as { name: string } | null
    if (!contract || !line.machine_id) continue

    const counters = countersByMachine.get(line.machine_id) ?? []
    const deltaMap = calcDeltas(counters)
    const periodCounter = counters
      .filter((c: Counter) => c.status === 'actif' && c.year === year && c.month === month)
      .sort((a: Counter, b: Counter) => b.recorded_at.localeCompare(a.recorded_at))[0] as Counter | undefined

    const d = periodCounter ? deltaMap.get(periodCounter.id) : undefined
    const is_estimated = !periodCounter || d?.delta_bw == null
    const delta_bw    = is_estimated ? 0 : (d!.delta_bw    ?? 0)
    const delta_color = is_estimated ? 0 : (d!.delta_color ?? 0)

    const amounts = calculateMonthlyAmount(tariff, delta_bw, delta_color)

    draftLines.push({
      contract_id:    contract.id,
      numero_contrat: contract.numero_contrat,
      machine_id:     line.machine_id,
      machine_label:  machine ? `${machine.marque} ${machine.modele} (${machine.numero_serie})` : line.machine_id,
      plan_name:      plan?.name ?? '—',
      billing_type:   tariff.type,
      fixed_fee:      tariff.fixed_fee,
      price_bw:       tariff.price_bw,
      price_color:    tariff.price_color,
      tiers:          tariff.tiers,
      delta_bw, delta_color, is_estimated,
      ...amounts,
    })
  }

  draftLines.sort((a, b) =>
    a.numero_contrat.localeCompare(b.numero_contrat) || a.machine_label.localeCompare(b.machine_label))

  return {
    client_id:    client.id,
    client_name:  client.nom_client,
    period_year:  year,
    period_month: month,
    lines:        draftLines,
    total_amount: draftLines.reduce((s, l) => s + l.amount_total, 0),
    has_estimated: draftLines.some(l => l.is_estimated),
  }
}

/**
 * Clientes con al menos una línea con plan activa O cerrada dentro del periodo (candidatos a facturar).
 * Usa el MISMO filtro de periodo que buildClientInvoiceDraft (H5).
 */
export async function listBillableClients(year: number, month: number): Promise<{ id: number; nom_client: string }[]> {
  const admin = createAdminClient()
  const mm = String(month).padStart(2, '0')
  const periodStart = `${year}-${mm}-01`
  const periodEnd   = `${year}-${mm}-${String(new Date(year, month, 0).getDate()).padStart(2, '0')}`

  const { data } = await admin
    .from('contract_machines')
    .select('contracts!inner ( clients!inner ( id, nom_client ) )')
    .not('billing_plan_id', 'is', null)
    .lte('date_debut', periodEnd)
    .or(`date_fin.is.null,date_fin.gte.${periodStart}`)

  const map = new Map<number, string>()
  for (const row of data ?? []) {
    const c = (row.contracts as unknown as { clients: { id: number; nom_client: string } }).clients
    if (c) map.set(c.id, c.nom_client)
  }
  return [...map.entries()].map(([id, nom_client]) => ({ id, nom_client }))
    .sort((a, b) => a.nom_client.localeCompare(b.nom_client))
}
