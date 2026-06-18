import { describe, it, expect, beforeAll } from 'vitest'
import { adminClient, ANON_KEY, SERVICE_KEY, URL, PASSWORD } from './helpers'
import { buildContractInvoiceDraft, listReadyToBill, type ContractDraft } from '@/lib/invoicing'
import type { Json } from '@/lib/supabase/types'

// GATE E2E de FACTURACIÓN (PR-E, spec 2026-06-17-contadores-fecha-real-y-linea-design.md §9).
//
// A diferencia de los bancos unitarios (invoicing.test.ts, que mockean el client) y de los
// adversariales de UNA RPC (emit-hardening, close-by-line), este gate ejercita la CADENA
// COMPLETA contra la BD real: siembra contrato/líneas/plan/lecturas → buildContractInvoiceDraft
// (queries reales) → emit_contract_invoice (RPC real) → verifica la factura inmutable
// persistida. Prueba que las piezas ENCAJAN end-to-end, no solo cada una por separado.
//
// Replica el payload exacto de la Server Action de producción (contract-actions.ts).
//
// Inmutabilidad: emite facturas → prefijo 'TESTINV' que cleanup() NO barre. En CI la BD es
// efímera (supabase db reset reconstruye todo); en LOCAL requiere `supabase db reset` entre
// ejecuciones (igual que emit-hardening.test.ts).

const admin = adminClient()

// Usuario que emite (issued_by). Email fuera de '.test' para que el cleanup() de otros
// archivos RLS no lo borre (la FK invoices.issued_by → profiles es NO ACTION).
const EMITTER_EMAIL = 'gate-emitter@testinv.local'
let emitterUid: string

beforeAll(async () => {
  if (!ANON_KEY || !SERVICE_KEY) {
    throw new Error('Faltan ANON_KEY/SERVICE_ROLE_KEY. Ejecuta con `supabase start` y exporta las claves.')
  }
  // createAdminClient() (usado por buildContractInvoiceDraft) lee estas env en cada llamada.
  process.env.NEXT_PUBLIC_SUPABASE_URL = URL
  process.env.SUPABASE_SECRET_KEY = SERVICE_KEY

  emitterUid = await ensureEmitter()
}, 90_000)

// Crea (idempotente) el usuario emisor con rol admin y devuelve su uid.
async function ensureEmitter(): Promise<string> {
  const { data: list } = await admin.auth.admin.listUsers({ perPage: 1000 })
  const existing = list?.users?.find((u) => u.email === EMITTER_EMAIL)
  const uid = existing
    ? existing.id
    : (await admin.auth.admin.createUser({ email: EMITTER_EMAIL, password: PASSWORD, email_confirm: true })).data.user!.id
  await admin.from('profiles').update({ role: 'admin' }).eq('id', uid)
  return uid
}

type SeedCounter = { date: string; bw: number; color: number; status?: 'actif' | 'annule' }
type SeedLine = {
  serie: string
  dateDebut: string
  dateFin?: string
  startBw?: number
  startColor?: number
  endBw?: number
  endColor?: number
  replacesSerie?: string // para la línea entrante de un reemplazo (encadena por replaces_contract_machine_id)
  counters?: SeedCounter[]
}
type Seeded = {
  clientId: number
  contractId: string
  planId: string
  lineIds: Record<string, string> // serie → contract_machine.id
  counterIds: Record<string, string> // `${serie}@${date}` → machine_counter.id
}

// Siembra un escenario completo y aislado por `suffix`. Plan per_copy por defecto (10/50);
// pasa fixedFee para un plan híbrido (forfait + copias).
async function seedScenario(
  suffix: string,
  opts: {
    billingDay?: number
    planType?: 'per_copy' | 'hybrid'
    fixedFee?: number
    priceBw?: number
    priceColor?: number
    contractDebut?: string
    lines: SeedLine[]
  },
): Promise<Seeded> {
  const CLIENT = `TESTINV GATE ${suffix}`
  const CONTRAT = `TESTINV-GATE-${suffix}`
  const PLAN = `TESTINV GATE Plan ${suffix}`
  const planType = opts.planType ?? 'per_copy'

  // Limpieza best-effort previa (idempotencia local; en CI la BD ya es efímera). Si una corrida
  // anterior dejó una factura emitida, el borrado del contrato fallará por FK → requiere db reset.
  for (const l of opts.lines) await admin.from('machine_counters').delete().eq('machine_id', l.serie)
  const prev = await admin.from('contracts').select('id').eq('numero_contrat', CONTRAT).maybeSingle()
  if (prev.data) {
    await admin.from('contract_machines').delete().eq('contract_id', prev.data.id)
    await admin.from('contracts').delete().eq('id', prev.data.id)
    // Si el contrato sigue ahí, una corrida anterior dejó una factura inmutable (FK RESTRICT).
    // El gate no es re-ejecutable en local sin reset: mensaje accionable en vez de un duplicate key.
    const still = await admin.from('contracts').select('id').eq('numero_contrat', CONTRAT).maybeSingle()
    if (still.data) throw new Error(`El contrato ${CONTRAT} tiene facturas de una corrida previa. Ejecuta \`supabase db reset\` antes de relanzar el gate.`)
  }
  for (const l of opts.lines) await admin.from('machines').delete().eq('numero_serie', l.serie)

  const cli = await admin.from('clients').upsert({ nom_client: CLIENT }, { onConflict: 'nom_client' }).select('id').single()
  if (cli.error) throw new Error(`seed client ${suffix}: ${cli.error.message}`)
  const clientId = cli.data!.id as number

  const plan = await admin.from('billing_plans')
    .upsert(
      { name: PLAN, type: planType, fixed_fee: opts.fixedFee ?? null, price_bw: opts.priceBw ?? 10, price_color: opts.priceColor ?? 50 },
      { onConflict: 'name' },
    )
    .select('id').single()
  if (plan.error) throw new Error(`seed plan ${suffix}: ${plan.error.message}`)
  const planId = plan.data!.id as string

  const contract = await admin.from('contracts')
    .insert({ numero_contrat: CONTRAT, client_id: clientId, date_debut: opts.contractDebut ?? '2026-01-01', statut: 'actif', billing_day: opts.billingDay ?? 1 })
    .select('id').single()
  if (contract.error) throw new Error(`seed contract ${suffix}: ${contract.error.message}`)
  const contractId = contract.data!.id as string

  const lineIds: Record<string, string> = {}
  const counterIds: Record<string, string> = {}
  for (const l of opts.lines) {
    const mch = await admin.from('machines').insert({ numero_serie: l.serie, marque: 'TESTGATE', modele: 'M', type: 'color' })
    if (mch.error) throw new Error(`seed machine ${l.serie}: ${mch.error.message}`)

    const line = await admin.from('contract_machines').insert({
      contract_id: contractId, machine_id: l.serie, date_debut: l.dateDebut, date_fin: l.dateFin ?? null,
      statut: l.dateFin ? 'terminé' : 'actif', billing_plan_id: planId,
      start_counter_bw: l.startBw ?? null, start_counter_color: l.startColor ?? null,
      end_counter_bw: l.endBw ?? null, end_counter_color: l.endColor ?? null,
      replaces_contract_machine_id: l.replacesSerie ? lineIds[l.replacesSerie] : null,
    }).select('id').single()
    if (line.error) throw new Error(`seed line ${l.serie}: ${line.error.message}`)
    lineIds[l.serie] = line.data!.id as string

    for (const c of l.counters ?? []) {
      const [y, m, d] = c.date.split('-').map(Number)
      const ins = await admin.from('machine_counters').insert({
        machine_id: l.serie, contract_id: contractId, contract_machine_id: line.data!.id, client_id: clientId,
        year: y, month: m, day: d, counter_bw: c.bw, counter_color: c.color, status: c.status ?? 'actif',
        recorded_at: `${c.date}T10:00:00Z`,
      }).select('id').single()
      if (ins.error) throw new Error(`seed counter ${l.serie}@${c.date}: ${ins.error.message}`)
      counterIds[`${l.serie}@${c.date}`] = ins.data!.id as string
    }
  }

  return { clientId, contractId, planId, lineIds, counterIds }
}

// Emite una factura desde un draft replicando EXACTAMENTE el payload de contract-actions.ts.
async function emitDraft(draft: ContractDraft, confirmEstimated = false) {
  return admin.rpc('emit_contract_invoice', {
    p_payload: {
      contract_id: draft.contract_id, client_id: draft.client_id, client_name: draft.client_name,
      numero_contrat: draft.numero_contrat, period_start: draft.period_start, period_end: draft.period_end,
      period_year: draft.period_year, period_month: draft.period_month,
      has_estimated: draft.has_estimated, has_replacement: draft.has_replacement,
      confirm_estimated: confirmEstimated, total_amount: draft.total_amount,
      issued_by: emitterUid, lines: draft.lines,
    } as unknown as Json,
  })
}

// ─────────────────────────────────────────────────────────────────────────────
// Caso 1 (§9.1) — Dos lecturas el mismo mes natural (billing_day=1): 02-may + 31-may
// conviven; abril y mayo se facturan correctos, sin doble cobro. (P0-1)
// ─────────────────────────────────────────────────────────────────────────────
describe('Gate §9.1 — dos lecturas el mismo mes natural (billing_day=1)', () => {
  it('factura abril (cierra 02-may) y mayo (cierra 31-may) sin doble cobro', async () => {
    const s = await seedScenario('C1', {
      billingDay: 1,
      lines: [{
        serie: 'TESTINV-GATE-C1-M', dateDebut: '2026-04-01', startBw: 1000, startColor: 100,
        counters: [
          { date: '2026-05-02', bw: 1200, color: 120 }, // cierra abril
          { date: '2026-05-31', bw: 1500, color: 150 }, // cierra mayo
        ],
      }],
    })

    // ABRIL: apertura = start (1000/100), cierre = 02-may (1200/120) → delta 200/20.
    const draftApr = await buildContractInvoiceDraft(s.contractId, 2026, 4)
    expect(draftApr).not.toBeNull()
    expect(draftApr!.period_month).toBe(4)
    expect(draftApr!.lines).toHaveLength(1)
    expect(draftApr!.lines[0].delta_bw).toBe(200)
    expect(draftApr!.lines[0].delta_color).toBe(20)
    expect(draftApr!.lines[0].amount_total).toBe(200 * 10 + 20 * 50) // 2000 + 1000 = 3000
    expect(draftApr!.has_estimated).toBe(false)

    const apr = await emitDraft(draftApr!)
    expect(apr.error).toBeNull()
    const aprId = apr.data as string

    // MAYO: apertura = 02-may (1200/120), cierre = 31-may (1500/150) → delta 300/30. Sin doble cobro.
    const draftMay = await buildContractInvoiceDraft(s.contractId, 2026, 5)
    expect(draftMay).not.toBeNull()
    expect(draftMay!.period_month).toBe(5)
    expect(draftMay!.lines[0].delta_bw).toBe(300)
    expect(draftMay!.lines[0].delta_color).toBe(30)
    expect(draftMay!.lines[0].amount_total).toBe(300 * 10 + 30 * 50) // 3000 + 1500 = 4500

    const may = await emitDraft(draftMay!)
    expect(may.error).toBeNull()

    // Dos facturas distintas, una por mes, sin solapar el consumo.
    const invs = await admin.from('invoices').select('id, period_year, period_month, total_amount')
      .eq('contract_id', s.contractId).order('period_month')
    expect(invs.data).toHaveLength(2)
    expect(invs.data!.map((i) => i.period_month)).toEqual([4, 5])
    expect(invs.data!.find((i) => i.period_month === 4)!.total_amount).toBe(3000)
    expect(invs.data!.find((i) => i.period_month === 5)!.total_amount).toBe(4500)

    // Inmutabilidad: una factura emitida no se puede modificar ni borrar (trigger de BD).
    const upd = await admin.from('invoices').update({ total_amount: 1 }).eq('id', aprId)
    expect(upd.error).not.toBeNull()
    const del = await admin.from('invoices').delete().eq('id', aprId)
    expect(del.error).not.toBeNull()
    const still = await admin.from('invoices').select('total_amount').eq('id', aprId).single()
    expect(still.data!.total_amount).toBe(3000)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// Caso 5 (§9.5) — Cadena / dos contadores de golpe: abril facturado; llegan mayo (02-jun)
// y junio (30-jun) juntos → mayo usa 02-jun, junio usa 30-jun (la más antigua primero),
// en orden. Cada mes secuencial toma su cierre, sin perder ni solapar copias.
// ─────────────────────────────────────────────────────────────────────────────
describe('Gate §9.5 — cadena: dos contadores de golpe se facturan en orden', () => {
  it('mayo cierra con 02-jun y junio con 30-jun (más antigua primero)', async () => {
    const s = await seedScenario('C5', {
      billingDay: 1,
      lines: [{
        serie: 'TESTINV-GATE-C5-M', dateDebut: '2026-04-01', startBw: 1000, startColor: 100,
        counters: [
          { date: '2026-05-01', bw: 1100, color: 110 }, // cierra abril
          { date: '2026-06-02', bw: 1300, color: 130 }, // cierra mayo (llega tarde)
          { date: '2026-06-30', bw: 1600, color: 160 }, // cierra junio
        ],
      }],
    })

    // ABRIL: start (1000) → 01-may (1100) = 100/10.
    const dApr = await buildContractInvoiceDraft(s.contractId, 2026, 4)
    expect(dApr!.period_month).toBe(4)
    expect(dApr!.lines[0].delta_bw).toBe(100)
    expect((await emitDraft(dApr!)).error).toBeNull()

    // MAYO: 01-may (1100) → 02-jun (1300) = 200/20. Usa la lectura MÁS ANTIGUA posterior.
    const dMay = await buildContractInvoiceDraft(s.contractId, 2026, 5)
    expect(dMay!.period_month).toBe(5)
    expect(dMay!.lines[0].delta_bw).toBe(200)
    expect(dMay!.lines[0].closing_reading_date).toBe('2026-06-02')
    expect((await emitDraft(dMay!)).error).toBeNull()

    // JUNIO: 02-jun (1300) → 30-jun (1600) = 300/30.
    const dJun = await buildContractInvoiceDraft(s.contractId, 2026, 6)
    expect(dJun!.period_month).toBe(6)
    expect(dJun!.lines[0].delta_bw).toBe(300)
    expect(dJun!.lines[0].closing_reading_date).toBe('2026-06-30')
    expect((await emitDraft(dJun!)).error).toBeNull()

    const invs = await admin.from('invoices').select('period_month, total_amount')
      .eq('contract_id', s.contractId).order('period_month')
    expect(invs.data!.map((i) => i.period_month)).toEqual([4, 5, 6])
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// Caso 14 (§9.14) — Anulación / reemisión: reemitir el mismo mes está bloqueado por el
// dedup (already_issued) mientras la factura esté 'emise'; tras ANULAR (emise→annulee) la
// reemisión del mismo mes vuelve a permitirse (dedup parcial WHERE status='emise', A2).
// ─────────────────────────────────────────────────────────────────────────────
describe('Gate §9.14 — anular y reemitir un mes; dedup por mes intacto', () => {
  it('reemitir bloqueado mientras emise; permitido tras anular', async () => {
    const s = await seedScenario('C14', {
      billingDay: 1,
      lines: [{
        serie: 'TESTINV-GATE-C14-M', dateDebut: '2026-04-01', startBw: 1000, startColor: 100,
        counters: [{ date: '2026-05-02', bw: 1200, color: 120 }], // cierra abril
      }],
    })

    const dApr = await buildContractInvoiceDraft(s.contractId, 2026, 4)
    expect(dApr!.period_month).toBe(4)
    const first = await emitDraft(dApr!)
    expect(first.error).toBeNull()
    const firstId = first.data as string

    // Reemitir el MISMO mes con la factura aún 'emise' → dedup lo rechaza.
    const dup = await emitDraft(dApr!)
    expect(dup.error?.message).toContain('already_issued')

    // Anular (transición emise → annulee, única permitida por el trigger de inmutabilidad).
    const annul = await admin.from('invoices')
      .update({ status: 'annulee', annulled_by: emitterUid, annulled_at: '2026-06-18T10:00:00Z', annulation_reason: 'gate test' })
      .eq('id', firstId).eq('status', 'emise').select('id')
    expect(annul.error).toBeNull()
    expect(annul.data).toHaveLength(1)

    // Tras anular, el mismo mes (y el mismo cierre) se puede reemitir: el dedup y la
    // no-reutilización (V3c) solo cuentan facturas 'emise'.
    const reemit = await emitDraft(dApr!)
    expect(reemit.error).toBeNull()
    const reemitId = reemit.data as string
    expect(reemitId).not.toBe(firstId)

    // Estado final: exactamente UNA factura 'emise' de abril (dedup intacto) + la anulada.
    const all = await admin.from('invoices').select('id, status, period_month')
      .eq('contract_id', s.contractId).eq('period_month', 4)
    expect(all.data).toHaveLength(2)
    expect(all.data!.filter((i) => i.status === 'emise')).toHaveLength(1)
    expect(all.data!.filter((i) => i.status === 'annulee')).toHaveLength(1)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// Caso 7 (§9.7) — Mes solo-fijo + contador posterior (N8/N10): tras facturar abril, mayo
// llega SIN lectura → se factura solo-forfait (estimado, no avanza el punto de partida);
// luego llega la lectura de junio → junio = forfait + copias acumuladas desde abril
// (mayo+junio). Dos forfaits, copias contadas UNA sola vez, factura de mayo intacta.
// Flujo TEMPORAL: la lectura de junio se siembra DESPUÉS de facturar mayo.
// ─────────────────────────────────────────────────────────────────────────────
describe('Gate §9.7 — mes solo-fijo y luego contador (copias acumuladas, sin doble cobro)', () => {
  it('mayo solo-forfait; junio forfait + copias abril→junio; mayo intacta', async () => {
    const FORFAIT = 25000
    const s = await seedScenario('C7', {
      billingDay: 1, planType: 'hybrid', fixedFee: FORFAIT, priceBw: 10, priceColor: 50,
      lines: [{
        serie: 'TESTINV-GATE-C7-M', dateDebut: '2026-04-01', startBw: 1000, startColor: 100,
        counters: [{ date: '2026-05-01', bw: 1200, color: 120 }], // cierra abril; junio se siembra luego
      }],
    })
    const serie = 'TESTINV-GATE-C7-M'

    // ABRIL: forfait + copias (200/20).
    const dApr = await buildContractInvoiceDraft(s.contractId, 2026, 4)
    expect(dApr!.period_month).toBe(4)
    expect(dApr!.lines[0].delta_bw).toBe(200)
    expect(dApr!.lines[0].is_estimated).toBe(false)
    expect(dApr!.lines[0].amount_fixed).toBe(FORFAIT)
    expect((await emitDraft(dApr!)).error).toBeNull()

    // MAYO sin lectura → solo-forfait (estimado). El punto de partida NO avanza.
    const dMay = await buildContractInvoiceDraft(s.contractId, 2026, 5)
    expect(dMay!.period_month).toBe(5)
    expect(dMay!.lines[0].delta_bw).toBe(0)
    expect(dMay!.lines[0].delta_color).toBe(0)
    expect(dMay!.lines[0].is_estimated).toBe(true)
    expect(dMay!.lines[0].amount_fixed).toBe(FORFAIT)
    expect(dMay!.lines[0].amount_bw).toBe(0)
    expect(dMay!.has_estimated).toBe(true)
    expect((await emitDraft(dMay!, true)).error).toBeNull() // confirm_estimated = true

    // Ahora LLEGA la lectura de junio (1700/170).
    const ins = await admin.from('machine_counters').insert({
      machine_id: serie, contract_id: s.contractId, contract_machine_id: s.lineIds[serie], client_id: s.clientId,
      year: 2026, month: 6, day: 30, counter_bw: 1700, counter_color: 170, recorded_at: '2026-06-30T10:00:00Z',
    })
    expect(ins.error).toBeNull()

    // JUNIO: forfait + copias acumuladas desde la última lectura REAL (abril: 1200/120) → 500/50.
    const dJun = await buildContractInvoiceDraft(s.contractId, 2026, 6)
    expect(dJun!.period_month).toBe(6)
    expect(dJun!.lines[0].delta_bw).toBe(500)
    expect(dJun!.lines[0].delta_color).toBe(50)
    expect(dJun!.lines[0].is_estimated).toBe(false)
    expect(dJun!.lines[0].amount_fixed).toBe(FORFAIT)
    expect((await emitDraft(dJun!)).error).toBeNull()

    // Verificación global: 3 facturas; las copias B&N suman 700 = 1700−1000 (sin perder ni duplicar).
    const lines = await admin.from('invoice_lines')
      .select('delta_bw, amount_fixed, invoices!inner(contract_id, period_month)')
      .eq('invoices.contract_id', s.contractId)
    const totalBw = lines.data!.reduce((acc, l) => acc + (l.delta_bw as number), 0)
    expect(totalBw).toBe(700)
    // Dos forfaits íntegros en mayo y junio (el mes estimado igual cobra forfait).
    const forfaits = lines.data!.filter((l) => (l.amount_fixed as number) === FORFAIT)
    expect(forfaits).toHaveLength(3) // abril, mayo, junio: cada mes su forfait
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// Caso 11 (§9.11) — Reemplazo A→B con lecturas en el mismo mes: la máquina A se retira a
// mitad de mes (end_counter) y B la sustituye (hereda el contador). El mes consolida A+B en
// UNA línea comercial (un forfait, copias sumadas) con breakdown por tramo (IDs de A y B).
// Usa listReadyToBill para anclar el mes sin adivinarlo (lo ejercita E2E de paso).
// ─────────────────────────────────────────────────────────────────────────────
describe('Gate §9.11 — reemplazo A→B: un forfait, copias sumadas, breakdown por tramo', () => {
  it('consolida A (300/30) + B (200/20) en una línea con breakdown de ambos', async () => {
    const FORFAIT = 25000
    const serieA = 'TESTINV-GATE-C11-A'
    const serieB = 'TESTINV-GATE-C11-B'
    const s = await seedScenario('C11', {
      billingDay: 1, planType: 'hybrid', fixedFee: FORFAIT, priceBw: 10, priceColor: 50,
      lines: [
        // A: abre 01-abr (start 1000/100), se retira el 30-abr (fin de ciclo) con end_counter 1300/130.
        // Cierre 30-abr → mes facturado abril (N7, billing_day=1: vencimiento 01-may más cercano → mes anterior).
        { serie: serieA, dateDebut: '2026-04-01', dateFin: '2026-04-30', startBw: 1000, startColor: 100, endBw: 1300, endColor: 130 },
        // B: entra el 30-abr heredando el contador (start 1300/130), cierra con lectura 01-may (→ abril también).
        { serie: serieB, dateDebut: '2026-04-30', startBw: 1300, startColor: 130, replacesSerie: serieA,
          counters: [{ date: '2026-05-01', bw: 1500, color: 150 }] },
      ],
    })

    // El mes lo decide el motor (cabeza B cierra 01-may → abril). listReadyToBill lo confirma.
    const ready = await listReadyToBill()
    const entry = ready.find((r) => r.contract_id === s.contractId)
    expect(entry).toBeDefined()

    const draft = await buildContractInvoiceDraft(s.contractId, entry!.period_year, entry!.period_month)
    expect(draft).not.toBeNull()
    expect(draft!.has_replacement).toBe(true)
    expect(draft!.lines).toHaveLength(1) // A+B consolidados en una línea comercial

    const head = draft!.lines[0]
    expect(head.delta_bw).toBe(500)   // 300 (A) + 200 (B)
    expect(head.delta_color).toBe(50) // 30 (A) + 20 (B)
    expect(head.amount_fixed).toBe(FORFAIT) // un solo forfait
    expect(head.breakdown).toBeDefined()
    expect(head.breakdown).toHaveLength(2)
    // El breakdown lleva la identidad de cada tramo (A y B) — trazabilidad contable (§5).
    const bdIds = head.breakdown!.map((b) => b.contract_machine_id).sort()
    expect(bdIds).toEqual([s.lineIds[serieA], s.lineIds[serieB]].sort())
    const bdBw = head.breakdown!.reduce((acc, b) => acc + b.delta_bw, 0)
    expect(bdBw).toBe(500)

    const emit = await emitDraft(draft!)
    expect(emit.error).toBeNull()

    const inv = await admin.from('invoices').select('id, has_replacement, total_amount').eq('id', emit.data as string).single()
    expect(inv.data!.has_replacement).toBe(true)
    // Forfait + copias: 25000 + 500·10 + 50·50 = 25000 + 5000 + 2500 = 32500.
    expect(inv.data!.total_amount).toBe(32500)
  })
})
