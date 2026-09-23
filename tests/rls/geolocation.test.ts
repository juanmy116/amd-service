import { describe, it, expect, beforeAll, beforeEach, afterAll } from 'vitest'
import { adminClient, signInAs, cleanup, ANON_KEY, SERVICE_KEY } from './helpers'
import { seedTenants, SC, type Tenants } from './scenario'

// Geolocalización, Fase 3 de la PWA de técnicos (migración 20260925100000).
//
// 1. close_maintenance_visit ya NO pone qr_verified = true a ciegas: cierra la visita y deja el
//    sello del QR como estaba (lo pone solo el escaneo real).
// 2. El CHECK de machines exige una ubicación completa y en rango (lat + lng + origen) o nada.
// 3. Un técnico no puede fijar la ubicación de una máquina con su sesión: machines solo tiene
//    policy de SELECT para técnicos (tech_machines_select); la escritura es del admin o del
//    servidor (service_role).

const admin = adminClient()
let t: Tenants

async function newVisit(scheduled: string, qrVerified: boolean): Promise<string> {
  const { data, error } = await admin.from('maintenance_visits')
    .insert({ plan_id: t.planAId, contract_machine_id: t.lineAId, scheduled_date: scheduled, qr_verified: qrVerified })
    .select('id').single()
  if (error) throw new Error(`seed visit ${scheduled}: ${error.message}`)
  return data!.id as string
}

async function closeVisit(visitId: string) {
  // La RPC exige auth.role() = 'service_role': se llama con el cliente de servicio.
  return admin.rpc('close_maintenance_visit', {
    p_visit_id: visitId,
    p_serie: SC.snA,
    p_done_by: t.techA,
    p_notes: 'TEST geo',
    p_part_ids: null,
    p_autres_pieces: null,
  })
}

async function readVisit(visitId: string): Promise<{ status: string; qr_verified: boolean; done_by: string | null }> {
  const { data, error } = await admin.from('maintenance_visits')
    .select('status, qr_verified, done_by').eq('id', visitId).single()
  if (error) throw new Error(`read visit: ${error.message}`)
  return data as { status: string; qr_verified: boolean; done_by: string | null }
}

beforeAll(async () => {
  if (!ANON_KEY || !SERVICE_KEY) {
    throw new Error('Faltan ANON_KEY/SERVICE_ROLE_KEY. Ejecuta con `supabase start` y exporta las claves.')
  }
  await cleanup(admin)
  t = await seedTenants(admin)
}, 90_000)

afterAll(async () => {
  // Las visitas (incluidas las que crea la RPC al cerrar) cuelgan de la línea A
  // (ON DELETE CASCADE): cleanup() se las lleva con el grafo base.
  await cleanup(admin)
})

describe('close_maintenance_visit — sin QR falso', () => {
  it('una visita sin escanear queda fait con qr_verified = false', async () => {
    const id = await newVisit('2026-10-01', false)
    const { data, error } = await closeVisit(id)
    expect(error).toBeNull()
    expect((data as { ok: boolean }).ok).toBe(true)
    const v = await readVisit(id)
    expect(v.status).toBe('fait')
    expect(v.done_by).toBe(t.techA)
    expect(v.qr_verified).toBe(false)
  })

  it('una visita ya escaneada conserva qr_verified = true', async () => {
    const id = await newVisit('2026-10-02', true)
    const { error } = await closeVisit(id)
    expect(error).toBeNull()
    const v = await readVisit(id)
    expect(v.status).toBe('fait')
    expect(v.qr_verified).toBe(true)
  })

  it('la visita siguiente que crea el cierre arranca sin sello', async () => {
    const id = await newVisit('2026-10-03', true)
    const { data, error } = await closeVisit(id)
    expect(error).toBeNull()
    const next = (data as { next_date: string }).next_date
    const { data: rows, error: e } = await admin.from('maintenance_visits')
      .select('status, qr_verified').eq('contract_machine_id', t.lineAId).eq('scheduled_date', next)
    expect(e).toBeNull()
    expect(rows).toEqual([{ status: 'planifié', qr_verified: false }])
  })
})

describe('machines — CHECK de ubicación completa', () => {
  async function setLocation(patch: Record<string, unknown>) {
    return admin.from('machines').update(patch).eq('numero_serie', SC.snB)
  }

  // Cada caso parte de una máquina sin ubicación: si uno se colara, no contamina al siguiente.
  beforeEach(async () => {
    const { error } = await setLocation({ lat: null, lng: null, location_source: null })
    if (error) throw new Error(`reset location: ${error.message}`)
  })

  it('acepta una ubicación completa y en rango, y volver a vaciarla', async () => {
    const set = await setLocation({ lat: 14.6928, lng: -17.4467, location_source: 'admin' })
    expect(set.error).toBeNull()
    const clear = await setLocation({ lat: null, lng: null, location_source: null })
    expect(clear.error).toBeNull()
  })

  it('rechaza lat sin lng (y lng sin lat)', async () => {
    // Regresión: sin IS NOT NULL explícitos, `NULL BETWEEN …` daba NULL y el CHECK lo dejaba pasar.
    expect((await setLocation({ lat: 14.6928, location_source: 'admin' })).error).not.toBeNull()
    expect((await setLocation({ lng: -17.4467, location_source: 'admin' })).error).not.toBeNull()
  })

  it('rechaza lat fuera de rango', async () => {
    const { error } = await setLocation({ lat: 95, lng: -17.4467, location_source: 'admin' })
    expect(error).not.toBeNull()
  })

  it('rechaza lat/lng sin origen', async () => {
    const { error } = await setLocation({ lat: 14.6928, lng: -17.4467 })
    expect(error).not.toBeNull()
  })

  it('rechaza un origen desconocido', async () => {
    const { error } = await setLocation({ lat: 14.6928, lng: -17.4467, location_source: 'gps' })
    expect(error).not.toBeNull()
  })
})

describe('RLS — el técnico no fija la ubicación de una máquina', () => {
  it('el técnico A ve su máquina pero su UPDATE de lat/lng no la cambia', async () => {
    const c = await signInAs(SC.techAEmail)
    const { data: seen } = await c.from('machines').select('numero_serie').eq('numero_serie', SC.snA)
    expect((seen ?? []).map((r) => r.numero_serie)).toEqual([SC.snA])

    // Sin policy de UPDATE para técnicos, PostgREST no da error: filtra la fila (0 filas).
    await c.from('machines')
      .update({ lat: 14.7, lng: -17.45, location_source: 'first_scan' })
      .eq('numero_serie', SC.snA)
    const { data, error } = await admin.from('machines')
      .select('lat, lng, location_source').eq('numero_serie', SC.snA).single()
    expect(error).toBeNull()
    expect(data).toEqual({ lat: null, lng: null, location_source: null })
  })
})
