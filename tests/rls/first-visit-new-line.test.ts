import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { adminClient, ANON_KEY, SERVICE_KEY, cleanup } from './helpers'

// Trigger trg_schedule_first_visit_for_new_line (20261023160000): una máquina que entra en un
// contrato con plan de mantenimiento activo recibe su primera visita. Antes se quedaba sin
// ninguna (las visitas solo nacían al crear el plan, al cerrar una visita o al reemplazar).
//
// Fecha: la próxima visita pendiente del contrato (>= hoy y >= inicio de la línea); si no hay,
// max(inicio, hoy) + 30 / 90 días según la frecuencia efectiva. Prefijo TEST- → cleanup().

const admin = adminClient()

const iso = (d: Date) => d.toISOString().slice(0, 10)
const addDays = (base: string, days: number) => {
  const d = new Date(`${base}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + days)
  return iso(d)
}
const TODAY = iso(new Date())

async function seedContract(suffix: string, plan?: { frequency: 'mensuel' | 'trimestriel' }) {
  const cli = await admin.from('clients')
    .upsert({ nom_client: `TEST FV ${suffix}` }, { onConflict: 'nom_client' }).select('id').single()
  if (cli.error) throw new Error(`seed client ${suffix}: ${cli.error.message}`)
  const contract = await admin.from('contracts')
    .insert({ numero_contrat: `TEST-FV-C-${suffix}`, client_id: cli.data!.id, date_debut: '2026-01-01', statut: 'actif' })
    .select('id').single()
  if (contract.error) throw new Error(`seed contract ${suffix}: ${contract.error.message}`)
  const contractId = contract.data!.id as string
  let planId: string | null = null
  if (plan) {
    const p = await admin.from('maintenance_plans')
      .insert({ contract_id: contractId, frequency: plan.frequency, active: true }).select('id').single()
    if (p.error) throw new Error(`seed plan ${suffix}: ${p.error.message}`)
    planId = p.data!.id as string
  }
  return { contractId, planId }
}

async function machine(serie: string) {
  const m = await admin.from('machines').insert({ numero_serie: serie, marque: 'TESTFV', modele: 'M' })
  if (m.error) throw new Error(`seed machine ${serie}: ${m.error.message}`)
}

async function addLine(contractId: string, serie: string, opts: { dateDebut?: string; freq?: 'mensuel' | 'trimestriel' } = {}) {
  await machine(serie)
  const l = await admin.from('contract_machines').insert({
    contract_id: contractId, machine_id: serie, date_debut: opts.dateDebut ?? TODAY, statut: 'actif',
    maintenance_frequency_override: opts.freq ?? null,
  }).select('id').single()
  if (l.error) throw new Error(`seed line ${serie}: ${l.error.message}`)
  return l.data!.id as string
}

async function visitsOf(lineId: string) {
  const { data, error } = await admin.from('maintenance_visits')
    .select('scheduled_date, status, plan_id').eq('contract_machine_id', lineId).order('scheduled_date')
  if (error) throw new Error(error.message)
  return data!
}

beforeAll(async () => {
  if (!ANON_KEY || !SERVICE_KEY) {
    throw new Error('Faltan ANON_KEY/SERVICE_ROLE_KEY. Ejecuta con `supabase start` y exporta las claves.')
  }
  await cleanup(admin)
})

afterAll(async () => {
  await cleanup(admin)
})

describe('primera visita de una máquina nueva en un contrato con plan', () => {
  it('contrato sin plan: no crea visitas', async () => {
    const { contractId } = await seedContract('NOPLAN')
    const line = await addLine(contractId, 'TEST-FV-NOPLAN')
    expect(await visitsOf(line)).toEqual([])
  })

  it('se suma a la próxima visita pendiente del contrato (mismo viaje)', async () => {
    const { contractId, planId } = await seedContract('NEXT', { frequency: 'trimestriel' })
    const l1 = await addLine(contractId, 'TEST-FV-NEXT-1')
    // La 1ª línea recibió la suya por el trigger (no había ninguna pendiente → hoy + 90).
    expect(await visitsOf(l1)).toEqual([{ scheduled_date: addDays(TODAY, 90), status: 'planifié', plan_id: planId }])
    // La oficina la adelanta a dentro de 20 días.
    const upd = await admin.from('maintenance_visits').update({ scheduled_date: addDays(TODAY, 20) }).eq('contract_machine_id', l1)
    expect(upd.error).toBeNull()

    const l2 = await addLine(contractId, 'TEST-FV-NEXT-2')
    expect(await visitsOf(l2)).toEqual([{ scheduled_date: addDays(TODAY, 20), status: 'planifié', plan_id: planId }])
  })

  it('una visita del contrato ya atrasada no se copia: hoy + frecuencia', async () => {
    const { contractId } = await seedContract('LATE', { frequency: 'mensuel' })
    const l1 = await addLine(contractId, 'TEST-FV-LATE-1')
    await admin.from('maintenance_visits').update({ scheduled_date: '2026-01-15', status: 'en_retard' }).eq('contract_machine_id', l1)

    const l2 = await addLine(contractId, 'TEST-FV-LATE-2')
    expect((await visitsOf(l2)).map((v) => v.scheduled_date)).toEqual([addDays(TODAY, 30)])
  })

  it('la frecuencia propia de la línea manda sobre la del plan', async () => {
    const { contractId } = await seedContract('FREQ', { frequency: 'trimestriel' })
    const line = await addLine(contractId, 'TEST-FV-FREQ', { freq: 'mensuel' })
    expect((await visitsOf(line)).map((v) => v.scheduled_date)).toEqual([addDays(TODAY, 30)])
  })

  it('una máquina que se instala más tarde no recibe una visita anterior a su instalación', async () => {
    const { contractId } = await seedContract('LATER', { frequency: 'mensuel' })
    const l1 = await addLine(contractId, 'TEST-FV-LATER-1')
    await admin.from('maintenance_visits').update({ scheduled_date: addDays(TODAY, 5) }).eq('contract_machine_id', l1)

    const start = addDays(TODAY, 40)
    const l2 = await addLine(contractId, 'TEST-FV-LATER-2', { dateDebut: start })
    expect((await visitsOf(l2)).map((v) => v.scheduled_date)).toEqual([addDays(start, 30)])
  })

  it('reemplazo: la entrante hereda la visita de la saliente, sin duplicar', async () => {
    const { contractId } = await seedContract('REPL', { frequency: 'trimestriel' })
    const out = await addLine(contractId, 'TEST-FV-REPL-OUT', { dateDebut: '2026-01-01' })
    const outVisit = (await visitsOf(out))[0]
    await machine('TEST-FV-REPL-IN')
    const { data: inId, error } = await admin.rpc('replace_contract_machine', {
      p_payload: {
        out_cm_id: out, in_machine_id: 'TEST-FV-REPL-IN', date: TODAY,
        out_counter_bw: 0, out_counter_color: 0, in_counter_bw: 0, in_counter_color: 0,
      },
    })
    expect(error).toBeNull()
    expect(await visitsOf(inId as string)).toEqual([outVisit])
    expect(await visitsOf(out)).toEqual([])
  })

  it('camino real: añadir una máquina guardando el contrato (update_contract_with_lines)', async () => {
    const { contractId, planId } = await seedContract('RPC', { frequency: 'trimestriel' })
    await addLine(contractId, 'TEST-FV-RPC-1')
    await machine('TEST-FV-RPC-2')
    const { error } = await admin.rpc('update_contract_with_lines', {
      p_contract_id: contractId,
      payload: {
        client_id: (await admin.from('contracts').select('client_id').eq('id', contractId).single()).data!.client_id,
        date_debut: '2026-01-01', statut: 'actif', billing_day: null, maintenance_frequency: null,
        lines: [{
          machine_id: 'TEST-FV-RPC-2', date_debut: TODAY, billing_day_override: null,
          maintenance_frequency_override: null, notes: null, billing_plan_id: null,
          price_bw_override: null, price_color_override: null, fixed_fee_override: null,
        }],
        retire: [],
      },
    })
    expect(error).toBeNull()
    const { data: line } = await admin.from('contract_machines')
      .select('id').eq('machine_id', 'TEST-FV-RPC-2').is('date_fin', null).single()
    expect(await visitsOf(line!.id)).toEqual([{ scheduled_date: addDays(TODAY, 90), status: 'planifié', plan_id: planId }])
  })
})
