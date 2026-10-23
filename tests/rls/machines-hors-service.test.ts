import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { adminClient, signInAs, cleanup, createUserWithRole, ANON_KEY, SERVICE_KEY } from './helpers'

// MÁQUINAS: NUNCA SE BORRAN, SE PONEN «HORS SERVICE» (20261023180000_machines_hors_service.sql).
//
// Una máquina pasa de cliente en cliente y su historial tiene que quedar. Reglas que fija este test:
//   1. Un admin (sesión de la app) no puede borrar una máquina.
//   2. No se pone hors service una máquina con contrato abierto.
//   3. Hors service anota la fecha; volver a ponerla en servicio borra fecha, motivo y autor.
//   4. Una máquina hors service no entra en ningún contrato (insert directo, formulario de
//      contrato, reemplazo).
// Prefijo TEST- → cleanup().

const admin = adminClient()
const ADMIN = 'hs-admin@rls.test'

async function machine(serie: string) {
  const m = await admin.from('machines').insert({ numero_serie: serie, marque: 'TESTHS', modele: 'M' })
  if (m.error) throw new Error(`seed machine ${serie}: ${m.error.message}`)
}

async function contractWithLine(suffix: string, serie: string) {
  const cli = await admin.from('clients')
    .upsert({ nom_client: `TEST HS ${suffix}` }, { onConflict: 'nom_client' }).select('id').single()
  if (cli.error) throw new Error(cli.error.message)
  const c = await admin.from('contracts')
    .insert({ numero_contrat: `TEST-HS-C-${suffix}`, client_id: cli.data!.id, date_debut: '2026-01-01', statut: 'actif' })
    .select('id, client_id').single()
  if (c.error) throw new Error(c.error.message)
  const l = await admin.from('contract_machines')
    .insert({ contract_id: c.data!.id, machine_id: serie, date_debut: '2026-01-01', statut: 'actif' })
    .select('id').single()
  if (l.error) throw new Error(l.error.message)
  return { contractId: c.data!.id as string, clientId: c.data!.client_id as number, lineId: l.data!.id as string }
}

beforeAll(async () => {
  if (!ANON_KEY || !SERVICE_KEY) {
    throw new Error('Faltan ANON_KEY/SERVICE_ROLE_KEY. Ejecuta con `supabase start` y exporta las claves.')
  }
  await cleanup(admin)
  await createUserWithRole(admin, ADMIN, 'admin')
})

afterAll(async () => {
  await cleanup(admin)
})

describe('máquinas: sin borrado, con hors service', () => {
  it('un admin de la app no puede borrar una máquina (ni sin historial)', async () => {
    await machine('TEST-HS-DEL')
    const as = await signInAs(ADMIN)
    await as.from('machines').delete().eq('numero_serie', 'TEST-HS-DEL')
    const { data } = await admin.from('machines').select('numero_serie').eq('numero_serie', 'TEST-HS-DEL')
    expect(data).toHaveLength(1)
  })

  it('no se pone hors service una máquina con contrato abierto', async () => {
    await machine('TEST-HS-INCONTRACT')
    await contractWithLine('INCONTRACT', 'TEST-HS-INCONTRACT')
    const as = await signInAs(ADMIN)
    const { error } = await as.from('machines').update({ active: false }).eq('numero_serie', 'TEST-HS-INCONTRACT')
    expect(error?.message).toContain('machine_in_contract')
    const { data } = await admin.from('machines').select('active').eq('numero_serie', 'TEST-HS-INCONTRACT').single()
    expect(data!.active).toBe(true)
  })

  it('en stock: hors service anota la fecha; volver a servicio limpia el rastro', async () => {
    await machine('TEST-HS-STOCK')
    const as = await signInAs(ADMIN)
    const { error } = await as.from('machines')
      .update({ active: false, hors_service_reason: 'Obsolète' }).eq('numero_serie', 'TEST-HS-STOCK')
    expect(error).toBeNull()
    const off = await admin.from('machines')
      .select('active, hors_service_at, hors_service_reason').eq('numero_serie', 'TEST-HS-STOCK').single()
    expect(off.data!.active).toBe(false)
    expect(off.data!.hors_service_at).not.toBeNull()
    expect(off.data!.hors_service_reason).toBe('Obsolète')

    const back = await as.from('machines').update({ active: true }).eq('numero_serie', 'TEST-HS-STOCK')
    expect(back.error).toBeNull()
    const on = await admin.from('machines')
      .select('active, hors_service_at, hors_service_reason, hors_service_by').eq('numero_serie', 'TEST-HS-STOCK').single()
    expect(on.data).toEqual({ active: true, hors_service_at: null, hors_service_reason: null, hors_service_by: null })
  })

  it('una máquina hors service no entra en un contrato (insert directo)', async () => {
    await machine('TEST-HS-OFF1')
    await admin.from('machines').update({ active: false }).eq('numero_serie', 'TEST-HS-OFF1')
    const cli = await admin.from('clients').upsert({ nom_client: 'TEST HS OFF1' }, { onConflict: 'nom_client' }).select('id').single()
    const c = await admin.from('contracts')
      .insert({ numero_contrat: 'TEST-HS-C-OFF1', client_id: cli.data!.id, date_debut: '2026-01-01', statut: 'actif' })
      .select('id').single()
    const { error } = await admin.from('contract_machines')
      .insert({ contract_id: c.data!.id, machine_id: 'TEST-HS-OFF1', date_debut: '2026-01-01', statut: 'actif' })
    expect(error?.message).toContain('machine_hors_service')
  })

  it('…ni guardando el formulario del contrato (update_contract_with_lines)', async () => {
    await machine('TEST-HS-RPC-IN')
    const ctx = await contractWithLine('RPC', 'TEST-HS-RPC-IN')
    await machine('TEST-HS-RPC-OFF')
    await admin.from('machines').update({ active: false }).eq('numero_serie', 'TEST-HS-RPC-OFF')
    const { error } = await admin.rpc('update_contract_with_lines', {
      p_contract_id: ctx.contractId,
      payload: {
        client_id: ctx.clientId, date_debut: '2026-01-01', statut: 'actif', billing_day: null, maintenance_frequency: null,
        lines: [{
          machine_id: 'TEST-HS-RPC-OFF', date_debut: '2026-02-01', billing_day_override: null,
          maintenance_frequency_override: null, notes: null, billing_plan_id: null,
          price_bw_override: null, price_color_override: null, fixed_fee_override: null,
        }],
        retire: [],
      },
    })
    expect(error?.message).toContain('machine_hors_service')
  })

  it('…ni como entrante de un reemplazo', async () => {
    await machine('TEST-HS-REPL-OUT')
    const ctx = await contractWithLine('REPL', 'TEST-HS-REPL-OUT')
    await machine('TEST-HS-REPL-IN')
    await admin.from('machines').update({ active: false }).eq('numero_serie', 'TEST-HS-REPL-IN')
    const { error } = await admin.rpc('replace_contract_machine', {
      p_payload: {
        out_cm_id: ctx.lineId, in_machine_id: 'TEST-HS-REPL-IN', date: '2026-03-01',
        out_counter_bw: 0, out_counter_color: 0, in_counter_bw: 0, in_counter_color: 0,
      },
    })
    expect(error?.message).toContain('machine_hors_service')
    // La saliente sigue en su contrato: el reemplazo fallido no la cerró.
    const { data } = await admin.from('contract_machines').select('date_fin').eq('id', ctx.lineId).single()
    expect(data!.date_fin).toBeNull()
  })
})
