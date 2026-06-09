import { createAdminClient } from '@/lib/supabase/admin'
import { counterDelta, type Counter } from '@/lib/counters'
import {
  resolveEffectiveTariff,
  resolveEffectiveTariffAsOf,
  calculateMonthlyAmount,
  type ContractMachineWithBilling,
  type EffectiveTariff,
  type BillingType,
  type BillingTier,
  type TariffVersion,
  type OverrideVersion,
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
 *     intervalo de vigencia de la línea (lineDebut, lineFin]. Evita que dos contratos que
 *     compartieron la máquina se roben relevés antiguos sin atribuir.
 *
 * Límite INFERIOR exclusivo (d > lineDebut), superior inclusivo (d <= lineFin): es dinero, así
 * que en el día-frontera entre una línea que cierra (date_fin=X) y otra que abre (date_debut=X)
 * de la misma máquina, un relevé legacy fechado exactamente en X se atribuye SOLO a la línea que
 * cierra (X <= date_fin), nunca a ambas. Invariante de no-solapamiento (ver test).
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
      return d > lineDebut && (lineFin === null || d <= lineFin)
    }
    return false
  })
}

/**
 * BLOQUE E / regla 9 — ciclo de facturación por ANIVERSARIO del contrato.
 * El periodo NO es el mes natural: va del `billing_day` del contrato al día anterior del mismo
 * día del mes siguiente (ej. day=4, ancla enero → [2026-01-04, 2026-02-03]).
 * Caso fin de mes: si el `billing_day` no existe en un mes (ej. 31 en febrero) → último día del
 * mes (clamp). El ciclo "ancla" en (anchorYear, anchorMonth) = el mes en que CAE su inicio.
 * Devuelve fechas ISO (YYYY-MM-DD) inclusivas en ambos extremos.
 */
export function computeBillingCycle(
  billingDay: number,
  anchorYear: number,
  anchorMonth: number,   // 1-based
): { start: string; end: string } {
  const daysInMonth = (y: number, m: number) => new Date(y, m, 0).getDate()  // m 1-based
  const clampDay = (y: number, m: number, d: number) => {
    const dd = Math.min(d, daysInMonth(y, m))
    return `${y}-${String(m).padStart(2, '0')}-${String(dd).padStart(2, '0')}`
  }

  const start = clampDay(anchorYear, anchorMonth, billingDay)

  const nextMonth = anchorMonth === 12 ? 1 : anchorMonth + 1
  const nextYear  = anchorMonth === 12 ? anchorYear + 1 : anchorYear
  const nextStart = clampDay(nextYear, nextMonth, billingDay)

  // end = día anterior al inicio del ciclo siguiente.
  const [ny, nm, nd] = nextStart.split('-').map(Number)
  const e = new Date(ny, nm - 1, nd - 1)
  const end = `${e.getFullYear()}-${String(e.getMonth() + 1).padStart(2, '0')}-${String(e.getDate()).padStart(2, '0')}`

  return { start, end }
}

/**
 * BLOQUE D / P1-6 — una línea es facturable según el estado del contrato y de la línea.
 *  - 'suspendu' (contrato O línea) → NO factura (servicio pausado, decisión del dueño).
 *  - 'terminé' NO se filtra por statut: lo gobierna date_fin (el filtro de periodo factura su
 *    mes de cierre — retirada a stock / reemplazo, H-D6 — y la excluye después). EXCEPTO el
 *    caso borde de un contrato 'terminé' con una línea aún abierta (date_fin NULL): esa línea
 *    huérfana se excluye para que un contrato terminado no facture sin fin.
 */
export function isLineBillable(
  lineStatut: string | null,
  contractStatut: string | null,
  lineDateFin: string | null,
): boolean {
  if (contractStatut === 'suspendu') return false
  if (lineStatut === 'suspendu') return false
  if (contractStatut === 'terminé' && lineDateFin === null) return false
  return true
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

/**
 * BLOQUE E — borrador de factura por CONTRATO y CICLO de aniversario (regla 9).
 * Todas las máquinas del contrato van en una sola factura del ciclo [period_start, period_end].
 * period_year/period_month son el MES-ANCLA (mes en que cae el inicio del ciclo), para
 * etiquetado y no-duplicado; la verdad del periodo son period_start/period_end.
 */
export type ContractDraft = {
  contract_id: string
  numero_contrat: string
  client_id: number
  client_name: string
  billing_day: number
  period_start: string
  period_end: string
  period_year: number       // mes-ancla
  period_month: number      // mes-ancla
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
 * BLOQUE E — consumo facturable de UNA línea en un CICLO de aniversario [periodStart, periodEnd]
 * (fechas ISO inclusivas). Variante de computeLineConsumption que filtra los relevés por su
 * FECHA real (counterDate), no por mes natural, porque un ciclo cruza dos meses.
 *  - lectura_final: si la línea se cerró por reemplazo DENTRO del ciclo → end_counter; si no →
 *    el relevé activo más reciente cuya fecha cae dentro del ciclo (la captura del billing_day).
 *  - lectura_inicial: si la línea empezó DENTRO del ciclo con start_counter → start_counter; si
 *    venía de antes → el relevé activo más reciente con fecha ANTERIOR al inicio del ciclo
 *    (la captura del billing_day del ciclo previo).
 * Falta de punto o delta negativo → línea estimada (solo forfait). Misma política que el mensual.
 */
export function computeLineConsumptionCycle(
  line: LineCounters,
  counters: Counter[],
  periodStart: string,
  periodEnd: string,
): { delta_bw: number; delta_color: number; is_estimated: boolean } {
  const inCycle = (d: string | null): boolean => d !== null && d >= periodStart && d <= periodEnd
  const ESTIMATED = { delta_bw: 0, delta_color: 0, is_estimated: true }

  // Lectura final dentro del ciclo.
  let finalBw: number | null = null
  let finalColor: number | null = null
  const closedByReplacementInCycle =
    line.date_fin !== null && inCycle(line.date_fin) &&
    line.end_counter_bw !== null && line.end_counter_color !== null   // H-D7: ambos puntos

  if (closedByReplacementInCycle) {
    finalBw    = line.end_counter_bw
    finalColor = line.end_counter_color
  } else {
    const inCycleReading = counters
      .filter(c => c.status === 'actif' && inCycle(counterDate(c)))
      .sort((a, b) => counterDate(b).localeCompare(counterDate(a)) || b.recorded_at.localeCompare(a.recorded_at))[0]
    if (inCycleReading) {
      finalBw    = inCycleReading.counter_bw
      finalColor = inCycleReading.counter_color
    }
  }

  // Lectura inicial.
  let initBw: number | null = null
  let initColor: number | null = null
  if (inCycle(line.date_debut)) {
    if (line.start_counter_bw !== null) {
      initBw    = line.start_counter_bw
      initColor = line.start_counter_color
    }
    // primer ciclo de línea normal (sin start_counter) → sin base previa
  } else {
    const prev = counters
      .filter(c => c.status === 'actif' && counterDate(c) < periodStart)
      .sort((a, b) => counterDate(b).localeCompare(counterDate(a)) || b.recorded_at.localeCompare(a.recorded_at))[0]
    if (prev) {
      initBw    = prev.counter_bw
      initColor = prev.counter_color
    }
  }

  const delta_bw    = counterDelta(finalBw, initBw)
  const delta_color = counterDelta(finalColor, initColor)
  if (delta_bw === null || delta_color === null) return ESTIMATED
  if (delta_bw < 0 || delta_color < 0) return ESTIMATED
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
      id, machine_id, billing_plan_id, date_debut, date_fin, statut,
      replaces_contract_machine_id,
      start_counter_bw, start_counter_color, end_counter_bw, end_counter_color,
      price_bw_override, price_color_override, fixed_fee_override,
      billing_plans ( id, name, type, fixed_fee, price_bw, price_color, tiers ),
      machines ( numero_serie, marque, modele ),
      contracts!inner ( id, numero_contrat, client_id, statut )
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

    const contract = line.contracts as unknown as { id: string; numero_contrat: string; statut: string | null } | null
    const machine  = line.machines  as unknown as { numero_serie: string; marque: string; modele: string } | null
    const plan     = line.billing_plans as unknown as { name: string } | null
    if (!contract || !line.machine_id) continue

    // P1-6: excluir líneas/contratos suspendidos y la línea huérfana abierta de un contrato terminé.
    const lineStatut = (line as unknown as { statut: string | null }).statut
    const lineFin    = (line as unknown as { date_fin: string | null }).date_fin
    if (!isLineBillable(lineStatut, contract.statut, lineFin)) continue

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

  const { lines: mergedLines, has_replacement } = consolidateReplacements(draftLines)

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
 * Consolidación del PUESTO DE SERVICIO: fusiona las líneas encadenadas por reemplazo (A→B→C…)
 * en una sola línea (un único forfait, tramos sobre el consumo consolidado), de forma
 * determinista e independiente del orden del array. Helper compartido por el draft mensual
 * (cliente) y el draft por ciclo (contrato) — una sola implementación para no divergir (P2-8).
 */
function consolidateReplacements(draftLines: DraftLine[]): { lines: DraftLine[]; has_replacement: boolean } {
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

  return { lines: mergedLines, has_replacement }
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
    .select('statut, date_fin, contracts!inner ( statut, clients!inner ( id, nom_client ) )')
    .not('billing_plan_id', 'is', null)
    .lte('date_debut', periodEnd)
    .or(`date_fin.is.null,date_fin.gte.${periodStart}`)
  if (error) throw new BillingDataError('contract_machines')   // P0-7: fallo técnico → bloquear

  const map = new Map<number, string>()
  for (const row of data ?? []) {
    const r = row as unknown as {
      statut: string | null
      date_fin: string | null
      contracts: { statut: string | null; clients: { id: number; nom_client: string } }
    }
    // P1-6: mismo filtro de facturabilidad que buildClientInvoiceDraft (suspendu / terminé huérfano).
    if (!isLineBillable(r.statut, r.contracts?.statut ?? null, r.date_fin)) continue
    const c = r.contracts?.clients
    if (c) map.set(c.id, c.nom_client)
  }
  return [...map.entries()].map(([id, nom_client]) => ({ id, nom_client }))
    .sort((a, b) => a.nom_client.localeCompare(b.nom_client))
}

/**
 * BLOQUE E — borrador de factura por CONTRATO para el ciclo de aniversario que ANCLA en
 * (anchorYear, anchorMonth). El periodo se deriva del billing_day del contrato (regla 9),
 * NO del mes natural. Todas las máquinas del contrato van en una sola factura del ciclo.
 * Si el contrato no tiene billing_day → día 1 (mes natural), documentado.
 */
export async function buildContractInvoiceDraft(
  contractId: string,
  anchorYear: number,
  anchorMonth: number,
): Promise<ContractDraft | null> {
  const admin = createAdminClient()

  const { data: contract, error: contractErr } = await admin
    .from('contracts')
    .select('id, numero_contrat, client_id, billing_day, statut, clients!inner ( id, nom_client )')
    .eq('id', contractId)
    .maybeSingle()
  if (contractErr) throw new BillingDataError('contracts')   // P0-7
  if (!contract) return null

  const client = contract.clients as unknown as { id: number; nom_client: string }
  const billingDay = (contract.billing_day as number | null) ?? 1
  const { start: periodStart, end: periodEnd } = computeBillingCycle(billingDay, anchorYear, anchorMonth)

  const { data: lines, error: linesErr } = await admin
    .from('contract_machines')
    .select(`
      id, machine_id, billing_plan_id, date_debut, date_fin, statut,
      replaces_contract_machine_id,
      start_counter_bw, start_counter_color, end_counter_bw, end_counter_color,
      price_bw_override, price_color_override, fixed_fee_override,
      billing_plans ( id, name, type, fixed_fee, price_bw, price_color, tiers ),
      machines ( numero_serie, marque, modele )
    `)
    .not('billing_plan_id', 'is', null)
    .eq('contract_id', contractId)
    .lte('date_debut', periodEnd)
    .or(`date_fin.is.null,date_fin.gte.${periodStart}`)
  if (linesErr) throw new BillingDataError('contract_machines')   // P0-7

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

  // P1-5: cargar el historial de tarifas (plan + overrides) para resolver los precios VIGENTES
  // al inicio del ciclo facturado, no los actuales. (Las facturas emitidas ya son snapshot.)
  const planIds = [...new Set((lines ?? []).map(l => l.billing_plan_id).filter((id): id is string => !!id))]
  const cmIds   = (lines ?? []).map(l => l.id)

  const { data: planVersionsRaw, error: pvErr } = planIds.length
    ? await admin
        .from('billing_plan_versions')
        .select('plan_id, effective_from, type, fixed_fee, price_bw, price_color, tiers')
        .in('plan_id', planIds)
    : { data: [] as (TariffVersion & { plan_id: string })[], error: null }
  if (pvErr) throw new BillingDataError('billing_plan_versions')   // P0-7

  const { data: ovVersionsRaw, error: ovErr } = cmIds.length
    ? await admin
        .from('contract_machine_override_versions')
        .select('contract_machine_id, effective_from, price_bw_override, price_color_override, fixed_fee_override')
        .in('contract_machine_id', cmIds)
    : { data: [] as (OverrideVersion & { contract_machine_id: string })[], error: null }
  if (ovErr) throw new BillingDataError('contract_machine_override_versions')   // P0-7

  const planVersionsByPlan = new Map<string, TariffVersion[]>()
  for (const v of (planVersionsRaw ?? []) as (TariffVersion & { plan_id: string })[]) {
    const arr = planVersionsByPlan.get(v.plan_id) ?? []
    arr.push(v)
    planVersionsByPlan.set(v.plan_id, arr)
  }
  const ovVersionsByCm = new Map<string, OverrideVersion[]>()
  for (const v of (ovVersionsRaw ?? []) as (OverrideVersion & { contract_machine_id: string })[]) {
    const arr = ovVersionsByCm.get(v.contract_machine_id) ?? []
    arr.push(v)
    ovVersionsByCm.set(v.contract_machine_id, arr)
  }

  const contractStatut = contract.statut as string | null
  const draftLines: DraftLine[] = []

  for (const line of lines ?? []) {
    // P1-5: tarifa vigente al inicio del ciclo (period_start). Fallback al precio actual del
    // plan embebido si, por lo que sea, no hubiera historial (no debería tras el backfill).
    const planVersions = line.billing_plan_id ? (planVersionsByPlan.get(line.billing_plan_id) ?? []) : []
    const ovVersions   = ovVersionsByCm.get(line.id) ?? []
    const tariff =
      resolveEffectiveTariffAsOf(planVersions, ovVersions, periodStart)
      ?? resolveEffectiveTariff(line as unknown as ContractMachineWithBilling)
    if (!tariff) continue

    const machine = line.machines as unknown as { numero_serie: string; marque: string; modele: string } | null
    const plan    = line.billing_plans as unknown as { name: string } | null
    if (!line.machine_id) continue

    // P1-6: excluir líneas suspendidas / huérfanas de contrato terminé.
    const lineStatut = (line as unknown as { statut: string | null }).statut
    const lc = line as unknown as LineCounters
    if (!isLineBillable(lineStatut, contractStatut, lc.date_fin)) continue

    // P0-3: atribución por contrato. Consumo del CICLO (no del mes natural).
    const machineCounters = countersByMachine.get(line.machine_id) ?? []
    const counters = countersForLine(contractId, lc.date_debut, lc.date_fin, machineCounters)
    const { delta_bw, delta_color, is_estimated } = computeLineConsumptionCycle(
      lc, counters, periodStart, periodEnd,
    )

    const amounts = calculateMonthlyAmount(tariff, delta_bw, delta_color)

    draftLines.push({
      cm_id:          line.id,
      replaces_cm_id: (line as unknown as { replaces_contract_machine_id: string | null }).replaces_contract_machine_id ?? null,
      contract_id:    contractId,
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

  const { lines: mergedLines, has_replacement } = consolidateReplacements(draftLines)

  return {
    contract_id:   contract.id,
    numero_contrat: contract.numero_contrat,
    client_id:     client.id,
    client_name:   client.nom_client,
    billing_day:   billingDay,
    period_start:  periodStart,
    period_end:    periodEnd,
    period_year:   Number(periodStart.slice(0, 4)),
    period_month:  Number(periodStart.slice(5, 7)),
    lines:         mergedLines,
    total_amount:  mergedLines.reduce((s, l) => s + l.amount_total, 0),
    has_estimated: mergedLines.some(l => l.is_estimated),
    has_replacement,
  }
}

/**
 * BLOQUE E — contratos con al menos una línea facturable cuya vigencia toca el ciclo que ancla
 * en (anchorYear, anchorMonth). Cada contrato calcula su propio ciclo desde su billing_day, así
 * que aquí se hace un primer filtrado amplio (cualquier línea abierta o cerrada recientemente) y
 * el cálculo fino del ciclo lo hace buildContractInvoiceDraft.
 */
export async function listBillableContracts(
  anchorYear: number,
  anchorMonth: number,
): Promise<{ id: string; numero_contrat: string; client_name: string }[]> {
  const admin = createAdminClient()
  // Ventana amplia: el ciclo de cualquier billing_day que ancle en este mes cae dentro de
  // [primer día del mes-ancla, último día del mes siguiente]. Filtrado fino en el draft.
  const windowStart = `${anchorYear}-${String(anchorMonth).padStart(2, '0')}-01`
  const nextMonth = anchorMonth === 12 ? 1 : anchorMonth + 1
  const nextYear  = anchorMonth === 12 ? anchorYear + 1 : anchorYear
  const windowEnd = `${nextYear}-${String(nextMonth).padStart(2, '0')}-${String(new Date(nextYear, nextMonth, 0).getDate()).padStart(2, '0')}`

  const { data, error } = await admin
    .from('contract_machines')
    .select('statut, date_fin, contracts!inner ( id, numero_contrat, statut, clients!inner ( nom_client ) )')
    .not('billing_plan_id', 'is', null)
    .lte('date_debut', windowEnd)
    .or(`date_fin.is.null,date_fin.gte.${windowStart}`)
  if (error) throw new BillingDataError('contract_machines')   // P0-7

  const map = new Map<string, { id: string; numero_contrat: string; client_name: string }>()
  for (const row of data ?? []) {
    const r = row as unknown as {
      statut: string | null
      date_fin: string | null
      contracts: { id: string; numero_contrat: string; statut: string | null; clients: { nom_client: string } }
    }
    if (!isLineBillable(r.statut, r.contracts?.statut ?? null, r.date_fin)) continue
    const c = r.contracts
    if (c) map.set(c.id, { id: c.id, numero_contrat: c.numero_contrat, client_name: c.clients?.nom_client ?? '—' })
  }
  return [...map.values()].sort((a, b) => a.numero_contrat.localeCompare(b.numero_contrat))
}
