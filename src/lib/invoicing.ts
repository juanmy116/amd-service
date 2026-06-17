import { createAdminClient } from '@/lib/supabase/admin'
import { counterDelta, compareCountersByReading, type Counter } from '@/lib/counters'
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

/** Tipo de relevé tal y como se carga aquí: Counter + las columnas de atribución (máquina + contrato). */
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
 * P0-3 (spec v3.1, Ancla 2) — atribución del consumo por LÍNEA/PUESTO, no por máquina ni por contrato.
 * Una misma máquina (numero_serie) rota por varias líneas/contratos a lo largo del tiempo; cada
 * relevé queda ligado a su `contract_machine_id` = la línea vigente en la FECHA de la lectura
 * (lo resuelve la escritura: manual, OCR y Princity, vía getLineForMachineAtDate). Una línea solo
 * ve los relevés de SU línea:
 *   - contract_machine_id === id de la línea  → siempre.
 *   - contract_machine_id NULL (relevé heredado sin atribución) → solo si su fecha cae dentro del
 *     intervalo de vigencia de la línea (lineDebut, lineFin]. Defensivo para datos antiguos; en prod
 *     no hay relevés sin atribuir (0 contadores al migrar).
 *
 * Límite INFERIOR exclusivo (d > lineDebut), superior inclusivo (d <= lineFin): es dinero, así
 * que en el día-frontera entre una línea que cierra (date_fin=X) y otra que abre (date_debut=X)
 * de la misma máquina, un relevé legacy fechado exactamente en X se atribuye SOLO a la línea que
 * cierra (X <= date_fin), nunca a ambas. Invariante de no-solapamiento (ver test).
 */
export function countersForLine(
  lineId: string,
  lineDebut: string,
  lineFin: string | null,
  counters: CounterRow[],
): Counter[] {
  return counters.filter(c => {
    if (c.contract_machine_id === lineId) return true
    if (c.contract_machine_id == null) {
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
 * TIE-BREAK: si la fecha de cierre cae a igual distancia de dos vencimientos consecutivos, se elige
 * el vencimiento PASADO (el más temprano), por orden de iteración anterior→mismo→siguiente con `<`.
 *
 * USO: en el modelo de CADENA MENSUAL esta función solo ANCLA el primer mes de un contrato; los meses
 * siguientes avanzan en secuencia (último facturado + 1), no por la fecha. El soporte fin de mes
 * (29/30/31) usa el clamp al último día real del mes; para recogidas cerca del fin de mes es robusto
 * (una recogida a mitad de mes para un cliente fin de mes es atípica y queda documentada como límite).
 * Spec: docs/superpowers/specs/2026-06-17-contadores-fecha-real-y-linea-design.md §3 (N7), §4.
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

  // Regla dual (N7):
  //  - FIN DE MES (billing_day 29/30/31): el mes facturado es el MISMO mes del vencimiento (el que se
  //    cierra ese día). Ej. día 31, cierre 31-may → mayo; 28-feb → febrero.
  //  - DÍA FIJO (1-28): el mes facturado es el ANTERIOR al vencimiento. Ej. día 1, cierre ~1-jun → mayo;
  //    día 20, cierre 20-may → abril.
  if (billingDay >= 29) {
    return { year: best.y, month: best.m }
  }
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
  /**
   * Fechas de DISPLAY del periodo de la línea (rango ENVOLVENTE tras consolidar reemplazos: de la
   * apertura más temprana al cierre más tardío). Solo para mostrar; NO son la identidad de la cadena.
   */
  open_date: string | null
  close_date: string | null
  /**
   * Identidad de la CADENA (spec §5): apertura/cierre del propio tramo de ESTA línea (la cabeza tras
   * consolidar). La persistencia y el siguiente punto de partida usan ESTOS campos, no open/close_date
   * (que se expanden al consolidar). closing_* null ⇒ tramo sin cierre (solo-fijo) ⇒ no avanza la cadena.
   */
  opening_reading_date: string | null
  closing_reading_date: string | null
  opening_counter_id: string | null
  closing_counter_id: string | null
  opening_counter_bw: number | null
  opening_counter_color: number | null
  closing_counter_bw: number | null
  closing_counter_color: number | null
  amount_fixed: number
  amount_bw: number
  amount_color: number
  amount_total: number
  /** Desglose por tramo de un puesto reemplazado A→B (§5): identidad completa de cada tramo. */
  breakdown?: BreakdownEntry[]
}

/** Tramo de un puesto reemplazado: delta + identidad de apertura/cierre (spec §5, trazabilidad). */
export type BreakdownEntry = {
  machine_label: string
  contract_machine_id: string
  delta_bw: number
  delta_color: number
  opening_reading_date: string | null
  closing_reading_date: string | null
  opening_counter_id: string | null
  closing_counter_id: string | null
  opening_counter_bw: number | null
  opening_counter_color: number | null
  closing_counter_bw: number | null
  closing_counter_color: number | null
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

/**
 * MOTOR DE CADENA (spec v3.1 §4) — punto de partida de una LÍNEA para su siguiente tramo facturable.
 * Es el cierre de la última factura REAL (con copias) de la línea, leído de invoice_lines:
 *   - reading_date: fecha del cierre facturado (la apertura del siguiente tramo).
 *   - recorded_at: el del relevé de cierre si era un relevé real (para desempatar same-day); null
 *     si fue un punto sintético (end_counter de un reemplazo) o el arranque.
 * null ⇒ la línea aún no ha facturado: la apertura se deriva de start_counter o de la 1ª lectura base.
 */
export type ChainStart = {
  counter_id: string | null
  reading_date: string | null
  counter_bw: number | null
  counter_color: number | null
  recorded_at: string | null
}

/** Resultado del motor de cadena para una línea: consumo + IDENTIDAD persistible (spec §5). */
export type LineChainResult = {
  delta_bw: number
  delta_color: number
  is_estimated: boolean
  /** true cuando la apertura es la 1ª lectura BASE de la línea (arranque puro, sin tramo previo). */
  opening_is_base: boolean
  opening_counter_id: string | null
  opening_reading_date: string | null
  opening_counter_bw: number | null
  opening_counter_color: number | null
  closing_counter_id: string | null
  closing_reading_date: string | null
  closing_counter_bw: number | null
  closing_counter_color: number | null
}

/**
 * MOTOR DE CADENA (spec v3.1 §4) — consumo del SIGUIENTE tramo de una línea, con FECHAS REALES y
 * sin depender de la etiqueta de mes. Reemplaza el modelo de «lectura etiquetada con el mes objetivo».
 *
 *  - APERTURA = el punto de partida de la cadena:
 *      · `prevClose` (cierre de la última factura real de la línea), si la línea ya facturó; si no
 *      · `start_counter` de la línea (date_debut), si la máquina entró con lectura inicial; si no
 *      · la 1ª lectura activa = BASE (arranque puro; su tramo no es facturable hasta que llegue otra).
 *  - CIERRE = la lectura activa MÁS ANTIGUA estrictamente posterior a la apertura (no la más reciente
 *    ni la «etiquetada con el mes»: corrige el bloqueante de Codex v2). Si la línea se cerró por
 *    reemplazo con ambos end_counter → el end_counter en date_fin.
 *
 * Sin cierre posterior → tramo sin consumo (`is_estimated`, delta 0): el caller decide si es un mes
 * solo-fijo (línea ya en cadena) o un arranque puro que aún no se factura (`opening_is_base`).
 * Falta de apertura o delta negativo → estimada (solo forfait), conservando la identidad disponible.
 */
export function computeLineChainConsumption(
  line: LineCounters,
  counters: Counter[],
  prevClose: ChainStart | null,
): LineChainResult {
  const active = counters.filter(c => c.status === 'actif').sort(compareCountersByReading)

  const empty = (): LineChainResult => ({
    delta_bw: 0, delta_color: 0, is_estimated: true, opening_is_base: false,
    opening_counter_id: null, opening_reading_date: null, opening_counter_bw: null, opening_counter_color: null,
    closing_counter_id: null, closing_reading_date: null, closing_counter_bw: null, closing_counter_color: null,
  })

  // ── APERTURA ────────────────────────────────────────────────────────────────
  let open: { id: string | null; date: string; bw: number | null; color: number | null; recorded_at: string }
  let openingIsBase = false
  if (prevClose && prevClose.reading_date) {
    open = {
      id: prevClose.counter_id, date: prevClose.reading_date,
      bw: prevClose.counter_bw, color: prevClose.counter_color, recorded_at: prevClose.recorded_at ?? '',
    }
  } else if (line.start_counter_bw !== null && line.start_counter_color !== null) {
    // recorded_at '' (mínimo): una lectura del MISMO día que la instalación cuenta como cierre (B1).
    open = { id: null, date: line.date_debut, bw: line.start_counter_bw, color: line.start_counter_color, recorded_at: '' }
  } else {
    const base = active[0]
    if (!base) return empty()
    openingIsBase = true
    open = { id: base.id, date: counterDate(base), bw: base.counter_bw, color: base.counter_color, recorded_at: base.recorded_at }
  }

  // ── CIERRE ──────────────────────────────────────────────────────────────────
  // El cierre del tramo = el candidato MÁS ANTIGUO estrictamente posterior a la apertura (§4). Los
  // candidatos son las lecturas reales activas Y —si la línea se cerró por reemplazo/retirada— el
  // end_counter como CANDIDATO SINTÉTICO fechado en date_fin.
  //  - Una lectura real de fecha ANTERIOR a date_fin cierra su propio tramo (fecha menor → va antes);
  //    un end_counter no se salta una lectura real intermedia.
  //  - Una lectura real del MISMO día que date_fin se ABSORBE en el end_counter: el end es el cierre
  //    DEFINITIVO de la línea (su consumo va hasta el end), de modo que la línea cerrada se factura
  //    completa en UNA sola factura y no queda un tramo huérfano (lectura same-day → end) que, al
  //    consolidar un reemplazo A→B, se perdería (A deja de tener invoice_line propia). Por eso el
  //    sintético usa order2 '' (menor que cualquier ISO) → en igualdad de fecha gana al relevé real.
  type CloseCand = { id: string | null; date: string; order2: string; bw: number | null; color: number | null }
  const after = (date: string, order2: string) =>
    date > open.date || (date === open.date && order2 > open.recorded_at)

  const candidates: CloseCand[] = []
  for (const c of active) {
    const d = counterDate(c)
    if (after(d, c.recorded_at)) {
      candidates.push({ id: c.id, date: d, order2: c.recorded_at, bw: c.counter_bw, color: c.counter_color })
    }
  }
  const closedByReplacement =
    line.date_fin !== null && line.end_counter_bw !== null && line.end_counter_color !== null
  if (closedByReplacement && after(line.date_fin!, '')) {
    candidates.push({ id: null, date: line.date_fin!, order2: '', bw: line.end_counter_bw, color: line.end_counter_color })
  }
  // Comparación por CODE POINT (no localeCompare, que puede ordenar la puntuación de forma no obvia).
  const cmp = (x: string, y: string) => (x < y ? -1 : x > y ? 1 : 0)
  candidates.sort((a, b) => cmp(a.date, b.date) || cmp(a.order2, b.order2))
  const close: { id: string | null; date: string; bw: number | null; color: number | null } | null =
    candidates[0] ?? null

  const identity = {
    opening_is_base: openingIsBase,
    opening_counter_id: open.id,
    opening_reading_date: open.date,
    opening_counter_bw: open.bw,
    opening_counter_color: open.color,
    closing_counter_id: close?.id ?? null,
    closing_reading_date: close?.date ?? null,
    closing_counter_bw: close?.bw ?? null,
    closing_counter_color: close?.color ?? null,
  }

  // Sin cierre nuevo → tramo sin consumo (solo-fijo o arranque, lo decide el caller).
  if (!close) return { delta_bw: 0, delta_color: 0, is_estimated: true, ...identity, closing_counter_id: null }

  const delta_bw = counterDelta(close.bw, open.bw)
  const delta_color = counterDelta(close.color, open.color)
  if (delta_bw === null || delta_color === null || delta_bw < 0 || delta_color < 0) {
    return { delta_bw: 0, delta_color: 0, is_estimated: true, ...identity }
  }
  return { delta_bw, delta_color, is_estimated: false, ...identity }
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

    // Desglose por tramo con IDENTIDAD completa (spec §5): cada eslabón conserva sus contadores de
    // apertura/cierre, no solo el delta. Trazabilidad contable de A→B aunque se facture en una línea.
    const breakdown: BreakdownEntry[] = chain.map(l => ({
      machine_label: l.machine_label, contract_machine_id: l.cm_id,
      delta_bw: l.delta_bw, delta_color: l.delta_color,
      opening_reading_date: l.opening_reading_date, closing_reading_date: l.closing_reading_date,
      opening_counter_id: l.opening_counter_id, closing_counter_id: l.closing_counter_id,
      opening_counter_bw: l.opening_counter_bw, opening_counter_color: l.opening_counter_color,
      closing_counter_bw: l.closing_counter_bw, closing_counter_color: l.closing_counter_color,
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
    // DISPLAY: el periodo mostrado abarca de la apertura más temprana al cierre más tardío de la cadena.
    head.open_date    = dateBounds(chain.map(l => l.open_date)).min  ?? head.open_date
    head.close_date   = dateBounds(chain.map(l => l.close_date)).max ?? head.close_date
    // IDENTIDAD de la cadena (P0): NO se toca. La cabeza conserva la apertura/cierre de SU propio
    // tramo (la máquina entrante B), que es el punto de partida del siguiente mes del puesto. Heredar
    // el cierre de A (la saliente) corrompería el prevClose de B (close_date de A + contadores nulos).

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
        .select('id, machine_id, contract_id, contract_machine_id, reading_date, year, month, day, counter_bw, counter_color, status, is_replacement_start, previous_machine_id, annulation_reason, annule_at, notes, recorded_at')
        .in('machine_id', machineIds)
    : { data: [] as CounterRow[], error: null }
  if (countersErr) throw new BillingDataError('machine_counters')   // P0-7

  const countersByMachine = new Map<string, CounterRow[]>()
  for (const c of (allCounters ?? []) as CounterRow[]) {
    const arr = countersByMachine.get(c.machine_id) ?? []
    arr.push(c)
    countersByMachine.set(c.machine_id, arr)
  }
  const counterById = new Map<string, CounterRow>()
  for (const c of (allCounters ?? []) as CounterRow[]) counterById.set(c.id, c)

  // CADENA (spec §4) — facturas EMISE previas del contrato: dan el «último mes facturado» (secuencia)
  // y, por línea, el PUNTO DE PARTIDA del siguiente tramo (cierre de la última factura con lectura real).
  const { data: prevInvoices, error: prevErr } = await admin
    .from('invoices')
    .select(`
      period_year, period_month,
      invoice_lines ( contract_machine_id, closing_counter_id, closing_reading_date, closing_counter_bw, closing_counter_color )
    `)
    .eq('contract_id', contractId)
    .eq('status', 'emise')
  if (prevErr) throw new BillingDataError('invoices')   // P0-7

  // Último mes facturado (ordinal year*12+month) y, por LÍNEA, el cierre real más reciente facturado.
  type PrevLine = { contract_machine_id: string | null; closing_counter_id: string | null;
    closing_reading_date: string | null; closing_counter_bw: number | null; closing_counter_color: number | null }
  let lastMonthOrd: number | null = null
  const prevCloseByLine = new Map<string, { ord: number; line: PrevLine }>()
  for (const inv of (prevInvoices ?? []) as { period_year: number; period_month: number; invoice_lines: PrevLine[] }[]) {
    const ord = inv.period_year * 12 + (inv.period_month - 1)
    lastMonthOrd = lastMonthOrd === null ? ord : Math.max(lastMonthOrd, ord)
    for (const il of inv.invoice_lines ?? []) {
      if (!il.contract_machine_id || il.closing_reading_date === null) continue   // solo cierres reales
      const cur = prevCloseByLine.get(il.contract_machine_id)
      if (!cur || ord > cur.ord) prevCloseByLine.set(il.contract_machine_id, { ord, line: il })
    }
  }

  // ChainStart de una línea desde su última factura con cierre real. recorded_at: el del relevé de
  // cierre si era real; '~' (mayor que cualquier ISO) si fue un end_counter sintético de reemplazo —
  // así no se reconsidera el mismo end_counter en igualdad de fecha (P2 de la revisión de Codex).
  const chainStartFor = (lineId: string): ChainStart | null => {
    const prev = prevCloseByLine.get(lineId)
    if (!prev) return null
    const real = prev.line.closing_counter_id ? counterById.get(prev.line.closing_counter_id) : null
    return {
      counter_id: prev.line.closing_counter_id,
      reading_date: prev.line.closing_reading_date,
      counter_bw: prev.line.closing_counter_bw,
      counter_color: prev.line.closing_counter_color,
      recorded_at: real ? real.recorded_at : '~',
    }
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
  const monthFallback = `${targetYear}-${String(targetMonth).padStart(2, '0')}-01`
  const targetOrd = targetYear * 12 + (targetMonth - 1)

  // 1) Consumo del SIGUIENTE tramo por línea con el MOTOR DE CADENA (apertura = punto de partida de
  //    facturas previas / start_counter / base; cierre = lectura más antigua posterior). Se excluyen
  //    las líneas ya cerradas (date_fin) cuyo cierre final YA fue facturado (no re-facturar forfait).
  type Computed = {
    line: NonNullable<typeof lines>[number]
    prevClose: ChainStart | null
    cons: LineChainResult
    /** Mes (ordinal) que ancla el PRIMER tramo de una línea sin historial (computeInvoiceMonth N7). */
    firstMonthOrd: number | null
  }
  const computed: Computed[] = []
  for (const line of lines ?? []) {
    if (!line.machine_id) continue
    if (!isLineBillable(line.statut, contractStatut, line.date_fin)) continue
    const prevClose = chainStartFor(line.id)
    // Excluir una línea cerrada SOLO si su cierre final SINTÉTICO (end_counter de reemplazo) ya se
    // facturó (counter_id null + fecha ≥ date_fin). Si el último cierre fue una LECTURA REAL del mismo
    // día que date_fin (counter_id != null), aún falta facturar el tramo hasta el end_counter → no excluir.
    if (
      line.date_fin !== null && prevClose?.reading_date != null &&
      prevClose.reading_date >= line.date_fin && prevClose.counter_id === null
    ) continue
    const machineCounters = countersByMachine.get(line.machine_id) ?? []
    const counters = countersForLine(line.id, line.date_debut, line.date_fin, machineCounters)
    const cons = computeLineChainConsumption(line, counters, prevClose)
    let firstMonthOrd: number | null = null
    if (!prevClose && cons.closing_reading_date !== null) {
      const m = computeInvoiceMonth(billingDay, cons.closing_reading_date)
      firstMonthOrd = m.year * 12 + (m.month - 1)
    }
    computed.push({ line, prevClose, cons, firstMonthOrd })
  }

  // 2) Mes que TOCA facturar en la SECUENCIA (§4): la fecha solo ancla el primero; luego manda last+1.
  //    Sin historial: ancla = el primer cierre MÁS TEMPRANO del contrato (menor firstMonthOrd).
  //    Esto preserva la semántica del modelo anterior (un mes anterior o posterior al que toca → null).
  const firstOrds = computed.map(c => c.firstMonthOrd).filter((o): o is number => o !== null)
  const expectedOrd = lastMonthOrd !== null
    ? lastMonthOrd + 1
    : (firstOrds.length ? Math.min(...firstOrds) : null)
  if (expectedOrd === null) return null    // ni historial ni primer cierre → solo base, nada que facturar
  if (targetOrd !== expectedOrd) return null   // se factura en secuencia; este mes no toca

  // 3) Líneas que aportan CIERRE REAL este mes (definen la "tanda" y su cierre más tardío):
  //    en cadena → si tienen cierre nuevo; primer tramo → si su cierre ancla justo a expectedOrd.
  const contributesReal = (c: Computed) =>
    c.cons.closing_reading_date !== null && (c.prevClose !== null || c.firstMonthOrd === expectedOrd)
  const { max: maxCloseDate } = dateBounds(computed.filter(contributesReal).map(c => c.cons.closing_reading_date))

  const draftLines: DraftLine[] = []
  for (const c of computed) {
    const { line, cons } = c
    const real = contributesReal(c)
    if (!real) {
      // Sin cierre real este mes → entra SOLO-FIJO (forfait) únicamente si:
      //  - ya está en cadena (facturó antes) y sigue activa → mes solo-fijo (§4.4); o
      //  - es una máquina activa MUDA que ya estaba cuando se hizo la recogida (hay tanda).
      // Resto (arranque puro, o máquina añadida después de la tanda) → no pertenece a este mes.
      const inChain = c.prevClose !== null && line.date_fin === null
      const isMute  = line.date_fin === null && maxCloseDate !== null && line.date_debut <= maxCloseDate
      if (!inChain && !isMute) continue
    }

    const asOf = cons.opening_reading_date ?? cons.closing_reading_date ?? monthFallback
    const planVersions = line.billing_plan_id ? (planVersionsByPlan.get(line.billing_plan_id) ?? []) : []
    const ovVersions   = ovVersionsByCm.get(line.id) ?? []
    const tariff =
      resolveEffectiveTariffAsOf(planVersions, ovVersions, asOf)
      ?? resolveEffectiveTariff(line as ContractMachineWithBilling)
    if (!tariff) continue

    const machine = line.machines
    const plan    = line.billing_plans
    const delta_bw    = real ? cons.delta_bw : 0
    const delta_color = real ? cons.delta_color : 0
    const isEstimated = real ? cons.is_estimated : true   // sin cierre real → solo forfait (estimada)
    const amounts = calculateMonthlyAmount(tariff, delta_bw, delta_color)

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
      delta_bw,
      delta_color,
      is_estimated:   isEstimated,
      // DISPLAY (se expanden al consolidar) e IDENTIDAD (no se tocan): aquí coinciden por línea simple.
      open_date:      cons.opening_reading_date,
      close_date:     real ? cons.closing_reading_date : null,
      opening_reading_date:  cons.opening_reading_date,
      closing_reading_date:  real ? cons.closing_reading_date : null,
      opening_counter_id:    cons.opening_counter_id,
      closing_counter_id:    real ? cons.closing_counter_id : null,
      opening_counter_bw:    cons.opening_counter_bw,
      opening_counter_color: cons.opening_counter_color,
      closing_counter_bw:    real ? cons.closing_counter_bw : null,
      closing_counter_color: real ? cons.closing_counter_color : null,
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
 * MOTOR DE CADENA (spec v3.1 §4) — lista de tandas LISTAS PARA FACTURAR. Por cada contrato facturable
 * ofrece UN solo mes: el SIGUIENTE en la secuencia (último mes facturado + 1; o, sin historial, el mes
 * que ancla el primer cierre vía computeInvoiceMonth/N7). Nunca meses futuros (mes ≤ mes actual en hora
 * de Africa/Dakar = UTC, A4) ni infinitos (uno por contrato). Confirma con buildContractInvoiceDraft
 * para NO divergir del motor: solo aparece el contrato si ese mes produce un borrador real.
 */
export async function listReadyToBill(): Promise<ReadyToBillEntry[]> {
  const admin = createAdminClient()

  // 1) Líneas facturables (con plan) → contrato (billing_day, nombre, cliente) + datos de la línea.
  const { data: lineRows, error: linesErr } = await admin
    .from('contract_machines')
    .select(`
      id, contract_id, machine_id, date_debut, date_fin, statut,
      start_counter_bw, start_counter_color, end_counter_bw, end_counter_color,
      contracts!inner ( id, numero_contrat, billing_day, statut, clients!inner ( nom_client ) )
    `)
    .not('billing_plan_id', 'is', null)
  if (linesErr) throw new BillingDataError('contract_machines')   // P0-7

  type Line = {
    id: string; contract_id: string; machine_id: string | null
    date_debut: string; date_fin: string | null; statut: string | null
    start_counter_bw: number | null; start_counter_color: number | null
    end_counter_bw: number | null; end_counter_color: number | null
    numero_contrat: string; client_name: string; billing_day: number
  }
  const lines: Line[] = []
  for (const row of lineRows ?? []) {
    const c = row.contracts as unknown as {
      id: string; numero_contrat: string; billing_day: number | null; statut: string | null;
      clients: { nom_client: string } | null
    } | null
    if (!c || !row.machine_id) continue
    if (!isLineBillable(row.statut, c.statut, row.date_fin)) continue
    lines.push({
      id: row.id, contract_id: c.id, machine_id: row.machine_id,
      date_debut: row.date_debut, date_fin: row.date_fin, statut: row.statut,
      start_counter_bw: row.start_counter_bw, start_counter_color: row.start_counter_color,
      end_counter_bw: row.end_counter_bw, end_counter_color: row.end_counter_color,
      numero_contrat: c.numero_contrat, client_name: c.clients?.nom_client ?? '—',
      billing_day: c.billing_day ?? 1,
    })
  }
  if (lines.length === 0) return []

  const info = new Map<string, { numero_contrat: string; client_name: string }>()
  const linesByContract = new Map<string, Line[]>()
  for (const l of lines) {
    info.set(l.contract_id, { numero_contrat: l.numero_contrat, client_name: l.client_name })
    const arr = linesByContract.get(l.contract_id) ?? []
    arr.push(l); linesByContract.set(l.contract_id, arr)
  }

  // 2) Relevés activos de esas máquinas (atribución fina por línea = countersForLine, como el draft).
  const machineIds = [...new Set(lines.map(l => l.machine_id).filter((id): id is string => !!id))]
  const { data: counterRows, error: cErr } = await admin
    .from('machine_counters')
    .select('id, machine_id, contract_id, contract_machine_id, reading_date, year, month, day, counter_bw, counter_color, status, is_replacement_start, previous_machine_id, annulation_reason, annule_at, notes, recorded_at')
    .in('machine_id', machineIds)
    .eq('status', 'actif')
  if (cErr) throw new BillingDataError('machine_counters')   // P0-7
  type CRow = Counter & { machine_id: string; contract_id: string | null }
  const countersByMachine = new Map<string, CRow[]>()
  for (const c of (counterRows ?? []) as CRow[]) {
    const arr = countersByMachine.get(c.machine_id) ?? []
    arr.push(c); countersByMachine.set(c.machine_id, arr)
  }

  // 3) Último mes facturado (ordinal) por contrato → secuencia (§4).
  const { data: issued, error: iErr } = await admin
    .from('invoices')
    .select('contract_id, period_year, period_month')
    .eq('status', 'emise')
    .not('contract_id', 'is', null)
  if (iErr) throw new BillingDataError('invoices')   // P0-7
  const lastOrdByContract = new Map<string, number>()
  for (const inv of issued ?? []) {
    if (!inv.contract_id) continue
    const ord = inv.period_year * 12 + (inv.period_month - 1)
    const cur = lastOrdByContract.get(inv.contract_id)
    if (cur === undefined || ord > cur) lastOrdByContract.set(inv.contract_id, ord)
  }

  // 4) Mes que TOCA por contrato: último+1, o (sin historial) el ancla del primer cierre más temprano.
  //    Nunca meses futuros: A4 evalúa «mes actual» en hora de NEGOCIO (Africa/Dakar = UTC, sin DST).
  const now = new Date()
  const currentOrd = now.getUTCFullYear() * 12 + now.getUTCMonth()

  const expectedByContract = new Map<string, number>()
  for (const [contractId, cLines] of linesByContract) {
    const lastOrd = lastOrdByContract.get(contractId)
    let expectedOrd: number | null = null
    if (lastOrd !== undefined) {
      expectedOrd = lastOrd + 1
    } else {
      // Sin historial: anclar por el primer cierre MÁS TEMPRANO del contrato (misma lógica que el draft).
      const firstOrds: number[] = []
      for (const l of cLines) {
        const counters = countersForLine(l.id, l.date_debut, l.date_fin, countersByMachine.get(l.machine_id!) ?? [])
        const cons = computeLineChainConsumption(
          { date_debut: l.date_debut, date_fin: l.date_fin,
            start_counter_bw: l.start_counter_bw, start_counter_color: l.start_counter_color,
            end_counter_bw: l.end_counter_bw, end_counter_color: l.end_counter_color },
          counters, null,
        )
        if (cons.closing_reading_date) {
          const m = computeInvoiceMonth(l.billing_day, cons.closing_reading_date)
          firstOrds.push(m.year * 12 + (m.month - 1))
        }
      }
      if (firstOrds.length) expectedOrd = Math.min(...firstOrds)
    }
    if (expectedOrd === null) continue        // solo base/sin lecturas → nada que facturar
    if (expectedOrd > currentOrd) continue    // mes futuro: aún no toca (A4)
    expectedByContract.set(contractId, expectedOrd)
  }

  // 5) Confirmar con el motor: el contrato aparece solo si ese mes produce un borrador real (no divergir).
  const entries: ReadyToBillEntry[] = []
  for (const [contractId, ord] of expectedByContract) {
    const period_year  = Math.floor(ord / 12)
    const period_month = (ord % 12) + 1
    const draft = await buildContractInvoiceDraft(contractId, period_year, period_month)
    if (!draft) continue
    const ci = info.get(contractId)!
    entries.push({ contract_id: contractId, numero_contrat: ci.numero_contrat, client_name: ci.client_name, period_year, period_month })
  }

  // Orden por contrato (un único mes por contrato).
  return entries.sort((a, b) =>
    a.numero_contrat.localeCompare(b.numero_contrat) ||
    a.period_year - b.period_year ||
    a.period_month - b.period_month)
}
