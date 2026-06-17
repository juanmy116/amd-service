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
  // candidatos son las lecturas reales activas Y —si la línea se cerró por reemplazo— el end_counter
  // como CANDIDATO SINTÉTICO fechado en date_fin (NO como override absoluto: un end_counter no debe
  // saltarse una lectura real intermedia anterior al reemplazo; esa lectura cierra su propio tramo y
  // el end_counter cierra el último). Orden por (fecha, recorded_at); el sintético usa '~' (mayor que
  // cualquier timestamp ISO) para colocarse DESPUÉS de una lectura real del mismo día.
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
  if (closedByReplacement && after(line.date_fin!, '~')) {
    candidates.push({ id: null, date: line.date_fin!, order2: '~', bw: line.end_counter_bw, color: line.end_counter_color })
  }
  candidates.sort((a, b) => a.date.localeCompare(b.date) || a.order2.localeCompare(b.order2))
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

  // Mes de PURO ARRANQUE: si ninguna línea tiene lectura de apertura (solo primeras lecturas =
  // base, y/o máquinas mudas), no hay consumo que facturar → no se factura el mes de arranque.
  // (Caso 2AS: la primera tanda —abril— es solo base; no debe ofrecerse como facturable.)
  if (mergedLines.every(l => l.open_date === null)) return null

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
 * FORMA B — lista de tandas LISTAS PARA FACTURAR: por cada contrato facturable, los meses con un
 * relevé que CIERRA un mes (tiene apertura) y aún SIN factura emise. Reemplaza el selector mes/año.
 *
 * Comparte la atribución del motor para no divergir de buildContractInvoiceDraft:
 *  - atribuye los relevés por LÍNEA con countersForLine (incluye relevés legacy contract_id NULL
 *    por fecha, igual que el draft), no solo por contract_id de la fila;
 *  - excluye la BASE (la primera lectura de una máquina, sin apertura previa ni start_counter): un
 *    mes de puro arranque no tiene consumo y no debe ofrecerse (caso 2AS: abril es solo base).
 * El periodo y el total exactos los calcula buildContractInvoiceDraft al seleccionar. Spec §5.1, §13.
 */
export async function listReadyToBill(): Promise<ReadyToBillEntry[]> {
  const admin = createAdminClient()

  // 1) Líneas facturables (con plan) → contrato (billing_day, nombre, cliente) + datos de la línea.
  const { data: lineRows, error: linesErr } = await admin
    .from('contract_machines')
    .select(`
      id, contract_id, machine_id, date_debut, date_fin, statut,
      start_counter_bw, start_counter_color,
      contracts!inner ( id, numero_contrat, billing_day, statut, clients!inner ( nom_client ) )
    `)
    .not('billing_plan_id', 'is', null)
  if (linesErr) throw new BillingDataError('contract_machines')   // P0-7

  type Line = {
    id: string; contract_id: string; machine_id: string | null
    date_debut: string; date_fin: string | null; statut: string | null
    start_counter_bw: number | null; start_counter_color: number | null
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
      numero_contrat: c.numero_contrat, client_name: c.clients?.nom_client ?? '—',
      billing_day: c.billing_day ?? 1,
    })
  }
  if (lines.length === 0) return []

  // 2) Relevés activos de esas máquinas (atribución fina por línea = countersForLine, como el draft).
  const machineIds = [...new Set(lines.map(l => l.machine_id).filter((id): id is string => !!id))]
  const { data: counterRows, error: cErr } = await admin
    .from('machine_counters')
    .select('id, machine_id, contract_id, year, month, day, counter_bw, counter_color, status, is_replacement_start, previous_machine_id, annulation_reason, annule_at, notes, recorded_at')
    .in('machine_id', machineIds)
    .eq('status', 'actif')
  if (cErr) throw new BillingDataError('machine_counters')   // P0-7
  type CRow = Counter & { machine_id: string; contract_id: string | null }
  const countersByMachine = new Map<string, CRow[]>()
  for (const c of (counterRows ?? []) as CRow[]) {
    const arr = countersByMachine.get(c.machine_id) ?? []
    arr.push(c); countersByMachine.set(c.machine_id, arr)
  }

  // candidatos: "contractId|year|month" — un relevé es candidato solo si tiene APERTURA
  // (relevé anterior en la línea, o start_counter con date_debut <= su fecha). Así la base no cuenta.
  const candidates = new Map<string, { contract_id: string; period_year: number; period_month: number }>()
  const info = new Map<string, { numero_contrat: string; client_name: string }>()
  for (const line of lines) {
    info.set(line.contract_id, { numero_contrat: line.numero_contrat, client_name: line.client_name })
    const own = countersForLine(line.contract_id, line.date_debut, line.date_fin, countersByMachine.get(line.machine_id!) ?? [])
      .slice()
      .sort((a, b) => counterDate(a).localeCompare(counterDate(b)) || a.recorded_at.localeCompare(b.recorded_at))
    const hasStart = line.start_counter_bw !== null && line.start_counter_color !== null
    own.forEach((c, i) => {
      const hasOpening = i > 0 || (hasStart && line.date_debut <= counterDate(c))
      if (!hasOpening) return   // base: primera lectura sin apertura → no factura
      const { year, month } = computeInvoiceMonth(line.billing_day, counterDate(c))
      candidates.set(`${line.contract_id}|${year}|${month}`, { contract_id: line.contract_id, period_year: year, period_month: month })
    })
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
    const ci = info.get(cand.contract_id)!
    entries.push({
      contract_id:  cand.contract_id,
      numero_contrat: ci.numero_contrat,
      client_name:  ci.client_name,
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
