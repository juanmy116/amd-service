import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { adminClient, ANON_KEY, SERVICE_KEY, cleanup } from './helpers'

// BANCO ADVERSARIAL de los GUARDS POR LÍNEA (PR-D.3, FASE 4 del spec
// 2026-06-17-contadores-fecha-real-y-linea-design.md §6 «Guards»).
//
// delete_contract y el guard de cambio de cliente (update_contract_with_lines)
// contaban el historial de lecturas SOLO por `machine_counters.contract_id`. Pero
// con el rediseño la atribución canónica de una lectura pasa a la LÍNEA
// (`contract_machine_id`), y esa columna puede estar poblada con `contract_id NULL`
// — exactamente lo que produce Princity (ver P0-1b de PR-D.2). Esa lectura es
// invisible al guard viejo:
//
//   - delete_contract: cuenta 0 contadores → intenta borrar → la cascada a
//     contract_machines choca con la FK machine_counters.contract_machine_id
//     (ON DELETE RESTRICT) → error de FK crudo (el guard «mintió»).
//   - cambio de cliente: no ve historial → permite reasignar el contrato a otro
//     cliente → las facturas futuras de esa línea se cobran al cliente equivocado.
//
// Estos casos fijan el comportamiento correcto: ambos guards cuentan también las
// lecturas atadas por contract_machine_id a una línea del contrato.
//
// Prefijo TEST- → cleanup() lo barre.

const admin = adminClient()

// Siembra cliente + máquina + contrato + 1 línea abierta. Devuelve los ids.
async function seedContract(
  suffix: string,
): Promise<{ serie: string; contractId: string; lineId: string; clientId: number }> {
  const serie = `TEST-D3-${suffix}`
  const contractNum = `TEST-D3-C-${suffix}`

  const cli = await admin.from('clients')
    .upsert({ nom_client: `TEST D3 ${suffix}` }, { onConflict: 'nom_client' }).select('id').single()
  if (cli.error) throw new Error(`seed client ${suffix}: ${cli.error.message}`)
  const clientId = cli.data!.id as number

  const mch = await admin.from('machines')
    .insert({ numero_serie: serie, marque: 'TESTD3', modele: 'M', type: 'color' })
  if (mch.error) throw new Error(`seed machine ${suffix}: ${mch.error.message}`)

  const contract = await admin.from('contracts')
    .insert({ numero_contrat: contractNum, client_id: clientId, date_debut: '2026-01-01', statut: 'actif', billing_day: 1 })
    .select('id').single()
  if (contract.error) throw new Error(`seed contract ${suffix}: ${contract.error.message}`)
  const contractId = contract.data!.id as string

  const line = await admin.from('contract_machines')
    .insert({ contract_id: contractId, machine_id: serie, date_debut: '2026-01-01', statut: 'actif' })
    .select('id').single()
  if (line.error) throw new Error(`seed line ${suffix}: ${line.error.message}`)
  const lineId = line.data!.id as string

  return { serie, contractId, lineId, clientId }
}

// Inserta una lectura. Por defecto la ata SOLO por línea (contract_id NULL) — el
// agujero que reproduce Princity. Con `withContractId` se prueba la no-regresión.
async function seedCounter(
  ctx: { serie: string; contractId: string; lineId: string; clientId: number },
  opts: { withContractId?: boolean } = {},
): Promise<void> {
  const ins = await admin.from('machine_counters').insert({
    machine_id: ctx.serie,
    contract_id: opts.withContractId ? ctx.contractId : null,
    contract_machine_id: ctx.lineId,
    client_id: ctx.clientId,
    year: 2026, month: 5, day: 31, counter_bw: 1000, counter_color: 100,
    recorded_at: '2026-05-31T10:00:00Z',
  })
  if (ins.error) throw new Error(`seed counter: ${ins.error.message}`)
}

// Snapshot MALFORMADO (reproducción de Codex por inserción directa, P2 defensivo): una
// factura con cabecera contract_id NULL + una invoice_line con contract_id NULL pero
// contract_machine_id apuntando a una línea real del contrato. No es alcanzable por la
// emisión endurecida (siempre puebla contract_id), pero los guards deben blindarlo: sin el
// OR por línea en invoice_lines, delete borraría el contrato (dejando líneas de factura
// huérfanas) y el cambio de cliente quedaría permitido. Prefijo TESTINV (facturas
// inmutables → cleanup no las barre), idempotente.
async function seedMalformedInvoiceContract(): Promise<{ contractId: string; lineId: string }> {
  const cli = await admin.from('clients')
    .upsert({ nom_client: 'TESTINV D3 MALFORMED' }, { onConflict: 'nom_client' }).select('id').single()
  if (cli.error) throw new Error(cli.error.message)
  const clientId = cli.data!.id as number

  const serie = 'TESTINV-D3-MAL'
  const found = await admin.from('machines').select('numero_serie').eq('numero_serie', serie).maybeSingle()
  if (!found.data) {
    const m = await admin.from('machines').insert({ numero_serie: serie, marque: 'TESTINV', modele: 'M', type: 'color' })
    if (m.error) throw new Error(`seed mal machine: ${m.error.message}`)
  }

  const num = 'TESTINV-D3-MAL-CONTRAT'
  let contractId: string
  const foundC = await admin.from('contracts').select('id').eq('numero_contrat', num).maybeSingle()
  if (foundC.data) {
    contractId = foundC.data.id as string
  } else {
    const c = await admin.from('contracts')
      .insert({ numero_contrat: num, client_id: clientId, date_debut: '2026-01-01', statut: 'actif', billing_day: 1 })
      .select('id').single()
    if (c.error) throw new Error(`seed mal contract: ${c.error.message}`)
    contractId = c.data!.id as string
  }

  let lineId: string
  const foundL = await admin.from('contract_machines').select('id').eq('contract_id', contractId).maybeSingle()
  if (foundL.data) {
    lineId = foundL.data.id as string
  } else {
    const l = await admin.from('contract_machines')
      .insert({ contract_id: contractId, machine_id: serie, date_debut: '2026-01-01', statut: 'actif' })
      .select('id').single()
    if (l.error) throw new Error(`seed mal line: ${l.error.message}`)
    lineId = l.data!.id as string
  }

  const fnum = 'TESTINV-D3-MAL-0001'
  const foundInv = await admin.from('invoices').select('id').eq('numero_facture', fnum).maybeSingle()
  if (!foundInv.data) {
    const inv = await admin.from('invoices').insert({
      numero_facture: fnum, client_id: clientId, client_name: 'TESTINV D3 MALFORMED',
      contract_id: null, period_year: 2026, period_month: 6, total_amount: 1000,
    }).select('id').single()
    if (inv.error) throw new Error(`seed mal invoice: ${inv.error.message}`)
    const line = await admin.from('invoice_lines').insert({
      invoice_id: inv.data!.id, contract_id: null, contract_machine_id: lineId,
      numero_contrat: num, machine_label: 'TESTINV mal', plan_name: 'TEST plan', billing_type: 'per_copy',
    })
    if (line.error) throw new Error(`seed mal invoice_line: ${line.error.message}`)
  }

  return { contractId, lineId }
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

// ─────────────────────────────────────────────────────────────────────────────
// 1) delete_contract
// ─────────────────────────────────────────────────────────────────────────────
describe('delete_contract — historial por línea', () => {
  it('una lectura atada SOLO por contract_machine_id (contract_id NULL) bloquea el borrado', async () => {
    const ctx = await seedContract('DELLINE')
    await seedCounter(ctx) // contract_id NULL, contract_machine_id = línea
    const { data, error } = await admin.rpc('delete_contract', { p_contract_id: ctx.contractId })
    // Modelo viejo: cuenta 0 contadores → DELETE → la cascada choca con la FK
    // RESTRICT de contract_machine_id → error de FK (o, si no hubiera RESTRICT,
    // borraría con historial). Modelo nuevo: lo detecta y rechaza limpiamente.
    expect(error).toBeNull()
    expect(data.deleted).toBe(false)
    expect(data.counters).toBe(1)
  })

  it('no-regresión: una lectura atada por contract_id sigue bloqueando el borrado', async () => {
    const ctx = await seedContract('DELCID')
    await seedCounter(ctx, { withContractId: true })
    const { data, error } = await admin.rpc('delete_contract', { p_contract_id: ctx.contractId })
    expect(error).toBeNull()
    expect(data.deleted).toBe(false)
    expect(data.counters).toBe(1)
  })

  it('no cuenta dos veces: lectura atada por contract_id Y línea → counters = 1', async () => {
    // Caso normal de una lectura nueva (actions.ts puebla ambas columnas). El OR no
    // debe duplicar la cuenta (count(*) sobre el OR es una sola fila).
    const ctx = await seedContract('DELBOTH')
    await admin.from('machine_counters').insert({
      machine_id: ctx.serie, contract_id: ctx.contractId, contract_machine_id: ctx.lineId,
      client_id: ctx.clientId, year: 2026, month: 5, day: 31, counter_bw: 1000, counter_color: 100,
      recorded_at: '2026-05-31T10:00:00Z',
    })
    const { data, error } = await admin.rpc('delete_contract', { p_contract_id: ctx.contractId })
    expect(error).toBeNull()
    expect(data.deleted).toBe(false)
    expect(data.counters).toBe(1)
  })

  it('un contrato sin historial se borra limpiamente', async () => {
    const ctx = await seedContract('DELCLEAN')
    const { data, error } = await admin.rpc('delete_contract', { p_contract_id: ctx.contractId })
    expect(error).toBeNull()
    expect(data.deleted).toBe(true)
  })

  it('un contrato CON factura no se puede borrar (registro contable inmutable)', async () => {
    // Las facturas son inmutables → cleanup() no las barre y dejarían el contrato/cliente
    // pegados por la FK RESTRICT. Por eso este caso usa el prefijo 'TESTINV' (fuera del
    // barrido de cleanup) e idempotente, igual que billing-isolation.test.ts.
    const cli = await admin.from('clients')
      .upsert({ nom_client: 'TESTINV D3 DELINV' }, { onConflict: 'nom_client' }).select('id').single()
    if (cli.error) throw new Error(cli.error.message)
    const clientId = cli.data!.id as number

    const num = 'TESTINV-D3-CONTRAT'
    let contractId: string
    const foundC = await admin.from('contracts').select('id').eq('numero_contrat', num).maybeSingle()
    if (foundC.data) {
      contractId = foundC.data.id as string
    } else {
      const c = await admin.from('contracts')
        .insert({ numero_contrat: num, client_id: clientId, date_debut: '2026-01-01', statut: 'actif', billing_day: 1 })
        .select('id').single()
      if (c.error) throw new Error(`seed TESTINV contract: ${c.error.message}`)
      contractId = c.data!.id as string
    }

    // Factura idempotente atada a ese contrato (no se puede borrar → reutilizar si existe).
    const fnum = 'TESTINV-D3-0001'
    const foundInv = await admin.from('invoices').select('id').eq('numero_facture', fnum).maybeSingle()
    if (!foundInv.data) {
      const inv = await admin.from('invoices').insert({
        numero_facture: fnum, client_id: clientId, client_name: 'TESTINV D3 DELINV',
        contract_id: contractId, period_year: 2026, period_month: 6, total_amount: 1000,
      })
      if (inv.error) throw new Error(`seed TESTINV invoice: ${inv.error.message}`)
    }

    const { data, error } = await admin.rpc('delete_contract', { p_contract_id: contractId })
    expect(error).toBeNull()
    expect(data.deleted).toBe(false)
    expect(data.invoices).toBe(1)
    // El contrato no tenía lecturas → la factura es lo único que lo bloquea.
    expect(data.counters).toBe(0)
  })

  it('P2 defensivo: una invoice_line atada por línea (cabecera contract_id NULL) bloquea el borrado', async () => {
    const { contractId } = await seedMalformedInvoiceContract()
    const { data, error } = await admin.rpc('delete_contract', { p_contract_id: contractId })
    // Sin el OR por línea: invoices.contract_id NULL → 0 facturas → borraría el contrato
    // dejando la invoice_line huérfana. Con el blindaje: la detecta por contract_machine_id.
    expect(error).toBeNull()
    expect(data.deleted).toBe(false)
    expect(data.invoices).toBe(1)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// 2) update_contract_with_lines — guard de cambio de cliente
// ─────────────────────────────────────────────────────────────────────────────
describe('update_contract_with_lines — cambio de cliente con historial por línea', () => {
  // Cliente destino al que se intenta reasignar (debe existir; el guard salta antes).
  async function otherClient(suffix: string): Promise<number> {
    const c = await admin.from('clients')
      .upsert({ nom_client: `TEST D3 OTHER ${suffix}` }, { onConflict: 'nom_client' }).select('id').single()
    if (c.error) throw new Error(`other client ${suffix}: ${c.error.message}`)
    return c.data!.id as number
  }

  function changeClientPayload(newClientId: number) {
    return { client_id: newClientId, date_debut: '2026-01-01', statut: 'actif', billing_day: 1, lines: [], retire: [] }
  }

  it('una lectura atada SOLO por contract_machine_id (contract_id NULL) bloquea el cambio de cliente', async () => {
    const ctx = await seedContract('CHGLINE')
    await seedCounter(ctx) // contract_id NULL, contract_machine_id = línea
    const target = await otherClient('CHGLINE')
    const { error } = await admin.rpc('update_contract_with_lines', {
      p_contract_id: ctx.contractId, payload: changeClientPayload(target),
    })
    // Modelo viejo: no ve la lectura (contract_id NULL) → permite el cambio. Mal.
    expect(error?.message).toContain('client_change_forbidden_history')
  })

  it('no-regresión: una lectura atada por contract_id sigue bloqueando el cambio', async () => {
    const ctx = await seedContract('CHGCID')
    await seedCounter(ctx, { withContractId: true })
    const target = await otherClient('CHGCID')
    const { error } = await admin.rpc('update_contract_with_lines', {
      p_contract_id: ctx.contractId, payload: changeClientPayload(target),
    })
    expect(error?.message).toContain('client_change_forbidden_history')
  })

  it('un contrato sin historial sí permite cambiar de cliente', async () => {
    const ctx = await seedContract('CHGCLEAN')
    const target = await otherClient('CHGCLEAN')
    const { error } = await admin.rpc('update_contract_with_lines', {
      p_contract_id: ctx.contractId, payload: changeClientPayload(target),
    })
    expect(error).toBeNull()
    const after = await admin.from('contracts').select('client_id').eq('id', ctx.contractId).single()
    expect(after.data!.client_id).toBe(target)
  })

  it('P2 defensivo: una invoice_line atada por línea (cabecera contract_id NULL) bloquea el cambio', async () => {
    const { contractId } = await seedMalformedInvoiceContract()
    const target = await otherClient('MALFORMED')
    const { error } = await admin.rpc('update_contract_with_lines', {
      p_contract_id: contractId, payload: changeClientPayload(target),
    })
    // Sin el OR por línea: invoice_lines.contract_id NULL → guard no ve historial → permite.
    expect(error?.message).toContain('client_change_forbidden_history')
  })
})
