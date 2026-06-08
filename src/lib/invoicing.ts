import { createAdminClient } from '@/lib/supabase/admin'
import { counterDelta, type Counter } from '@/lib/counters'
import {
  resolveEffectiveTariff,
  calculateMonthlyAmount,
  type ContractMachineWithBilling,
  type EffectiveTariff,
  type BillingType,
  type BillingTier,
} from '@/lib/billing'

/**
 * BLOQUE B / P0-7 — error TÉCNICO de lectura (la query de Supabase devolvió `error`).
 * Es un estado DISTINTO de "falta el dato real" (eso → línea estimada / botón Forzar).
 * Un fallo técnico debe BLOQUEAR preview y emisión, nunca convertirse en consumo 0.
 */
export class BillingDataError extends Error {
  constructor(public readonly source: string) {
    super('Blocage technique : impossible de lire les données de facturation. Réessayez.')
    this.name = 'BillingDataError'
  }
}

/** Tipo de relevé tal y como se carga aquí: Counter + las columnas de atribución. */
type CounterRow = Counter & { machine_id: string; contract_id: string | null }

/** Fecha ISO (YYYY-MM-DD) de un relevé, usando day si existe (día 01 si no). */
function counterDate(c: { year: number; month: number; day: number | null }): string {
  return `${c.year}-${String(c.month).padStart(2, '0')}-${String(c.day ?? 1).padStart(2, '0')}`
}

/**
 * BLOQUE B / P0-3 — atribución del consumo por LÍNEA/CONTRATO, no por máquina física.
 * Una misma máquina (numero_serie) rota por varios contratos a lo largo del tiempo; cada
 * relevé queda ligado a su `contract_id` (lo rellenan tanto Princity como la entrada manual).
 * Una línea solo debe ver los relevés de SU contrato:
 *   - contract_id === el de la línea  → siempre.
 *   - contract_id NULL (relevé heredado, sin atribución) → solo si su fecha cae dentro del
 *     intervalo de vigencia de la línea [date_debut, date_fin]. Evita que dos contratos que
 *     compartieron la máquina se roben relevés antiguos sin atribuir.
 */
export function countersForLine(
  lineContractId: string,
  lineDebut: string,
  lineFin: string | null,
  counters: CounterRow[],
): Counter[] {
  return counters.filter(c => {
    if (c.contract_id === lineContractId) return true
    if (c.contract_id == null) {
      const d = counterDate(c)
      return d >= lineDebut && (lineFin === null || d <= lineFin)
    }
    return false
  })
}

export type DraftLine = {
  cm_id: string
  replaces_cm_id: string | null
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
  breakdown?: { machine_label: string; delta_bw: number; delta_color: number }[]
}

export type ClientDraft = {
  client_id: number          // clients.id es BIGINT → number en JS
  client_name: string
  period_year: number
  period_month: number
  lines: DraftLine[]
  total_amount: number
  has_estimated: boolean
  has_replacement: boolean
}

export type LineCounters = {
  date_debut: string
  date_fin: string | null
  start_counter_bw: number | null
  start_counter_color: number | null
  end_counter_bw: number | null
  end_counter_color: number | null
}

/**
 * Consumo facturable de UNA línea (puesto-máquina) en el mes (year, month).
 * Modelo H-D5: los puntos de inicio/cierre de un reemplazo viven en la propia línea
 * (start_counter / end_counter), no como filas de machine_counters. El consumo del mes es
 * lectura_final − lectura_inicial, donde:
 *  - lectura_final: si la línea se cerró en el mes (reemplazo) → end_counter; si sigue
 *    abierta → el relevé normal de la máquina en el mes.
 *  - lectura_inicial: si la línea empezó en el mes con start_counter → start_counter; si
 *    venía de antes → el relevé normal de la máquina del mes anterior más reciente.
 * Si falta algún punto → línea estimada (consumo 0, solo forfait).
 */
export function computeLineConsumption(
  line: LineCounters,
  counters: Counter[],
  year: number,
  month: number,
  periodStart: string,
  periodEnd: string,
): { delta_bw: number; delta_color: number; is_estimated: boolean } {
  const inMonth = (d: string | null): boolean => d !== null && d >= periodStart && d <= periodEnd
  const ESTIMATED = { delta_bw: 0, delta_color: 0, is_estimated: true }

  // Lectura final dentro del mes.
  // H-D6: solo una línea cerrada POR REEMPLAZO tiene end_counter. Una línea retirada sin
  // reemplazo (flujo "retire": date_fin sin end_counter) debe facturar su último consumo con
  // el relevé normal del mes — si no, se infrafactura (regla R1 del núcleo).
  let finalBw: number | null = null
  let finalColor: number | null = null
  const closedByReplacementInMonth =
    line.date_fin !== null && inMonth(line.date_fin) &&
    line.end_counter_bw !== null && line.end_counter_color !== null   // H-D7: ambos puntos

  if (closedByReplacementInMonth) {
    finalBw    = line.end_counter_bw
    finalColor = line.end_counter_color
  } else {
    // Relevé normal del mes (cubre: línea abierta Y línea retirada sin end_counter).
    const monthReading = counters
      .filter(c => c.status === 'actif' && c.year === year && c.month === month)
      .sort((a, b) => b.recorded_at.localeCompare(a.recorded_at))[0]
    if (monthReading) {
      finalBw    = monthReading.counter_bw
      finalColor = monthReading.counter_color
    }
  }

  // Lectura inicial dentro del mes
  let initBw: number | null = null
  let initColor: number | null = null
  if (inMonth(line.date_debut)) {
    if (line.start_counter_bw !== null) {
      initBw    = line.start_counter_bw
      initColor = line.start_counter_color
    }
    // línea normal en su primer mes (sin start_counter) → sin base previa
  } else {
    const prev = counters
      .filter(c => c.status === 'actif' && (c.year < year || (c.year === year && c.month < month)))
      .sort((a, b) =>
        b.year  !== a.year  ? b.year  - a.year  :
        b.month !== a.month ? b.month - a.month :
        b.recorded_at.localeCompare(a.recorded_at))[0]
    if (prev) {
      initBw    = prev.counter_bw
      initColor = prev.counter_color
    }
  }

  // Aritmética vía la primitiva compartida con Contadores (counterDelta). La POLÍTICA es
  // propia de facturación: falta de punto o delta negativo → línea estimada (solo forfait).
  const delta_bw    = counterDelta(finalBw, initBw)
  const delta_color = counterDelta(finalColor, initColor)
  if (delta_bw === null || delta_color === null) return ESTIMATED  // falta un punto → estimado
  if (delta_bw < 0 || delta_color < 0) return ESTIMATED           // incoherencia → no facturar negativo
  return { delta_bw, delta_color, is_estimated: false }
}

/**
 * Construye el borrador de factura de un cliente para (year, month).
 * Filtro de periodo (cubre activas, reemplazadas y terminadas dentro del mes):
 *   date_debut <= fin_periodo AND (date_fin IS NULL OR date_fin >= inicio_periodo)
 * Para cada línea con plan calcula su consumo del mes vía computeLineConsumption (relevés
 * normales + puntos start/end de la línea); si falta algún punto → línea estimada (consumo 0).
 * Luego consolida las líneas encadenadas por reemplazo en un único puesto de servicio.
 */
export async function buildClientInvoiceDraft(
  clientId: number,
  year: number,
  month: number,
): Promise<ClientDraft | null> {
  const admin = createAdminClient()

  const { data: client, error: clientErr } = await admin
    .from('clients').select('id, nom_client').eq('id', clientId).maybeSingle()
  if (clientErr) throw new BillingDataError('clients')   // P0-7: fallo técnico → bloquear
  if (!client) return null                               // no existe → no es error técnico

  const mm = String(month).padStart(2, '0')
  const periodStart = `${year}-${mm}-01`
  const periodEnd   = `${year}-${mm}-${String(new Date(year, month, 0).getDate()).padStart(2, '0')}`

  const { data: lines, error: linesErr } = await admin
    .from('contract_machines')
    .select(`
      id, machine_id, billing_plan_id, date_debut, date_fin,
      replaces_contract_machine_id,
      start_counter_bw, start_counter_color, end_counter_bw, end_counter_color,
      price_bw_override, price_color_override, fixed_fee_override,
      billing_plans ( id, name, type, fixed_fee, price_bw, price_color, tiers ),
      machines ( numero_serie, marque, modele ),
      contracts!inner ( id, numero_contrat, client_id )
    `)
    .not('billing_plan_id', 'is', null)
    .eq('contracts.client_id', clientId)
    .lte('date_debut', periodEnd)
    .or(`date_fin.is.null,date_fin.gte.${periodStart}`)
  if (linesErr) throw new BillingDataError('contract_machines')   // P0-7

  // N6 — cargar TODOS los relevés de las máquinas implicadas en UNA query (evita N+1).
  // P0-3: traemos contract_id para atribuir cada relevé a su línea/contrato (no por máquina).
  const machineIds = [...new Set((lines ?? []).map(l => l.machine_id).filter((id): id is string => !!id))]
  const { data: allCounters, error: countersErr } = machineIds.length
    ? await admin
        .from('machine_counters')
        .select('id, machine_id, contract_id, year, month, day, counter_bw, counter_color, status, is_replacement_start, previous_machine_id, annulation_reason, annule_at, notes, recorded_at')
        .in('machine_id', machineIds)
    : { data: [] as CounterRow[], error: null }
  if (countersErr) throw new BillingDataError('machine_counters')   // P0-7

  const countersByMachine = new Map<string, CounterRow[]>()
  for (const c of (allCounters ?? []) as CounterRow[]) {
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

    // P0-3: de todos los relevés de la máquina, esta línea solo ve los de SU contrato
    // (o heredados sin atribuir que caen en su intervalo de vigencia).
    const machineCounters = countersByMachine.get(line.machine_id) ?? []
    const lc = line as unknown as LineCounters
    const counters = countersForLine(contract.id, lc.date_debut, lc.date_fin, machineCounters)
    const { delta_bw, delta_color, is_estimated } = computeLineConsumption(
      lc, counters, year, month, periodStart, periodEnd,
    )

    const amounts = calculateMonthlyAmount(tariff, delta_bw, delta_color)

    draftLines.push({
      cm_id:          line.id,
      replaces_cm_id: (line as unknown as { replaces_contract_machine_id: string | null }).replaces_contract_machine_id ?? null,
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

  // Post-process: fusionar las líneas encadenadas de un mismo puesto de servicio en una
  // sola línea (un único forfait, tramos sobre el consumo consolidado). Resuelve la cadena
  // completa (A→B→C…) de forma determinista, independientemente del orden del array,
  // siguiendo replaces_cm_id hasta la raíz presente en el draft.
  const lineById = new Map<string, DraftLine>()
  for (const l of draftLines) lineById.set(l.cm_id, l)

  // Una línea es "reemplazada en el draft" si alguna otra del draft la apunta vía replaces_cm_id.
  const isReplacedInDraft = new Set<string>()
  for (const l of draftLines) {
    if (l.replaces_cm_id && lineById.has(l.replaces_cm_id)) isReplacedInDraft.add(l.replaces_cm_id)
  }

  const discarded = new Set<string>()
  for (const head of draftLines) {
    // La cabeza del puesto es la línea final de la cadena: nadie la reemplaza en el draft
    // y tiene al menos un eslabón previo presente (hubo reemplazo en este periodo).
    if (isReplacedInDraft.has(head.cm_id)) continue
    if (!head.replaces_cm_id || !lineById.has(head.replaces_cm_id)) continue

    // Recolectar la cadena cabeza→raíz y luego invertir a raíz→cabeza.
    const chain: DraftLine[] = [head]
    let cur = head
    while (cur.replaces_cm_id && lineById.has(cur.replaces_cm_id)) {
      const prev = lineById.get(cur.replaces_cm_id)!
      if (chain.includes(prev)) break   // guarda contra ciclos accidentales
      chain.push(prev)
      cur = prev
    }
    chain.reverse()

    // Capturar el desglose con los deltas ORIGINALES antes de sobrescribir la cabeza.
    const breakdown = chain.map(l => ({
      machine_label: l.machine_label, delta_bw: l.delta_bw, delta_color: l.delta_color,
    }))
    const merged_bw    = chain.reduce((s, l) => s + l.delta_bw,    0)
    const merged_color = chain.reduce((s, l) => s + l.delta_color, 0)
    const anyEstimated = chain.some(l => l.is_estimated)

    // Tarifa del puesto = la de la cabeza (línea entrante final). Un solo forfait,
    // tramos aplicados una sola vez sobre el consumo consolidado.
    const tariff: EffectiveTariff = {
      type:        head.billing_type as BillingType,
      fixed_fee:   head.fixed_fee ?? 0,
      price_bw:    head.price_bw,
      price_color: head.price_color,
      tiers:       head.tiers as BillingTier[] | null,
    }
    const amounts = calculateMonthlyAmount(tariff, merged_bw, merged_color)

    head.delta_bw     = merged_bw
    head.delta_color  = merged_color
    head.is_estimated = anyEstimated
    head.amount_fixed = amounts.amount_fixed
    head.amount_bw    = amounts.amount_bw
    head.amount_color = amounts.amount_color
    head.amount_total = amounts.amount_total
    head.breakdown    = breakdown

    for (const l of chain) if (l.cm_id !== head.cm_id) discarded.add(l.cm_id)
  }

  const mergedLines = draftLines.filter(l => !discarded.has(l.cm_id))
  const has_replacement = mergedLines.some(l => l.breakdown !== undefined)

  mergedLines.sort((a, b) =>
    a.numero_contrat.localeCompare(b.numero_contrat) || a.machine_label.localeCompare(b.machine_label))

  return {
    client_id:    client.id,
    client_name:  client.nom_client,
    period_year:  year,
    period_month: month,
    lines:        mergedLines,
    total_amount: mergedLines.reduce((s, l) => s + l.amount_total, 0),
    has_estimated: mergedLines.some(l => l.is_estimated),
    has_replacement,
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

  const { data, error } = await admin
    .from('contract_machines')
    .select('contracts!inner ( clients!inner ( id, nom_client ) )')
    .not('billing_plan_id', 'is', null)
    .lte('date_debut', periodEnd)
    .or(`date_fin.is.null,date_fin.gte.${periodStart}`)
  if (error) throw new BillingDataError('contract_machines')   // P0-7: fallo técnico → bloquear

  const map = new Map<number, string>()
  for (const row of data ?? []) {
    const c = (row.contracts as unknown as { clients: { id: number; nom_client: string } }).clients
    if (c) map.set(c.id, c.nom_client)
  }
  return [...map.entries()].map(([id, nom_client]) => ({ id, nom_client }))
    .sort((a, b) => a.nom_client.localeCompare(b.nom_client))
}
