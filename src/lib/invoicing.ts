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
 * Mínimo y máximo de una lista de fechas ISO (descarta null). Usado para el RANGO ENVOLVENTE de
 * una tanda de lecturas (apertura más temprana → cierre más tardío). Las fechas ISO YYYY-MM-DD
 * ordenan correctamente de forma lexicográfica.
 */
function dateBounds(dates: (string | null)[]): { min: string | null; max: string | null } {
  const xs = dates.filter((d): d is string => !!d).sort()
  return { min: xs[0] ?? null, max: xs[xs.length - 1] ?? null }
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
 * FORMA B / regla del mes — etiqueta de mes facturado de una lectura de cierre.
 * AMD factura por PERIODO ENTRE LECTURAS REALES (no por ciclo de calendario). Cada lectura de
 * cierre "cierra" un mes; el mes facturado es el mes ANTERIOR al VENCIMIENTO (billing_day del
 * cliente) más cercano a la fecha de la lectura. Así, una recogida que cae unos días antes o
 * después del día de facturación cierra igualmente el mes correcto.
 *   - billing_day=1, cierre 03-jun → vencimiento más cercano 01-jun → mes facturado = MAYO.
 *   - billing_day=1, cierre 29-abr → vencimiento más cercano 01-may → mes facturado = ABRIL.
 *   - billing_day=20, cierre 20-may → vencimiento 20-may → mes facturado = ABRIL.
 *
 * TIE-BREAK (B4): si la fecha de cierre cae a igual distancia de dos vencimientos consecutivos,
 * se elige el vencimiento PASADO (el más temprano) — la recogida cierra el mes que acaba de
 * terminar. Es determinista (orden de iteración anterior→mismo→siguiente con `<` estricto).
 *
 * ÁMBITO (B3): pensado para `billing_day` 1–28, que existen en todos los meses y quedan espaciados
 * de forma regular (~1 mes) → la heurística de "vencimiento más cercano" es robusta. Para 29–31 el
 * clamp de fin de mes vuelve irregular el espaciado (p. ej. en febrero) y una recogida a mitad de
 * mes podría etiquetarse a un mes contiguo: el soporte "fin de mes" se decidirá con el cliente si
 * aparece un contrato así (regla de negocio a validar, no inventar). Hoy AMD usa días 1/6/12/20.
 * La validación del rango 1–28 se añadirá en el formulario de contrato (Fase 2).
 * Spec: docs/superpowers/specs/2026-06-16-facturacion-periodo-a-medida-design.md §4.3, §13 (B3/B4).
 */
export function computeInvoiceMonth(
  billingDay: number,
  closingDateISO: string,
): { year: number; month: number } {
  const [cy, cm, cd] = closingDateISO.split('-').map(Number)
  const daysInMonth = (y: number, m: number) => new Date(y, m, 0).getDate()  // m 1-based
  const clampDay = (y: number, m: number) => Math.min(billingDay, daysInMonth(y, m))
  const closeTime = Date.UTC(cy, cm - 1, cd)

  // Vencimientos candidatos: el billing_day del mes anterior, del mismo mes y del siguiente.
  // Orden anterior→mismo→siguiente: con `<` estricto, un empate de distancia se queda con el
  // candidato PASADO (el primero hallado a la distancia mínima) → tie-break hacia el mes terminado.
  const candidates: { y: number; m: number }[] = [
    { y: cm === 1  ? cy - 1 : cy, m: cm === 1  ? 12 : cm - 1 },
    { y: cy,                      m: cm },
    { y: cm === 12 ? cy + 1 : cy, m: cm === 12 ? 1  : cm + 1 },
  ]

  let best = candidates[1]
  let bestDist = Infinity
  for (const c of candidates) {
    const vTime = Date.UTC(c.y, c.m - 1, clampDay(c.y, c.m))
    const dist = Math.abs(vTime - closeTime)
    if (dist < bestDist) { bestDist = dist; best = c }
  }

  // Mes facturado = mes anterior al mes del vencimiento elegido.
  return best.m === 1 ? { year: best.y - 1, month: 12 } : { year: best.y, month: best.m - 1 }
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
  /** FORMA B — fechas reales del periodo de ESTA línea (pueden variar entre máquinas). */
  open_date: string | null
  close_date: string | null
  amount_fixed: number
  amount_bw: number
  amount_color: number
  amount_total: number
  breakdown?: { machine_label: string; delta_bw: number; delta_color: number }[]
}

/**
 * FORMA B — borrador de factura por CONTRATO y mes facturado. El periodo NO es un ciclo de
 * calendario: es el RANGO ENVOLVENTE de las lecturas reales de la tanda (apertura más temprana
 * → cierre más tardío). period_year/period_month son el mes facturado (derivado de las lecturas).
 */
export type ContractDraft = {
  contract_id: string
  numero_contrat: string
  client_id: number
  client_name: string
  billing_day: number
  period_start: string
  period_end: string
  period_year: number       // mes facturado
  period_month: number      // mes facturado
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

export type LineConsumption = {
  delta_bw: number
  delta_color: number
  is_estimated: boolean
  open_date: string | null
  close_date: string | null
}

/**
 * FORMA B — consumo facturable de UNA línea para el MES facturado (targetYear/targetMonth),
 * usando las LECTURAS REALES (no un ciclo de calendario).
 *  - lectura de cierre: si la línea se cerró por reemplazo y su date_fin cae en el mes objetivo
 *    (con ambos end_counter) → el end_counter en date_fin; si no → el relevé activo más reciente
 *    cuya etiqueta de mes (computeInvoiceMonth) sea el mes objetivo.
 *  - lectura de apertura: el relevé activo inmediatamente anterior a la fecha de cierre; si no hay
 *    ninguno pero la línea nació con start_counter (date_debut < cierre) → el start_counter.
 * Sin cierre etiquetado en el mes → close_date null (la línea NO pertenece a la tanda de este mes).
 * Falta apertura o delta negativo → estimada (solo forfait), conservando close_date.
 * Spec §4.1.
 */
export function computeLineConsumptionByReadings(
  line: LineCounters,
  counters: Counter[],
  targetYear: number,
  targetMonth: number,
  billingDay: number,
): LineConsumption {
  const active = counters.filter(c => c.status === 'actif')
  const isTargetMonth = (iso: string) => {
    const m = computeInvoiceMonth(billingDay, iso)
    return m.year === targetYear && m.month === targetMonth
  }
  // Orden total de relevés por (fecha real, recorded_at) — recorded_at desempata cuando dos
  // relevés caen el mismo día calendario (B2). Descendente: el [0] es el más reciente.
  const byRecencyDesc = (a: Counter, b: Counter) =>
    counterDate(b).localeCompare(counterDate(a)) || b.recorded_at.localeCompare(a.recorded_at)

  // Lectura de cierre.
  let closeBw: number | null = null
  let closeColor: number | null = null
  let closeDate: string | null = null
  let closeRecordedAt = ''   // recorded_at del relevé de cierre; '' para reemplazo (excluye su mismo día)

  const closedByReplacement =
    line.date_fin !== null && isTargetMonth(line.date_fin) &&
    line.end_counter_bw !== null && line.end_counter_color !== null   // H-D7: ambos puntos

  if (closedByReplacement) {
    closeBw = line.end_counter_bw
    closeColor = line.end_counter_color
    closeDate = line.date_fin
    // El end_counter de un reemplazo no tiene recorded_at propio; mantenemos '' para que la
    // apertura solo considere relevés de FECHA estrictamente anterior a date_fin (conservador).
  } else {
    const closing = active.filter(c => isTargetMonth(counterDate(c))).sort(byRecencyDesc)[0]
    if (closing) {
      closeBw = closing.counter_bw
      closeColor = closing.counter_color
      closeDate = counterDate(closing)
      closeRecordedAt = closing.recorded_at
    }
  }

  // Sin lectura de cierre etiquetada en el mes → la línea no pertenece a la tanda de este mes.
  if (closeDate === null) {
    return { delta_bw: 0, delta_color: 0, is_estimated: true, open_date: null, close_date: null }
  }

  // Lectura de apertura: el relevé activo inmediatamente ANTERIOR al cierre en el orden total
  // (fecha, recorded_at). Comparar por la clave compuesta evita perder un relevé del mismo día
  // que el cierre con recorded_at anterior (B2).
  const before = (c: Counter) => {
    const cd = counterDate(c)
    return cd < closeDate! || (cd === closeDate && c.recorded_at < closeRecordedAt)
  }
  let openBw: number | null = null
  let openColor: number | null = null
  let openDate: string | null = null

  const prev = active.filter(before).sort(byRecencyDesc)[0]
  if (prev) {
    openBw = prev.counter_bw
    openColor = prev.counter_color
    openDate = counterDate(prev)
  } else if (line.start_counter_bw !== null && line.start_counter_color !== null && line.date_debut <= closeDate) {
    // Máquina nueva: su lectura inicial es la apertura de su primera factura. `<=` admite el caso
    // de instalación y primera lectura el MISMO día (B1).
    openBw = line.start_counter_bw
    openColor = line.start_counter_color
    openDate = line.date_debut
  }

  const delta_bw = counterDelta(closeBw, openBw)
  const delta_color = counterDelta(closeColor, openColor)
  if (delta_bw === null || delta_color === null) {
    return { delta_bw: 0, delta_color: 0, is_estimated: true, open_date: openDate, close_date: closeDate }
  }
  if (delta_bw < 0 || delta_color < 0) {
    return { delta_bw: 0, delta_color: 0, is_estimated: true, open_date: openDate, close_date: closeDate }
  }
  return { delta_bw, delta_color, is_estimated: false, open_date: openDate, close_date: closeDate }
}

/**
 * Consolidación del PUESTO DE SERVICIO: fusiona las líneas encadenadas por reemplazo (A→B→C…)
 * en una sola línea (un único forfait, tramos sobre el consumo consolidado), de forma
 * determinista e independiente del orden del array.
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
    // El periodo consolidado abarca de la apertura más temprana al cierre más tardío de la cadena.
    head.open_date    = dateBounds(chain.map(l => l.open_date)).min  ?? head.open_date
    head.close_date   = dateBounds(chain.map(l => l.close_date)).max ?? head.close_date

    for (const l of chain) if (l.cm_id !== head.cm_id) discarded.add(l.cm_id)
  }

  const mergedLines = draftLines.filter(l => !discarded.has(l.cm_id))
  const has_replacement = mergedLines.some(l => l.breakdown !== undefined)

  mergedLines.sort((a, b) =>
    a.numero_contrat.localeCompare(b.numero_contrat) || a.machine_label.localeCompare(b.machine_label))

  return { lines: mergedLines, has_replacement }
}

/**
 * FORMA B — borrador de factura por CONTRATO para el MES facturado (targetYear, targetMonth).
 * El periodo se deriva de las LECTURAS REALES de la tanda de ese mes, no de un ciclo de calendario.
 * Devuelve null si el contrato no existe o no hay ninguna lectura de cierre etiquetada en el mes
 * (no hay tanda que facturar). Las máquinas activas sin lectura ese mes ("mudas") entran estimadas
 * (forfait) solo si SÍ hay tanda. Spec §5.1.
 */
export async function buildContractInvoiceDraft(
  contractId: string,
  targetYear: number,
  targetMonth: number,
): Promise<ContractDraft | null> {
  const admin = createAdminClient()

  const { data: contract, error: contractErr } = await admin
    .from('contracts')
    .select('id, numero_contrat, client_id, billing_day, statut, clients!inner ( id, nom_client )')
    .eq('id', contractId)
    .maybeSingle()
  if (contractErr) throw new BillingDataError('contracts')   // P0-7
  if (!contract) return null

  const client = contract.clients
  const billingDay = contract.billing_day ?? 1

  // Cargar TODAS las líneas con plan del contrato (sin filtro de calendario: el mes lo decide el
  // etiquetado de las lecturas). isLineBillable filtra suspendidas/huérfanas.
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

  // P1-5: historial de tarifas (plan + overrides) para resolver el precio VIGENTE a la fecha de
  // apertura de cada línea (las facturas emitidas ya son snapshot).
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

  // Primera pasada: consumo por línea (solo facturables). Mes-fallback para tarifa de estimadas.
  const monthFallback = `${targetYear}-${String(targetMonth).padStart(2, '0')}-01`
  type Computed = { line: typeof lines[number]; cons: LineConsumption }
  const computed: Computed[] = []
  for (const line of lines ?? []) {
    if (!line.machine_id) continue
    if (!isLineBillable(line.statut, contractStatut, line.date_fin)) continue
    const machineCounters = countersByMachine.get(line.machine_id) ?? []
    const counters = countersForLine(contractId, line.date_debut, line.date_fin, machineCounters)
    const cons = computeLineConsumptionByReadings(line, counters, targetYear, targetMonth, billingDay)
    computed.push({ line, cons })
  }

  // ¿Hay tanda este mes? (alguna línea con lectura de cierre etiquetada en el mes objetivo).
  // maxCloseDate = cierre más tardío de la tanda → referencia para decidir qué máquinas mudas
  // estaban ya activas cuando se hizo la recogida (las que entraron DESPUÉS no se facturan aún).
  const { max: maxCloseDate } = dateBounds(computed.map(c => c.cons.close_date))
  if (maxCloseDate === null) return null   // no hay tanda → nada que facturar este mes

  const draftLines: DraftLine[] = []
  for (const { line, cons } of computed) {
    // Línea sin cierre este mes ("muda"): solo entra como estimada si (a) sigue activa (abierta) y
    // (b) ya estaba en el contrato cuando se hizo la recogida (date_debut <= cierre de la tanda).
    // Una máquina añadida DESPUÉS de la tanda, o una línea ya cerrada, NO pertenecen a este mes.
    if (cons.close_date === null) {
      if (line.date_fin !== null) continue
      if (line.date_debut > maxCloseDate) continue
    }

    const asOf = cons.open_date ?? cons.close_date ?? monthFallback
    const planVersions = line.billing_plan_id ? (planVersionsByPlan.get(line.billing_plan_id) ?? []) : []
    const ovVersions   = ovVersionsByCm.get(line.id) ?? []
    const tariff =
      resolveEffectiveTariffAsOf(planVersions, ovVersions, asOf)
      ?? resolveEffectiveTariff(line as ContractMachineWithBilling)
    if (!tariff) continue

    const machine = line.machines
    const plan    = line.billing_plans
    // close_date null ⇒ máquina muda ⇒ el helper ya devolvió is_estimated:true (no hace falta re-OR).
    const isEstimated = cons.is_estimated
    const amounts = calculateMonthlyAmount(tariff, cons.delta_bw, cons.delta_color)

    draftLines.push({
      cm_id:          line.id,
      replaces_cm_id: line.replaces_contract_machine_id ?? null,
      contract_id:    contractId,
      numero_contrat: contract.numero_contrat,
      machine_id:     line.machine_id!,
      machine_label:  machine ? `${machine.marque} ${machine.modele} (${machine.numero_serie})` : line.machine_id!,
      plan_name:      plan?.name ?? '—',
      billing_type:   tariff.type,
      fixed_fee:      tariff.fixed_fee,
      price_bw:       tariff.price_bw,
      price_color:    tariff.price_color,
      tiers:          tariff.tiers,
      delta_bw:       cons.delta_bw,
      delta_color:    cons.delta_color,
      is_estimated:   isEstimated,
      open_date:      cons.open_date,
      close_date:     cons.close_date,
      ...amounts,
    })
  }

  const { lines: mergedLines, has_replacement } = consolidateReplacements(draftLines)
  if (mergedLines.length === 0) return null

  // Periodo de cabecera = rango ENVOLVENTE de las lecturas reales de la tanda (spec §4.4, D1).
  const ob = dateBounds(mergedLines.map(l => l.open_date))
  const cb = dateBounds(mergedLines.map(l => l.close_date))
  const period_start = ob.min ?? cb.min ?? monthFallback
  const period_end   = cb.max ?? ob.max ?? monthFallback

  return {
    contract_id:   contract.id,
    numero_contrat: contract.numero_contrat,
    client_id:     client.id,
    client_name:   client.nom_client,
    billing_day:   billingDay,
    period_start,
    period_end,
    period_year:   targetYear,
    period_month:  targetMonth,
    lines:         mergedLines,
    total_amount:  mergedLines.reduce((s, l) => s + l.amount_total, 0),
    has_estimated: mergedLines.some(l => l.is_estimated),
    has_replacement,
  }
}

/** FORMA B — una «tanda lista para facturar»: un contrato con un mes facturado pendiente. */
export type ReadyToBillEntry = {
  contract_id: string
  numero_contrat: string
  client_name: string
  period_year: number
  period_month: number
}

/**
 * FORMA B — lista de tandas LISTAS PARA FACTURAR: por cada contrato facturable, los meses que
 * tienen al menos una lectura de cierre (etiquetada vía computeInvoiceMonth) y aún NO tienen
 * factura emise. Es el reemplazo del antiguo selector mes/año: la pantalla muestra directamente
 * «contrato — cliente · mes». El periodo y el total exactos los calcula buildContractInvoiceDraft
 * al seleccionar una entrada. Spec §5.1, §13.
 */
export async function listReadyToBill(): Promise<ReadyToBillEntry[]> {
  const admin = createAdminClient()

  // 1) Contratos facturables (≥1 línea con plan y facturable) → billing_day + nombre + cliente.
  const { data: lineRows, error: linesErr } = await admin
    .from('contract_machines')
    .select('statut, date_fin, contract_id, contracts!inner ( id, numero_contrat, billing_day, statut, clients!inner ( nom_client ) )')
    .not('billing_plan_id', 'is', null)
  if (linesErr) throw new BillingDataError('contract_machines')   // P0-7

  type ContractInfo = { numero_contrat: string; client_name: string; billing_day: number }
  const billable = new Map<string, ContractInfo>()
  for (const row of lineRows ?? []) {
    const c = row.contracts as unknown as {
      id: string; numero_contrat: string; billing_day: number | null; statut: string | null;
      clients: { nom_client: string } | null
    } | null
    if (!c) continue
    if (!isLineBillable(row.statut, c.statut, row.date_fin)) continue
    if (!billable.has(c.id)) {
      billable.set(c.id, {
        numero_contrat: c.numero_contrat,
        client_name:    c.clients?.nom_client ?? '—',
        billing_day:    c.billing_day ?? 1,
      })
    }
  }
  if (billable.size === 0) return []

  // 2) Relevés activos atribuidos a esos contratos → mes facturado de cada lectura de cierre.
  const { data: counterRows, error: cErr } = await admin
    .from('machine_counters')
    .select('contract_id, year, month, day, status')
    .eq('status', 'actif')
    .not('contract_id', 'is', null)
    .in('contract_id', [...billable.keys()])
  if (cErr) throw new BillingDataError('machine_counters')   // P0-7

  // candidatos: clave "contractId|year|month" → {contract_id, year, month}
  const candidates = new Map<string, { contract_id: string; period_year: number; period_month: number }>()
  for (const c of counterRows ?? []) {
    const info = c.contract_id ? billable.get(c.contract_id) : undefined
    if (!info || !c.contract_id) continue
    const { year, month } = computeInvoiceMonth(info.billing_day, counterDate(c))
    candidates.set(`${c.contract_id}|${year}|${month}`, { contract_id: c.contract_id, period_year: year, period_month: month })
  }
  if (candidates.size === 0) return []

  // 3) Excluir los meses ya facturados (factura emise por contrato y mes).
  const { data: issued, error: iErr } = await admin
    .from('invoices')
    .select('contract_id, period_year, period_month')
    .eq('status', 'emise')
    .not('contract_id', 'is', null)
  if (iErr) throw new BillingDataError('invoices')   // P0-7
  const issuedKeys = new Set((issued ?? []).map(i => `${i.contract_id}|${i.period_year}|${i.period_month}`))

  const entries: ReadyToBillEntry[] = []
  for (const [key, cand] of candidates) {
    if (issuedKeys.has(key)) continue
    const info = billable.get(cand.contract_id)!
    entries.push({
      contract_id:  cand.contract_id,
      numero_contrat: info.numero_contrat,
      client_name:  info.client_name,
      period_year:  cand.period_year,
      period_month: cand.period_month,
    })
  }

  // Orden: por contrato, y dentro del contrato por mes ascendente (el más antiguo primero).
  return entries.sort((a, b) =>
    a.numero_contrat.localeCompare(b.numero_contrat) ||
    a.period_year - b.period_year ||
    a.period_month - b.period_month)
}
