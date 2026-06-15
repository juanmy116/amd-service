import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { adminClient, anonClient, signInAs, cleanup, ANON_KEY, SERVICE_KEY } from './helpers'
import { expectEmpty } from './assert'
import { seedTenants, SC } from './scenario'

// Aislamiento RLS de FACTURACIÓN: invoices, invoice_lines, billing_plans.
// Todas son ADMIN-ONLY: ni cliente ni técnico ni anónimo las ven por RLS, y solo
// el admin puede escribir. (Las tablas hermanas billing_plan_versions,
// contract_machine_override_versions e invoice_counters también son admin-only por
// la misma policy is_admin(), pero las gestionan triggers SECURITY DEFINER, así que
// no se prueban aquí.)
//
// DECISIÓN DE DISEÑO (documentada aquí a propósito): el cliente NO ve sus
// propias facturas a través del portal — AMD las envía por email/xlsx. Si algún
// día se abre un portal de facturas al cliente, este test fallará y obligará a
// revisar la policy conscientemente.

const admin = adminClient()
let invoiceAId: string
let invoiceBId: string
let invClientAId: number // cliente válido para el intento de INSERT bloqueado por RLS

// Cliente dedicado para facturas. Las facturas son inmutables (no se pueden borrar),
// así que su cliente quedaría "pegado" por la FK RESTRICT. Por eso usamos un prefijo
// 'TESTINV ' que cleanup() NO barre (cleanup borra 'TEST '), y lo creamos de forma
// idempotente (upsert) para que el test sea re-ejecutable en local sin reset.
async function ensureInvoiceClient(name: string): Promise<number> {
  const { data, error } = await admin.from('clients')
    .upsert({ nom_client: name }, { onConflict: 'nom_client' }).select('id').single()
  if (error) throw new Error(`ensure invoice client (${name}): ${error.message}`)
  return data!.id as number
}

// Idempotente: si la factura ya existe (re-run local), reutiliza su id en vez de
// insertar (no se puede hacer upsert: el UPDATE lo bloquea el trigger de inmutabilidad).
async function ensureInvoice(clientId: number, clientName: string, num: string): Promise<string> {
  const found = await admin.from('invoices').select('id').eq('numero_facture', num).maybeSingle()
  if (found.data) return found.data.id as string
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
  // seedTenants da los usuarios (admin/client/tech) para iniciar sesión por rol.
  await seedTenants(admin)

  invClientAId = await ensureInvoiceClient('TESTINV Client A')
  const invClientBId = await ensureInvoiceClient('TESTINV Client B')
  invoiceAId = await ensureInvoice(invClientAId, 'TESTINV Client A', 'TESTINV-2026-0001')
  invoiceBId = await ensureInvoice(invClientBId, 'TESTINV Client B', 'TESTINV-2026-0002')

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
    expectEmpty(await c.from('invoices').select('id').in('id', [invoiceAId, invoiceBId]))
  })

  it('el técnico A no ve ninguna factura', async () => {
    const c = await signInAs(SC.techAEmail)
    expectEmpty(await c.from('invoices').select('id').in('id', [invoiceAId, invoiceBId]))
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

  it('el cliente A NO puede crear una factura (escritura admin-only)', async () => {
    const c = await signInAs(SC.clientAEmail)
    await c.from('invoices').insert({
      numero_facture: 'TEST-HACK-0001', client_id: invClientAId, client_name: 'hack',
      period_year: 2026, period_month: 6, total_amount: 1,
    })
    expectEmpty(await admin.from('invoices').select('id').eq('numero_facture', 'TEST-HACK-0001'))
  })
})

describe('RLS facturación — invoice_lines (admin-only)', () => {
  it('el cliente A no ve ninguna línea de factura', async () => {
    const c = await signInAs(SC.clientAEmail)
    expectEmpty(await c.from('invoice_lines').select('id').in('invoice_id', [invoiceAId, invoiceBId]))
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
    expectEmpty(await c.from('billing_plans').select('id').like('name', 'TEST %'))
  })

  it('el técnico A no ve los planes de tarifa', async () => {
    const c = await signInAs(SC.techAEmail)
    expectEmpty(await c.from('billing_plans').select('id').like('name', 'TEST %'))
  })

  it('el admin ve el plan de tarifa', async () => {
    const c = await signInAs(SC.adminEmail)
    const { data } = await c.from('billing_plans').select('id').like('name', 'TEST %')
    expect((data ?? []).length).toBeGreaterThanOrEqual(1)
  })

  it('el cliente A NO puede crear un plan de tarifa (escritura admin-only)', async () => {
    const c = await signInAs(SC.clientAEmail)
    await c.from('billing_plans').insert({ name: 'TEST Plan HACK', type: 'per_copy', price_bw: 1, price_color: 1 })
    expectEmpty(await admin.from('billing_plans').select('id').eq('name', 'TEST Plan HACK'))
  })
})
