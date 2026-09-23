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

  async function readLocation() {
    const { data, error } = await admin.from('machines')
      .select('lat, lng, location_source').eq('numero_serie', SC.snB).single()
    if (error) throw new Error(`read location: ${error.message}`)
    return data
  }

  it('acepta una ubicación completa y en rango, y volver a vaciarla', async () => {
    const set = await setLocation({ lat: 14.6928, lng: -17.4467, location_source: 'admin' })
    expect(set.error).toBeNull()
    expect(await readLocation()).toEqual({ lat: 14.6928, lng: -17.4467, location_source: 'admin' })
    const clear = await setLocation({ lat: null, lng: null, location_source: null })
    expect(clear.error).toBeNull()
    expect(await readLocation()).toEqual({ lat: null, lng: null, location_source: null })
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

  it('rechaza lng fuera de rango', async () => {
    const { error } = await setLocation({ lat: 14.6928, lng: -180.5, location_source: 'admin' })
    expect(error?.code).toBe('23514')
  })

  it('rechaza NaN (float8 lo admite y NaN no está BETWEEN nada)', async () => {
    // JSON no tiene NaN: PostgREST recibe el texto 'NaN' y Postgres lo convierte a double
    // precision. Se exige el código del CHECK (23514) para que no pase por un error de tipo.
    expect((await setLocation({ lat: 'NaN', lng: -17.4467, location_source: 'admin' })).error?.code).toBe('23514')
    expect((await setLocation({ lat: 14.6928, lng: 'NaN', location_source: 'admin' })).error?.code).toBe('23514')
    expect(await readLocation()).toEqual({ lat: null, lng: null, location_source: null })
  })

  it('el CHECK también vale en INSERT', async () => {
    const insert = (numero_serie: string, loc: Record<string, unknown>) =>
      admin.from('machines').insert({ numero_serie, marque: 'TESTGEO', modele: 'G1', ...loc })
    expect((await insert('TEST-GEO-M1', { lat: 14.6928, location_source: 'admin' })).error?.code).toBe('23514')
    expect((await insert('TEST-GEO-M2', { lat: 14.6928, lng: 200, location_source: 'admin' })).error?.code).toBe('23514')
    expect((await insert('TEST-GEO-M3', { lat: 14.6928, lng: -17.4467, location_source: 'first_scan' })).error).toBeNull()
    const { data, error } = await admin.from('machines')
      .select('numero_serie, lat, lng, location_source').like('numero_serie', 'TEST-GEO-M%')
    expect(error).toBeNull()
    expect(data).toEqual([{ numero_serie: 'TEST-GEO-M3', lat: 14.6928, lng: -17.4467, location_source: 'first_scan' }])
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

// Pruebas de campo (posición del técnico, veredicto, sello QR): trigger guard_field_evidence.
// Solo service_role las escribe; un usuario (técnico o admin con su sesión) puede vaciarlas con
// la tarea abierta, nunca ponerlas; reabrir una avería vacía la posición para cualquiera.
describe('guard_field_evidence — las pruebas de campo solo las escribe el servidor', () => {
  const EVIDENCE = {
    tech_lat: 14.6928, tech_lng: -17.4467, tech_accuracy_m: 12, tech_distance_m: 40,
    tech_position_at: '2026-09-25T10:00:00+00:00', tech_presence: 'near',
  }
  const EMPTY = {
    tech_lat: null, tech_lng: null, tech_accuracy_m: null, tech_distance_m: null,
    tech_position_at: null, tech_presence: null,
  }
  const SELECT = 'title, status, qr_verified, qr_scanned_by, tech_lat, tech_lng, tech_accuracy_m, tech_distance_m, tech_position_at, tech_presence'
  const VISIT_SELECT = 'notes, qr_verified, tech_lat, tech_lng, tech_accuracy_m, tech_distance_m, tech_position_at, tech_presence'

  let n = 0
  async function newIncident(status = 'en_cours'): Promise<string> {
    const { data, error } = await admin.from('incidents').insert({
      numero_incident: `TEST-GEO-${++n}`, title: 'Geo', contract_machine_id: t.lineAId,
      assigned_to: t.techA, status,
    }).select('id').single()
    if (error) throw new Error(`seed incident: ${error.message}`)
    return data!.id as string
  }

  async function readIncident(id: string) {
    const { data, error } = await admin.from('incidents').select(SELECT).eq('id', id).single()
    if (error) throw new Error(`read incident: ${error.message}`)
    return data as Record<string, unknown>
  }

  async function readVisitEvidence(id: string) {
    const { data, error } = await admin.from('maintenance_visits').select(VISIT_SELECT).eq('id', id).single()
    if (error) throw new Error(`read visit: ${error.message}`)
    return data as Record<string, unknown>
  }

  // Resuelta (con rastro) y con la posición que puso el servidor.
  async function resolvedWithEvidence(presence = 'far'): Promise<string> {
    const id = await newIncident()
    const { error } = await admin.from('incidents').update({
      status: 'résolu', resolved_via: 'intervention', rapport_intervention: 'Rapport geo.',
      ...EVIDENCE, tech_presence: presence, qr_verified: true, qr_scanned_by: t.techA,
    }).eq('id', id)
    if (error) throw new Error(`resolve: ${error.message}`)
    return id
  }

  it('el técnico no se pone 🟢 ni el sello QR en su avería abierta (el resto del UPDATE sí entra)', async () => {
    const id = await newIncident()
    const c = await signInAs(SC.techAEmail)
    const { error } = await c.from('incidents')
      .update({ title: 'Modifié par le tech', ...EVIDENCE, qr_verified: true, qr_scanned_by: t.techA })
      .eq('id', id)
    expect(error).toBeNull()
    const r = await readIncident(id)
    expect(r.title).toBe('Modifié par le tech')
    expect(r).toMatchObject({ ...EMPTY, qr_verified: false, qr_scanned_by: null })
  })

  it('el técnico no cambia la posición que puso el servidor en su avería resuelta, ni la vacía', async () => {
    const id = await resolvedWithEvidence('far')
    const c = await signInAs(SC.techAEmail)
    expect((await c.from('incidents').update({ tech_presence: 'near', tech_distance_m: 10 }).eq('id', id)).error).toBeNull()
    expect((await c.from('incidents').update({ ...EMPTY, qr_verified: false, qr_scanned_by: null }).eq('id', id)).error).toBeNull()
    const r = await readIncident(id)
    expect(r).toMatchObject({ tech_presence: 'far', tech_distance_m: 40, tech_lat: 14.6928, qr_verified: true, qr_scanned_by: t.techA })
  })

  it('el técnico no se pone 🟢 ni el sello QR en su visita de mantenimiento', async () => {
    const c = await signInAs(SC.techAEmail)
    const { error } = await c.from('maintenance_visits')
      .update({ notes: 'Note du tech', ...EVIDENCE, qr_verified: true })
      .eq('id', t.visitAId)
    expect(error).toBeNull()
    const v = await readVisitEvidence(t.visitAId)
    expect(v.notes).toBe('Note du tech')
    expect(v).toMatchObject({ ...EMPTY, qr_verified: false })
  })

  it('un admin con su sesión (authenticated, no service_role) tampoco puede ponerlas', async () => {
    const id = await newIncident()
    const c = await signInAs(SC.adminEmail)
    expect((await c.from('incidents').update({ ...EVIDENCE, qr_verified: true, qr_scanned_by: t.techA }).eq('id', id)).error).toBeNull()
    expect(await readIncident(id)).toMatchObject({ ...EMPTY, qr_verified: false, qr_scanned_by: null })

    expect((await c.from('maintenance_visits').update({ ...EVIDENCE, qr_verified: true }).eq('id', t.visitAId)).error).toBeNull()
    expect(await readVisitEvidence(t.visitAId)).toMatchObject({ ...EMPTY, qr_verified: false })
  })

  it('service_role sí las escribe (incidencia y visita)', async () => {
    const id = await newIncident()
    expect((await admin.from('incidents').update({ ...EVIDENCE, qr_verified: true, qr_scanned_by: t.techA }).eq('id', id)).error).toBeNull()
    expect(await readIncident(id)).toMatchObject({ ...EVIDENCE, qr_verified: true, qr_scanned_by: t.techA })

    expect((await admin.from('maintenance_visits').update({ ...EVIDENCE, qr_verified: true }).eq('id', t.visitAId)).error).toBeNull()
    expect(await readVisitEvidence(t.visitAId)).toMatchObject({ ...EVIDENCE, qr_verified: true })
    // Deja la visita compartida como estaba para los demás casos.
    expect((await admin.from('maintenance_visits').update({ ...EMPTY, qr_verified: false }).eq('id', t.visitAId)).error).toBeNull()
  })

  it('con la tarea abierta, el usuario sí puede vaciarlas (lo que hace clearResolution)', async () => {
    const id = await newIncident()
    expect((await admin.from('incidents').update({ ...EVIDENCE, qr_verified: true, qr_scanned_by: t.techA }).eq('id', id)).error).toBeNull()
    const c = await signInAs(SC.techAEmail)
    expect((await c.from('incidents').update({ ...EMPTY, qr_verified: false, qr_scanned_by: null }).eq('id', id)).error).toBeNull()
    expect(await readIncident(id)).toMatchObject({ ...EMPTY, qr_verified: false, qr_scanned_by: null })
  })

  it('reabrir una avería vacía la posición, la reabra el técnico o el servidor', async () => {
    const byTech = await resolvedWithEvidence('near')
    const c = await signInAs(SC.techAEmail)
    expect((await c.from('incidents').update({ status: 'en_cours' }).eq('id', byTech)).error).toBeNull()
    expect(await readIncident(byTech)).toMatchObject({ status: 'en_cours', ...EMPTY, qr_verified: false })

    const byServer = await resolvedWithEvidence('near')
    expect((await admin.from('incidents').update({ status: 'assigné' }).eq('id', byServer)).error).toBeNull()
    expect(await readIncident(byServer)).toMatchObject({ status: 'assigné', ...EMPTY, qr_verified: false })
  })

  it('un INSERT de usuario llega sin pruebas (cliente: avería; admin: visita)', async () => {
    const client = await signInAs(SC.clientAEmail)
    const { error } = await client.from('incidents').insert({
      numero_incident: 'TEST-GEO-INS', title: 'Geo insert', contract_machine_id: t.lineAId,
      ...EVIDENCE, qr_verified: true,
    })
    expect(error).toBeNull()
    const { data: inc, error: e1 } = await admin.from('incidents').select(SELECT).eq('numero_incident', 'TEST-GEO-INS').single()
    expect(e1).toBeNull()
    expect(inc).toMatchObject({ ...EMPTY, qr_verified: false, qr_scanned_by: null })

    const adminUser = await signInAs(SC.adminEmail)
    const { data: v, error: e2 } = await adminUser.from('maintenance_visits').insert({
      plan_id: t.planAId, contract_machine_id: t.lineAId, scheduled_date: '2026-11-15',
      ...EVIDENCE, qr_verified: true,
    }).select('id').single()
    expect(e2).toBeNull()
    expect(await readVisitEvidence(v!.id as string)).toMatchObject({ ...EMPTY, qr_verified: false })
  })
})
