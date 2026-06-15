import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { adminClient, anonClient, signInAs, cleanup, ANON_KEY, SERVICE_KEY } from './helpers'
import { seedTenants, SC, type Tenants } from './scenario'

// Aislamiento RLS de FACTURACIÓN: invoices, invoice_lines, billing_plans,
// billing_plan_versions, contract_machine_override_versions, invoice_counters.
// Todas son ADMIN-ONLY: ni cliente ni técnico ni anónimo las ven por RLS.
//
// DECISIÓN DE DISEÑO (documentada aquí a propósito): el cliente NO ve sus
// propias facturas a través del portal — AMD las envía por email/xlsx. Si algún
// día se abre un portal de facturas al cliente, este test fallará y obligará a
// revisar la policy conscientemente.

const admin = adminClient()
let t: Tenants
let invoiceAId: string
let invoiceBId: string

async function seedInvoice(clientId: number, clientName: string, num: string): Promise<string> {
  const { data: inv, error } = await admin.from('invoices').insert({
    numero_facture: num, client_id: clientId, client_name: clientName,
    period_year: 2026, period_month: 6, total_amount: 1000,
  }).select('id').single()
  if (error) throw new Error(`seed invoice (${num}): ${error.message}`)
  const id = inv!.id as string
  const { error: lErr } = await admin.from('invoice_lines').insert({
    invoice_id: id, numero_contrat: 'TEST-C', machine_label: 'TEST machine',
    plan_name: 'TEST plan', billing_type: 'per_copy',
  })
  if (lErr) throw new Error(`seed invoice_line (${num}): ${lErr.message}`)
  return id
}

beforeAll(async () => {
  if (!ANON_KEY || !SERVICE_KEY) {
    throw new Error('Faltan ANON_KEY/SERVICE_ROLE_KEY. Ejecuta con `supabase start` y exporta las claves.')
  }
  await cleanup(admin)
  t = await seedTenants(admin)

  invoiceAId = await seedInvoice(t.clientAId, 'TEST Client A', 'TEST-2026-0001')
  invoiceBId = await seedInvoice(t.clientBId, 'TEST Client B', 'TEST-2026-0002')

  const { error: bpErr } = await admin.from('billing_plans').insert({
    name: 'TEST Plan per_copy', type: 'per_copy', price_bw: 10, price_color: 50,
  })
  if (bpErr) throw new Error(`seed billing_plan: ${bpErr.message}`)
}, 90_000)

afterAll(async () => {
  await cleanup(admin)
})

describe('RLS facturación — invoices (admin-only)', () => {
  it('el cliente A NO ve ninguna factura (ni la suya)', async () => {
    const c = await signInAs(SC.clientAEmail)
    const { data } = await c.from('invoices').select('id').in('id', [invoiceAId, invoiceBId])
    expect(data ?? []).toHaveLength(0)
  })

  it('el técnico A no ve ninguna factura', async () => {
    const c = await signInAs(SC.techAEmail)
    const { data } = await c.from('invoices').select('id').in('id', [invoiceAId, invoiceBId])
    expect(data ?? []).toHaveLength(0)
  })

  it('el anónimo no ve ninguna factura', async () => {
    const { data } = await anonClient().from('invoices').select('id').in('id', [invoiceAId, invoiceBId])
    expect(data ?? []).toHaveLength(0)
  })

  it('el admin ve ambas facturas', async () => {
    const c = await signInAs(SC.adminEmail)
    const { data } = await c.from('invoices').select('id').in('id', [invoiceAId, invoiceBId])
    expect((data ?? []).map((x) => x.id)).toEqual(expect.arrayContaining([invoiceAId, invoiceBId]))
  })
})

describe('RLS facturación — invoice_lines (admin-only)', () => {
  it('el cliente A no ve ninguna línea de factura', async () => {
    const c = await signInAs(SC.clientAEmail)
    const { data } = await c.from('invoice_lines').select('id').in('invoice_id', [invoiceAId, invoiceBId])
    expect(data ?? []).toHaveLength(0)
  })

  it('el admin ve las líneas de ambas facturas', async () => {
    const c = await signInAs(SC.adminEmail)
    const { data } = await c.from('invoice_lines').select('id').in('invoice_id', [invoiceAId, invoiceBId])
    expect((data ?? []).length).toBeGreaterThanOrEqual(2)
  })
})

describe('RLS facturación — billing_plans (admin-only)', () => {
  it('el cliente A no ve los planes de tarifa', async () => {
    const c = await signInAs(SC.clientAEmail)
    const { data } = await c.from('billing_plans').select('id').like('name', 'TEST %')
    expect(data ?? []).toHaveLength(0)
  })

  it('el técnico A no ve los planes de tarifa', async () => {
    const c = await signInAs(SC.techAEmail)
    const { data } = await c.from('billing_plans').select('id').like('name', 'TEST %')
    expect(data ?? []).toHaveLength(0)
  })

  it('el admin ve el plan de tarifa', async () => {
    const c = await signInAs(SC.adminEmail)
    const { data } = await c.from('billing_plans').select('id').like('name', 'TEST %')
    expect((data ?? []).length).toBeGreaterThanOrEqual(1)
  })
})
