import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { adminClient, SERVICE_KEY } from './helpers'

const admin = adminClient()
const SN = 'TEST-PCI-SN1'

async function seedPending(hash: string): Promise<string> {
  const { data, error } = await admin.from('pending_counter_imports').insert({
    image_path: '2026/06/test.jpg', image_size_bytes: 1000, image_hash_sha256: hash,
  }).select('id').single()
  if (error) throw new Error(`seed pending: ${error.message}`)
  return data!.id as string
}

beforeAll(async () => {
  if (!SERVICE_KEY) throw new Error('Falta SERVICE_ROLE_KEY. Ejecuta con `supabase start`.')
  await admin.from('pending_counter_imports').delete().like('image_hash_sha256', 'TESTHASH-%')
  await admin.from('machine_counters').delete().eq('machine_id', SN)
  await admin.from('machines').delete().eq('numero_serie', SN)
  const { error } = await admin.from('machines').insert({ numero_serie: SN, marque: 'Ricoh', modele: 'T', type: 'color' })
  if (error) throw new Error(`seed machine: ${error.message}`)
}, 60_000)

afterAll(async () => {
  await admin.from('pending_counter_imports').delete().like('image_hash_sha256', 'TESTHASH-%')
  await admin.from('machine_counters').delete().eq('machine_id', SN)
  await admin.from('machines').delete().eq('numero_serie', SN)
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

describe('process_counter_extraction — duplicado en la cola (V_DUP_PENDING)', () => {
  it('🟡 amber cuando otra lectura de la misma máquina y mes ya está en cola', async () => {
    // A: primera lectura de SN para marzo 2026 (mes aislado de los otros tests, que usan junio).
    const idA = await seedPending('TESTHASH-duppend-a')
    const { data: a } = await admin.rpc('process_counter_extraction', {
      p_pending_id: idA,
      p_extracted: { serial: SN, date_iso: '2026-03-10T10:00:00', counter_bw: 100, counter_color: 50,
        confidence: 0.95, is_valid_counter_sheet: true, issues: [] },
    })
    expect(a.light).toBe('green') // aún no hay duplicado → verde

    // B: segunda lectura de SN para el MISMO mes mientras A sigue en pending_review.
    const idB = await seedPending('TESTHASH-duppend-b')
    const { data: b } = await admin.rpc('process_counter_extraction', {
      p_pending_id: idB,
      p_extracted: { serial: SN, date_iso: '2026-03-22T10:00:00', counter_bw: 110, counter_color: 55,
        confidence: 0.95, is_valid_counter_sheet: true, issues: [] },
    })
    expect(b.light).toBe('amber')
    expect(b.errors).toContain('V_DUP_PENDING')
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
