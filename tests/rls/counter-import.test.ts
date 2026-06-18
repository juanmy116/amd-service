import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { adminClient, SERVICE_KEY } from './helpers'

const admin = adminClient()
const SN = 'TEST-PCI-SN1'
const CT = 'TEST-PCI-CT1'
const CLIENT = 'TEST-PCI Client'
// Escenario de ROTACIÓN (caso 9 del gate §9): una máquina con dos líneas en el tiempo.
const SN_ROT = 'TEST-PCI-ROT'
const CT_ROT = 'TEST-PCI-CT-ROT'
const CLIENT_ROT = 'TEST-PCI Client ROT'

async function seedPending(hash: string): Promise<string> {
  const { data, error } = await admin.from('pending_counter_imports').insert({
    image_path: '2026/06/test.jpg', image_size_bytes: 1000, image_hash_sha256: hash,
  }).select('id').single()
  if (error) throw new Error(`seed pending: ${error.message}`)
  return data!.id as string
}

// Borra el escenario en orden inverso a las dependencias (líneas → contadores → contrato → máquina → cliente).
async function cleanScenario() {
  await admin.from('pending_counter_imports').delete().like('image_hash_sha256', 'TESTHASH-%')
  await admin.from('contract_machines').delete().eq('machine_id', SN)
  await admin.from('machine_counters').delete().eq('machine_id', SN)
  await admin.from('contracts').delete().eq('numero_contrat', CT)
  await admin.from('machines').delete().eq('numero_serie', SN)
  await admin.from('clients').delete().eq('nom_client', CLIENT)
  // Escenario de rotación (caso 9).
  await admin.from('contract_machines').delete().eq('machine_id', SN_ROT)
  await admin.from('machine_counters').delete().eq('machine_id', SN_ROT)
  await admin.from('contracts').delete().eq('numero_contrat', CT_ROT)
  await admin.from('machines').delete().eq('numero_serie', SN_ROT)
  await admin.from('clients').delete().eq('nom_client', CLIENT_ROT)
}

beforeAll(async () => {
  if (!SERVICE_KEY) throw new Error('Falta SERVICE_ROLE_KEY. Ejecuta con `supabase start`.')
  await cleanScenario()

  const { error: mErr } = await admin.from('machines').insert({ numero_serie: SN, marque: 'Ricoh', modele: 'T', type: 'color' })
  if (mErr) throw new Error(`seed machine: ${mErr.message}`)

  // Línea de contrato activa: la exige el guard no_active_line de import_counter_from_pending.
  const { data: client, error: cErr } = await admin.from('clients').insert({ nom_client: CLIENT }).select('id').single()
  if (cErr) throw new Error(`seed client: ${cErr.message}`)
  const { data: contract, error: ctErr } = await admin.from('contracts')
    .insert({ client_id: client!.id, numero_contrat: CT, date_debut: '2026-01-01' }).select('id').single()
  if (ctErr) throw new Error(`seed contract: ${ctErr.message}`)
  const { error: cmErr } = await admin.from('contract_machines')
    .insert({ contract_id: contract!.id, machine_id: SN, date_debut: '2026-01-01', statut: 'actif' })
  if (cmErr) throw new Error(`seed contract_machine: ${cmErr.message}`)
}, 60_000)

afterAll(async () => {
  await cleanScenario()
})

describe('process_counter_extraction — semáforo', () => {
  it('🟢 green cuando casa el serial y todo cuadra', async () => {
    const id = await seedPending('TESTHASH-green')
    const { data, error } = await admin.rpc('process_counter_extraction', {
      p_pending_id: id,
      p_extracted: { serial: SN, date_iso: '2026-06-10T10:00:00', counter_bw: 1000, counter_color: 500,
        confidence: 0.95, is_valid_counter_sheet: true, issues: [] },
    })
    expect(error).toBeNull()
    expect(data.light).toBe('green')
    expect(data.matched_machine_id).toBe(SN)
  })

  it('🔴 red cuando el serial no existe', async () => {
    const id = await seedPending('TESTHASH-nomatch')
    const { data } = await admin.rpc('process_counter_extraction', {
      p_pending_id: id,
      p_extracted: { serial: 'NO-EXISTE-XYZ', date_iso: '2026-06-10T10:00:00', counter_bw: 1, counter_color: 1,
        confidence: 0.95, is_valid_counter_sheet: true, issues: [] },
    })
    expect(data.light).toBe('red')
    expect(data.matched_machine_id).toBeNull()
  })

  it('🔴 red cuando no es una hoja de contador', async () => {
    const id = await seedPending('TESTHASH-notsheet')
    const { data } = await admin.rpc('process_counter_extraction', {
      p_pending_id: id,
      p_extracted: { serial: SN, date_iso: '2026-06-10T10:00:00', counter_bw: 1, counter_color: 1,
        confidence: 0.95, is_valid_counter_sheet: false, issues: [] },
    })
    expect(data.light).toBe('red')
  })

  it('🟡 amber cuando las sumas cruzadas no cuadran (Ricoh)', async () => {
    const id = await seedPending('TESTHASH-cross')
    const { data } = await admin.rpc('process_counter_extraction', {
      p_pending_id: id,
      p_extracted: { serial: SN, date_iso: '2026-06-10T10:00:00', counter_bw: 999, counter_color: 500,
        copier_bw: 600, printer_bw: 300, confidence: 0.95, is_valid_counter_sheet: true, issues: [] },
    })
    expect(data.light).toBe('amber')
    expect(data.errors).toContain('V_CROSS_BW')
  })
})

describe('process_counter_extraction — duplicado en la cola por DÍA (V_DUP_PENDING)', () => {
  it('🟡 amber cuando otra lectura de la misma máquina y MISMO DÍA ya está en cola', async () => {
    // A: primera lectura de SN para el 10-mar-2026 (mes aislado de otros tests, que usan junio).
    const idA = await seedPending('TESTHASH-duppend-a')
    const { data: a } = await admin.rpc('process_counter_extraction', {
      p_pending_id: idA,
      p_extracted: { serial: SN, date_iso: '2026-03-10T10:00:00', counter_bw: 100, counter_color: 50,
        confidence: 0.95, is_valid_counter_sheet: true, issues: [] },
    })
    expect(a.light).toBe('green') // aún no hay duplicado → verde

    // B: otra lectura del MISMO DÍA (10-mar) mientras A sigue en pending_review → duplicado.
    const idB = await seedPending('TESTHASH-duppend-b')
    const { data: b } = await admin.rpc('process_counter_extraction', {
      p_pending_id: idB,
      p_extracted: { serial: SN, date_iso: '2026-03-10T16:00:00', counter_bw: 110, counter_color: 55,
        confidence: 0.95, is_valid_counter_sheet: true, issues: [] },
    })
    expect(b.light).toBe('amber')
    expect(b.errors).toContain('V_DUP_PENDING')
  })

  it('🟢 NO es duplicado cuando es otro DÍA del mismo mes (modelo por fecha real)', async () => {
    // Dos lecturas del mismo mes (abril) pero días distintos: con el modelo nuevo conviven.
    const idA = await seedPending('TESTHASH-duppend-c')
    await admin.rpc('process_counter_extraction', {
      p_pending_id: idA,
      p_extracted: { serial: SN, date_iso: '2026-04-05T10:00:00', counter_bw: 200, counter_color: 80,
        confidence: 0.95, is_valid_counter_sheet: true, issues: [] },
    })
    const idB = await seedPending('TESTHASH-duppend-d')
    const { data: b } = await admin.rpc('process_counter_extraction', {
      p_pending_id: idB,
      p_extracted: { serial: SN, date_iso: '2026-04-20T10:00:00', counter_bw: 210, counter_color: 85,
        confidence: 0.95, is_valid_counter_sheet: true, issues: [] },
    })
    expect(b.errors).not.toContain('V_DUP_PENDING')
  })
})

describe('register_counter_duplicate — reenvío del mismo fichero', () => {
  it('incrementa duplicate_count y devuelve la fila; null si el hash no existe', async () => {
    const id = await seedPending('TESTHASH-regdup')

    const { data: first } = await admin.rpc('register_counter_duplicate', { p_hash: 'TESTHASH-regdup' })
    expect(first?.duplicate_count).toBe(1)
    expect(first?.id).toBe(id)

    const { data: second } = await admin.rpc('register_counter_duplicate', { p_hash: 'TESTHASH-regdup' })
    expect(second?.duplicate_count).toBe(2)

    const { data: pci } = await admin.from('pending_counter_imports')
      .select('duplicate_count, last_duplicate_at').eq('id', id).single()
    expect(pci?.duplicate_count).toBe(2)
    expect(pci?.last_duplicate_at).not.toBeNull()

    const { data: none } = await admin.rpc('register_counter_duplicate', { p_hash: 'TESTHASH-does-not-exist' })
    expect(none).toBeNull()
  })
})

describe('import_counter_from_pending — confirmación', () => {
  it('inserta en machine_counters y marca confirmed', async () => {
    const id = await seedPending('TESTHASH-import')
    await admin.rpc('process_counter_extraction', {
      p_pending_id: id,
      p_extracted: { serial: SN, date_iso: '2026-06-10T10:00:00', counter_bw: 2000, counter_color: 800,
        confidence: 0.95, is_valid_counter_sheet: true, issues: [] },
    })
    const { data: counterId, error } = await admin.rpc('import_counter_from_pending', {
      p_pending_id: id, p_reviewed_by: null, p_overrides: {},
    })
    expect(error).toBeNull()
    expect(counterId).toBeTruthy()
    const { data: mc } = await admin.from('machine_counters').select('counter_bw, counter_color').eq('id', counterId).single()
    expect(mc?.counter_bw).toBe(2000)
    const { data: pci } = await admin.from('pending_counter_imports').select('status').eq('id', id).single()
    expect(pci?.status).toBe('confirmed')
  })
})

// Caso 9 del gate (§9): lectura tardía tras ROTACIÓN. Al importar una lectura con fecha
// PASADA, el contract_machine_id debe ser la línea vigente EN ESA FECHA (no la abierta hoy).
describe('import_counter_from_pending — atribución por la línea vigente en la fecha (rotación)', () => {
  it('una lectura de marzo se atribuye a la línea A (ene-mar), no a la B abierta hoy', async () => {
    // Máquina con dos líneas en el tiempo: A [ene→mar] cerrada, B [abr→] abierta.
    const cli = await admin.from('clients').insert({ nom_client: CLIENT_ROT }).select('id').single()
    if (cli.error) throw new Error(cli.error.message)
    await admin.from('machines').insert({ numero_serie: SN_ROT, marque: 'Ricoh', modele: 'T', type: 'color' })
    const ct = await admin.from('contracts')
      .insert({ client_id: cli.data!.id, numero_contrat: CT_ROT, date_debut: '2026-01-01', statut: 'actif', billing_day: 1 })
      .select('id').single()
    const lineA = await admin.from('contract_machines')
      .insert({ contract_id: ct.data!.id, machine_id: SN_ROT, date_debut: '2026-01-01', date_fin: '2026-03-31', statut: 'terminé', end_counter_bw: 900, end_counter_color: 400 })
      .select('id').single()
    const lineB = await admin.from('contract_machines')
      .insert({ contract_id: ct.data!.id, machine_id: SN_ROT, date_debut: '2026-04-01', statut: 'actif' })
      .select('id').single()
    if (lineA.error || lineB.error) throw new Error(lineA.error?.message ?? lineB.error?.message)

    // Lectura con fecha de MARZO (dentro de la vigencia de A, aunque B es la línea abierta hoy).
    const id = await seedPending('TESTHASH-rot')
    await admin.rpc('process_counter_extraction', {
      p_pending_id: id,
      p_extracted: { serial: SN_ROT, date_iso: '2026-03-15T10:00:00', counter_bw: 800, counter_color: 350,
        confidence: 0.95, is_valid_counter_sheet: true, issues: [] },
    })
    const { data: counterId, error } = await admin.rpc('import_counter_from_pending', {
      p_pending_id: id, p_reviewed_by: null, p_overrides: {},
    })
    expect(error).toBeNull()

    // La atribución debe ser la línea A (vigente el 15-mar), NO la B abierta hoy.
    const { data: mc } = await admin.from('machine_counters')
      .select('reading_date, contract_machine_id').eq('id', counterId).single()
    expect(mc?.reading_date).toBe('2026-03-15')
    expect(mc?.contract_machine_id).toBe(lineA.data!.id)
    expect(mc?.contract_machine_id).not.toBe(lineB.data!.id)
  })
})
