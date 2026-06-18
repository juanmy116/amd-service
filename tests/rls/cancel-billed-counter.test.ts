import { describe, it, expect, beforeAll } from 'vitest'
import { adminClient, ANON_KEY, SERVICE_KEY } from './helpers'

// GUARD A3 (PR-D.2, P0-2 de la revisión de Codex): una lectura (machine_counter) que ya
// CERRÓ una factura `emise` NO puede anularse silenciosamente. Si se pudiera, la factura
// emitida quedaría con un dato y la cadena futura arrancaría de un punto incoherente
// (sobre/infra-cobro + rotura de auditabilidad). La corrección legítima exige primero
// ANULAR la factura (acción consciente de admin), tal como dicta el spec §12 A3.
//
// El guard vive en un trigger de BD (no se puede saltar por ninguna ruta de escritura).
// Cubre tanto el cierre top-level (closing_counter_id) como el breakdown por tramo (A→B).
//
// Facturas inmutables → prefijo TESTINV (cleanup() NO lo barre). En local: `supabase db reset`.

const admin = adminClient()

const CLIENT  = 'TESTINV CANCEL Client'
const SERIE   = 'TESTINV-CANCEL-M1'
const CONTRAT = 'TESTINV-CANCEL-C1'

let cCloseId: string  // lectura usada como cierre TOP-LEVEL de una factura emise
let cBreakId: string  // lectura usada como cierre dentro del BREAKDOWN
let cFreeId: string   // lectura NO facturada (anulable)

beforeAll(async () => {
  if (!ANON_KEY || !SERVICE_KEY) {
    throw new Error('Faltan ANON_KEY/SERVICE_ROLE_KEY. Ejecuta con `supabase start` y exporta las claves.')
  }
  // Limpieza idempotente del propio escenario (no toca otros TEST-).
  const prevInv = await admin.from('invoices').select('id').eq('client_name', CLIENT)
  for (const inv of prevInv.data ?? []) await admin.from('invoice_lines').delete().eq('invoice_id', inv.id)
  await admin.from('machine_counters').delete().eq('machine_id', SERIE)
  const prevC = await admin.from('contracts').select('id').eq('numero_contrat', CONTRAT).maybeSingle()
  if (prevC.data) {
    await admin.from('contract_machines').delete().eq('contract_id', prevC.data.id)
    await admin.from('contracts').delete().eq('id', prevC.data.id)
  }
  await admin.from('machines').delete().eq('numero_serie', SERIE)

  const cli = await admin.from('clients').upsert({ nom_client: CLIENT }, { onConflict: 'nom_client' }).select('id').single()
  if (cli.error) throw new Error(`seed client: ${cli.error.message}`)
  const clientId = cli.data!.id as number

  await admin.from('machines').insert({ numero_serie: SERIE, marque: 'TESTINV', modele: 'M1', type: 'color' })
  const contract = await admin.from('contracts')
    .insert({ numero_contrat: CONTRAT, client_id: clientId, date_debut: '2026-01-01', statut: 'actif', billing_day: 1 })
    .select('id').single()
  const contractId = contract.data!.id as string
  const line = await admin.from('contract_machines')
    .insert({ contract_id: contractId, machine_id: SERIE, date_debut: '2026-01-01', statut: 'actif' })
    .select('id').single()
  const lineId = line.data!.id as string

  const cnt = await admin.from('machine_counters').insert([
    { machine_id: SERIE, contract_id: contractId, contract_machine_id: lineId, client_id: clientId, year: 2026, month: 4, day: 30, counter_bw: 1000, counter_color: 200, recorded_at: '2026-04-30T10:00:00Z' },
    { machine_id: SERIE, contract_id: contractId, contract_machine_id: lineId, client_id: clientId, year: 2026, month: 5, day: 31, counter_bw: 1500, counter_color: 260, recorded_at: '2026-05-31T10:00:00Z' },
    { machine_id: SERIE, contract_id: contractId, contract_machine_id: lineId, client_id: clientId, year: 2026, month: 6, day: 30, counter_bw: 2000, counter_color: 320, recorded_at: '2026-06-30T10:00:00Z' },
  ]).select('id, month')
  if (cnt.error) throw new Error(`seed counters: ${cnt.error.message}`)
  cCloseId = cnt.data!.find(c => c.month === 5)!.id as string
  cBreakId = cnt.data!.find(c => c.month === 4)!.id as string
  cFreeId  = cnt.data!.find(c => c.month === 6)!.id as string

  // Factura EMISE con: cierre top-level = cClose, y un breakdown que referencia cBreak.
  const inv = await admin.from('invoices').insert({
    numero_facture: 'TESTINV-CANCEL-F1', client_id: clientId, client_name: CLIENT,
    period_year: 2026, period_month: 5, status: 'emise', total_amount: 8000,
  }).select('id').single()
  if (inv.error) throw new Error(`seed invoice: ${inv.error.message}`)
  const lineIns = await admin.from('invoice_lines').insert({
    invoice_id: inv.data!.id, numero_contrat: CONTRAT, machine_label: `TESTINV M1 (${SERIE})`,
    plan_name: 'TESTINV Plan', billing_type: 'per_copy',
    closing_counter_id: cCloseId,
    breakdown: [{ contract_machine_id: lineId, opening_counter_id: null, closing_counter_id: cBreakId, delta_bw: 0, delta_color: 0 }],
  })
  if (lineIns.error) throw new Error(`seed invoice_line: ${lineIns.error.message}`)
}, 90_000)

// Helper: intenta anular una lectura activa (lo que hace cancelCounterAction en BD).
const annul = (id: string) =>
  admin.from('machine_counters')
    .update({ status: 'annule', annulation_reason: 'test', annule_at: new Date().toISOString() })
    .eq('id', id).eq('status', 'actif')

describe('guard A3 — no anular una lectura que ya cerró una factura emise', () => {
  it('lectura usada como cierre TOP-LEVEL de factura emise → rechazada', async () => {
    const { error } = await annul(cCloseId)
    expect(error?.message).toContain('counter_used_by_emised_invoice')
  })

  it('lectura referenciada en el BREAKDOWN de factura emise → rechazada', async () => {
    const { error } = await annul(cBreakId)
    expect(error?.message).toContain('counter_used_by_emised_invoice')
  })

  it('lectura NO facturada → se puede anular con normalidad', async () => {
    const { error } = await annul(cFreeId)
    expect(error).toBeNull()
  })
})
