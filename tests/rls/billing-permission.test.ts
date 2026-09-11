import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { adminClient, signInAs, cleanup, createUserWithRole, ANON_KEY, SERVICE_KEY } from './helpers'
import { expectEmpty } from './assert'

// PERMISO DE FACTURACIÓN (`profiles.can_bill`, migración 20260911130000).
//
// Separa «administrar el SAV» de «facturar»: hay admins de AMD que gestionan clientes, máquinas,
// contadores, contratos e incidencias, pero NO deben ver la facturación. Ambos son role='admin',
// así que `is_admin()` (y con él todas las demás policies) se comporta igual para los dos — lo
// único que cambia es lo que gobierna `can_bill()`.
//
// Caso especial que este test fija: `billing_plans` se LEE con ser admin (la página de contratos
// necesita los planes para asignar la tarifa de cada línea) pero solo se ESCRIBE con `can_bill`.

const admin = adminClient()
const BILLER = 'bp-biller@rls.test' // admin CON facturación
const SAV = 'bp-sav@rls.test'       // admin SIN facturación
const TECH = 'bp-tech@rls.test'     // técnico, control

// Cliente/factura con prefijo 'TESTINV ' porque cleanup() no barre facturas (son inmutables por
// trigger) y su cliente quedaría pegado por la FK RESTRICT. Mismo patrón que billing-isolation.
const INV_CLIENT = 'TESTINV Permiso'
let invoiceId: string

beforeAll(async () => {
  if (!ANON_KEY || !SERVICE_KEY) {
    throw new Error('Faltan ANON_KEY/SERVICE_ROLE_KEY. Ejecuta con `supabase start` y exporta las claves.')
  }
  await cleanup(admin)

  await createUserWithRole(admin, BILLER, 'admin') // createUserWithRole ya da can_bill a los admin
  const savUid = await createUserWithRole(admin, SAV, 'admin')
  await createUserWithRole(admin, TECH, 'technician')
  // …y a este le retiramos el permiso: admin del SAV, sin facturación.
  const { error: revErr } = await admin.from('profiles').update({ can_bill: false }).eq('id', savUid)
  if (revErr) throw new Error(`revoke can_bill: ${revErr.message}`)

  // Semilla: un plan tarifario y una factura con línea.
  const { error: planErr } = await admin.from('billing_plans')
    .upsert({ name: 'TEST Plan permiso', type: 'per_copy', price_bw: 10, price_color: 50 },
            { onConflict: 'name' })
  if (planErr) throw new Error(`seed plan: ${planErr.message}`)

  const { data: cli, error: cErr } = await admin.from('clients')
    .upsert({ nom_client: INV_CLIENT }, { onConflict: 'nom_client' }).select('id').single()
  if (cErr) throw new Error(`seed client: ${cErr.message}`)

  const found = await admin.from('invoices').select('id').eq('numero_facture', 'TESTPERM-0001').maybeSingle()
  if (found.data) {
    invoiceId = found.data.id as string
  } else {
    const { data: inv, error: iErr } = await admin.from('invoices').insert({
      numero_facture: 'TESTPERM-0001', client_id: cli!.id, client_name: INV_CLIENT,
      period_year: 2026, period_month: 9, total_amount: 5000,
    }).select('id').single()
    if (iErr) throw new Error(`seed invoice: ${iErr.message}`)
    invoiceId = inv!.id as string
    const { error: lErr } = await admin.from('invoice_lines').insert({
      invoice_id: invoiceId, numero_contrat: 'TEST-C', machine_label: 'TEST machine',
      plan_name: 'TEST plan', billing_type: 'per_copy',
    })
    if (lErr) throw new Error(`seed invoice_line: ${lErr.message}`)
  }
})

afterAll(async () => {
  await cleanup(admin)
})

describe('admin SIN can_bill (admin del SAV)', () => {
  it('no ve ninguna factura', async () => {
    const sav = await signInAs(SAV)
    expectEmpty(await sav.from('invoices').select('id'))
  })

  it('no ve ninguna línea de factura', async () => {
    const sav = await signInAs(SAV)
    expectEmpty(await sav.from('invoice_lines').select('id'))
  })

  it('no puede crear una factura', async () => {
    const sav = await signInAs(SAV)
    const { error } = await sav.from('invoices').insert({
      numero_facture: 'TESTPERM-HACK', client_id: 1, client_name: 'X',
      period_year: 2026, period_month: 9, total_amount: 1,
    })
    expect(error).not.toBeNull()
  })

  it('SÍ lee los planes tarifarios (los necesita la página de contratos)', async () => {
    const sav = await signInAs(SAV)
    const { data, error } = await sav.from('billing_plans').select('id, name')
    expect(error).toBeNull()
    expect((data ?? []).length).toBeGreaterThan(0)
  })

  it('no puede crear un plan tarifario', async () => {
    const sav = await signInAs(SAV)
    const { error } = await sav.from('billing_plans')
      .insert({ name: 'TEST Plan intruso', type: 'per_copy', price_bw: 1 })
    expect(error).not.toBeNull()
  })

  it('no puede modificar un plan tarifario existente', async () => {
    const sav = await signInAs(SAV)
    const { data } = await sav.from('billing_plans').select('id').eq('name', 'TEST Plan permiso').single()
    const { error } = await sav.from('billing_plans').update({ price_bw: 999 }).eq('id', data!.id)
    // RLS sin policy de UPDATE no da error: simplemente no afecta a ninguna fila. Verificamos el efecto.
    expect(error).toBeNull()
    const { data: after } = await admin.from('billing_plans').select('price_bw').eq('id', data!.id).single()
    expect(Number(after!.price_bw)).toBe(10)
  })
})

describe('admin CON can_bill', () => {
  it('ve las facturas y sus líneas', async () => {
    const biller = await signInAs(BILLER)
    const { data: inv, error } = await biller.from('invoices').select('id').eq('id', invoiceId)
    expect(error).toBeNull()
    expect((inv ?? []).length).toBe(1)
    const { data: lines } = await biller.from('invoice_lines').select('id').eq('invoice_id', invoiceId)
    expect((lines ?? []).length).toBeGreaterThan(0)
  })

  it('puede crear un plan tarifario', async () => {
    const biller = await signInAs(BILLER)
    const { error } = await biller.from('billing_plans')
      .insert({ name: 'TEST Plan del facturador', type: 'per_copy', price_bw: 7 })
    expect(error).toBeNull()
  })
})

describe('el permiso no se filtra a otros roles', () => {
  it('un técnico sigue sin ver facturas ni planes', async () => {
    const tech = await signInAs(TECH)
    expectEmpty(await tech.from('invoices').select('id'))
    expectEmpty(await tech.from('billing_plans').select('id'))
  })
})
