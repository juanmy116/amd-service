import { describe, it, expect, beforeAll } from 'vitest'
import { adminClient, ANON_KEY, SERVICE_KEY } from './helpers'

// Gate END-TO-END de la facturación «periodo a medida» (Forma B) sobre la BD efímera del CI
// (supabase db reset reconstruye TODAS las migraciones desde cero, incl. la nueva dedup por mes).
// Reproduce el caso REAL de 2AS: lecturas el 29-abr (base) y el 03-jun → factura de MAYO con el
// periodo real 29/04→03/06, y verifica el anti-duplicados P0 (re-emitir el mismo mes se bloquea
// aunque cambie period_start, y el índice único rechaza un duplicado directo).
//
// NOTA: emite facturas (inmutables) → usa prefijo 'TESTINV'/'TESTINV-' que cleanup() NO barre, y
// no las borra. En CI la BD es efímera; en local requiere `supabase db reset` entre ejecuciones.

const admin = adminClient()

const CLIENT  = 'TESTINV PM Client'
const SERIE   = 'TESTINV-PM-M1'
const CONTRAT = 'TESTINV-PM-C1'
const PLAN    = 'TESTINV Plan PM'

let clientId: number
let contractId: string

beforeAll(async () => {
  if (!ANON_KEY || !SERVICE_KEY) {
    throw new Error('Faltan ANON_KEY/SERVICE_ROLE_KEY. Ejecuta con `supabase start` y exporta las claves.')
  }

  // Idempotencia tolerante (CI parte de BD limpia; esto ayuda en local salvo si ya hay factura).
  await admin.from('machine_counters').delete().eq('machine_id', SERIE)
  const prev = await admin.from('contracts').select('id').eq('numero_contrat', CONTRAT).maybeSingle()
  if (prev.data) {
    await admin.from('contract_machines').delete().eq('contract_id', prev.data.id)
    await admin.from('contracts').delete().eq('id', prev.data.id)   // falla en silencio si ya hay factura
  }
  await admin.from('machines').delete().eq('numero_serie', SERIE)

  const cli = await admin.from('clients').upsert({ nom_client: CLIENT }, { onConflict: 'nom_client' }).select('id').single()
  if (cli.error) throw new Error(`seed client: ${cli.error.message}`)
  clientId = cli.data!.id as number

  const plan = await admin.from('billing_plans')
    .upsert({ name: PLAN, type: 'per_copy', price_bw: 10, price_color: 50 }, { onConflict: 'name' })
    .select('id').single()
  if (plan.error) throw new Error(`seed plan: ${plan.error.message}`)

  const mch = await admin.from('machines').insert({ numero_serie: SERIE, marque: 'TESTPM', modele: 'M1', type: 'color' })
  if (mch.error) throw new Error(`seed machine: ${mch.error.message}`)

  const contract = await admin.from('contracts')
    .insert({ numero_contrat: CONTRAT, client_id: clientId, date_debut: '2026-01-01', statut: 'actif', billing_day: 1 })
    .select('id').single()
  if (contract.error) throw new Error(`seed contract: ${contract.error.message}`)
  contractId = contract.data!.id as string

  const line = await admin.from('contract_machines')
    .insert({ contract_id: contractId, machine_id: SERIE, date_debut: '2026-01-01', statut: 'actif', billing_plan_id: plan.data!.id })
    .select('id').single()
  if (line.error) throw new Error(`seed line: ${line.error.message}`)

  // Caso real 2AS (billing_day=1): 29-abr = base, 03-jun = cierre de mayo.
  const cnt = await admin.from('machine_counters').insert([
    { machine_id: SERIE, contract_id: contractId, client_id: clientId, year: 2026, month: 4, day: 29, counter_bw: 1000, counter_color: 200, recorded_at: '2026-04-29T10:00:00Z' },
    { machine_id: SERIE, contract_id: contractId, client_id: clientId, year: 2026, month: 6, day: 3,  counter_bw: 1500, counter_color: 260, recorded_at: '2026-06-03T10:00:00Z' },
  ])
  if (cnt.error) throw new Error(`seed counters: ${cnt.error.message}`)
}, 90_000)

// Payload de emisión de la factura de MAYO, como lo produciría buildContractInvoiceDraft:
// periodo real 29/04→03/06, mes facturado 2026-05, consumo 500 B&N / 60 color con plan 10/50.
function mayoPayload(periodStart: string) {
  return {
    contract_id: contractId,
    client_id: clientId,
    client_name: CLIENT,
    numero_contrat: CONTRAT,
    period_start: periodStart,
    period_end: '2026-06-03',
    period_year: 2026,
    period_month: 5,
    has_estimated: false,
    has_replacement: false,
    confirm_estimated: false,
    total_amount: 8000,
    lines: [{
      contract_id: contractId, numero_contrat: CONTRAT, machine_id: SERIE,
      machine_label: `TESTPM M1 (${SERIE})`, plan_name: PLAN, billing_type: 'per_copy',
      fixed_fee: null, price_bw: 10, price_color: 50, tiers: null,
      delta_bw: 500, delta_color: 60, is_estimated: false,
      amount_fixed: 0, amount_bw: 5000, amount_color: 3000, amount_total: 8000,
    }],
  }
}

describe('Gate Forma B — factura de mayo con periodo real (caso 2AS)', () => {
  it('emite la factura de mayo con periodo 29/04→03/06 y total 8000', async () => {
    const { data: invoiceId, error } = await admin.rpc('emit_contract_invoice', { p_payload: mayoPayload('2026-04-29') })
    expect(error).toBeNull()
    expect(invoiceId).toBeTruthy()

    const { data: inv } = await admin.from('invoices')
      .select('period_year, period_month, period_start, period_end, total_amount, status')
      .eq('id', invoiceId).single()
    expect(inv).toMatchObject({
      period_year: 2026, period_month: 5,
      period_start: '2026-04-29', period_end: '2026-06-03',
      status: 'emise',
    })
    // total_amount es numeric: supabase-js puede devolverlo como número u string → comparar valor.
    expect(Number(inv!.total_amount)).toBe(8000)
  })

  it('P0 dedup: re-emitir el MISMO mes se bloquea aunque period_start cambie', async () => {
    // Simula que entró otra lectura y el envolvente cambió a 30-abr: el mes (2026-05) es el mismo.
    const { error } = await admin.rpc('emit_contract_invoice', { p_payload: mayoPayload('2026-04-30') })
    expect(error).not.toBeNull()
    expect(error!.message).toContain('already_issued')
  })

  it('P0 dedup (red de BD): el índice único rechaza un duplicado directo del mismo mes', async () => {
    const { error } = await admin.from('invoices').insert({
      numero_facture: 'TESTINV-PM-DUP', client_id: clientId, client_name: CLIENT,
      contract_id: contractId, period_year: 2026, period_month: 5, status: 'emise', total_amount: 1,
    })
    expect(error).not.toBeNull()
    expect((error as { code?: string }).code).toBe('23505')   // unique_violation
  })

  it('otro MES del mismo contrato sí se puede emitir (la unicidad es por mes, no global)', async () => {
    // Junio: cierre 03-jun ya usado como cierre de mayo; añadimos una lectura de julio que cierra junio.
    await admin.from('machine_counters').insert(
      { machine_id: SERIE, contract_id: contractId, client_id: clientId, year: 2026, month: 7, day: 1, counter_bw: 1800, counter_color: 300, recorded_at: '2026-07-01T10:00:00Z' },
    )
    const junio = {
      ...mayoPayload('2026-06-03'),
      period_end: '2026-07-01', period_month: 6,
      total_amount: 5000,
      lines: [{
        contract_id: contractId, numero_contrat: CONTRAT, machine_id: SERIE,
        machine_label: `TESTPM M1 (${SERIE})`, plan_name: PLAN, billing_type: 'per_copy',
        fixed_fee: null, price_bw: 10, price_color: 50, tiers: null,
        delta_bw: 300, delta_color: 40, is_estimated: false,
        amount_fixed: 0, amount_bw: 3000, amount_color: 2000, amount_total: 5000,
      }],
    }
    const { data: invoiceId, error } = await admin.rpc('emit_contract_invoice', { p_payload: junio })
    expect(error).toBeNull()
    expect(invoiceId).toBeTruthy()
  })
})
