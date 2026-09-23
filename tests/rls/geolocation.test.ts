import { describe, it, expect, beforeAll, beforeEach, afterAll } from 'vitest'
import { adminClient, anonClient, signInAs, cleanup, ANON_KEY, SERVICE_KEY } from './helpers'
import { expectEmpty } from './assert'
import { seedTenants, SC, type Tenants } from './scenario'

// Geolocalización, Fase 3 de la PWA de técnicos (migración 20260925100000).
//
// 1. close_maintenance_visit ya NO pone qr_verified = true a ciegas: cierra la visita y deja el
//    sello del QR como estaba (lo pone solo el escaneo real).
// 2. El CHECK de machines exige una ubicación completa y en rango (lat + lng + origen) o nada.
// 3. Un técnico no puede fijar la ubicación de una máquina con su sesión: machines solo tiene
//    policy de SELECT para técnicos (tech_machines_select); la escritura es del admin o del
//    servidor (service_role).
// 4. Una línea de contrato nueva borra la ubicación de su máquina (puede haberse movido).
// 5. El sello QR solo lo pone el servidor (guard_field_evidence).
// 6. La presencia del técnico vive en field_presence: la lee solo el admin, la escribe solo el
//    servidor; reabrir la avería o borrar la tarea borra la fila.

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

describe('contract_machines — una línea nueva borra la ubicación de la máquina', () => {
  it('asignar la máquina a otra línea vacía sus 6 columnas de ubicación', async () => {
    const serie = 'TEST-GEO-RELOC'
    expect((await admin.from('machines').insert({ numero_serie: serie, marque: 'TESTGEO', modele: 'G1' })).error).toBeNull()
    // Primera línea: se instala en el cliente A, y el primer escaneo le da ubicación.
    const { data: first, error: e1 } = await admin.from('contract_machines')
      .insert({ contract_id: t.contractAId, machine_id: serie, date_debut: '2026-01-01', statut: 'actif' })
      .select('id').single()
    expect(e1).toBeNull()
    expect((await admin.from('machines').update({
      lat: 14.6928, lng: -17.4467, location_accuracy_m: 12, location_source: 'first_scan',
      location_set_at: '2026-09-25T10:00:00+00:00', location_set_by: t.techA,
    }).eq('numero_serie', serie)).error).toBeNull()

    // Vuelve al stock (se cierra la línea: la ubicación sigue ahí) y se asigna a otro contrato.
    expect((await admin.from('contract_machines').update({ date_fin: '2026-09-30' }).eq('id', first!.id)).error).toBeNull()
    const { data: kept } = await admin.from('machines').select('lat').eq('numero_serie', serie).single()
    expect(kept).toEqual({ lat: 14.6928 })

    expect((await admin.from('contract_machines')
      .insert({ contract_id: t.contractBId, machine_id: serie, date_debut: '2026-10-01', statut: 'actif' })).error).toBeNull()
    const { data, error } = await admin.from('machines')
      .select('lat, lng, location_accuracy_m, location_source, location_set_at, location_set_by')
      .eq('numero_serie', serie).single()
    expect(error).toBeNull()
    expect(data).toEqual({
      lat: null, lng: null, location_accuracy_m: null, location_source: null,
      location_set_at: null, location_set_by: null,
    })
  })
})

// Sello QR: trigger guard_field_evidence. Solo service_role lo pone; un usuario (técnico o admin
// con su sesión) puede vaciarlo con la tarea abierta, nunca ponerlo.
describe('guard_field_evidence — el sello QR solo lo escribe el servidor', () => {
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
    const { data, error } = await admin.from('incidents').select('title, status, qr_verified, qr_scanned_by').eq('id', id).single()
    if (error) throw new Error(`read incident: ${error.message}`)
    return data as Record<string, unknown>
  }

  async function readVisitQr(id: string) {
    const { data, error } = await admin.from('maintenance_visits').select('notes, qr_verified').eq('id', id).single()
    if (error) throw new Error(`read visit: ${error.message}`)
    return data as Record<string, unknown>
  }

  it('el técnico no se pone el sello QR en su avería abierta (el resto del UPDATE sí entra)', async () => {
    const id = await newIncident()
    const c = await signInAs(SC.techAEmail)
    const { error } = await c.from('incidents')
      .update({ title: 'Modifié par le tech', qr_verified: true, qr_scanned_by: t.techA })
      .eq('id', id)
    expect(error).toBeNull()
    expect(await readIncident(id)).toMatchObject({ title: 'Modifié par le tech', qr_verified: false, qr_scanned_by: null })
  })

  it('el técnico no vacía el sello de su avería resuelta', async () => {
    const id = await newIncident()
    expect((await admin.from('incidents').update({
      status: 'résolu', resolved_via: 'intervention', rapport_intervention: 'Rapport geo.',
      qr_verified: true, qr_scanned_by: t.techA,
    }).eq('id', id)).error).toBeNull()
    const c = await signInAs(SC.techAEmail)
    expect((await c.from('incidents').update({ qr_verified: false, qr_scanned_by: null }).eq('id', id)).error).toBeNull()
    expect(await readIncident(id)).toMatchObject({ qr_verified: true, qr_scanned_by: t.techA })
  })

  it('el técnico no se pone el sello QR en su visita de mantenimiento', async () => {
    const c = await signInAs(SC.techAEmail)
    const { error } = await c.from('maintenance_visits')
      .update({ notes: 'Note du tech', qr_verified: true })
      .eq('id', t.visitAId)
    expect(error).toBeNull()
    expect(await readVisitQr(t.visitAId)).toMatchObject({ notes: 'Note du tech', qr_verified: false })
  })

  it('un admin con su sesión (authenticated, no service_role) tampoco puede ponerlo', async () => {
    const id = await newIncident()
    const c = await signInAs(SC.adminEmail)
    expect((await c.from('incidents').update({ qr_verified: true, qr_scanned_by: t.techA }).eq('id', id)).error).toBeNull()
    expect(await readIncident(id)).toMatchObject({ qr_verified: false, qr_scanned_by: null })

    expect((await c.from('maintenance_visits').update({ qr_verified: true }).eq('id', t.visitAId)).error).toBeNull()
    expect(await readVisitQr(t.visitAId)).toMatchObject({ qr_verified: false })
  })

  it('service_role sí lo escribe (incidencia y visita)', async () => {
    const id = await newIncident()
    expect((await admin.from('incidents').update({ qr_verified: true, qr_scanned_by: t.techA }).eq('id', id)).error).toBeNull()
    expect(await readIncident(id)).toMatchObject({ qr_verified: true, qr_scanned_by: t.techA })

    expect((await admin.from('maintenance_visits').update({ qr_verified: true }).eq('id', t.visitAId)).error).toBeNull()
    expect(await readVisitQr(t.visitAId)).toMatchObject({ qr_verified: true })
    // Deja la visita compartida como estaba para los demás casos.
    expect((await admin.from('maintenance_visits').update({ qr_verified: false }).eq('id', t.visitAId)).error).toBeNull()
  })

  it('con la tarea abierta, el usuario sí puede vaciarlo (lo que hace clearResolution)', async () => {
    const id = await newIncident()
    expect((await admin.from('incidents').update({ qr_verified: true, qr_scanned_by: t.techA }).eq('id', id)).error).toBeNull()
    const c = await signInAs(SC.techAEmail)
    expect((await c.from('incidents').update({ qr_verified: false, qr_scanned_by: null }).eq('id', id)).error).toBeNull()
    expect(await readIncident(id)).toMatchObject({ qr_verified: false, qr_scanned_by: null })
  })

  it('un INSERT de usuario llega sin sello (cliente: avería; admin: visita)', async () => {
    const client = await signInAs(SC.clientAEmail)
    const { error } = await client.from('incidents').insert({
      numero_incident: 'TEST-GEO-INS', title: 'Geo insert', contract_machine_id: t.lineAId, qr_verified: true,
    })
    expect(error).toBeNull()
    const { data: inc, error: e1 } = await admin.from('incidents')
      .select('qr_verified, qr_scanned_by').eq('numero_incident', 'TEST-GEO-INS').single()
    expect(e1).toBeNull()
    expect(inc).toEqual({ qr_verified: false, qr_scanned_by: null })

    const adminUser = await signInAs(SC.adminEmail)
    const { data: v, error: e2 } = await adminUser.from('maintenance_visits').insert({
      plan_id: t.planAId, contract_machine_id: t.lineAId, scheduled_date: '2026-11-15', qr_verified: true,
    }).select('id').single()
    expect(e2).toBeNull()
    expect(await readVisitQr(v!.id as string)).toMatchObject({ qr_verified: false })
  })
})

// Presencia del técnico: tabla field_presence. La lee SOLO el admin (el cliente del portal no
// debe saber dónde estaba un empleado); la escribe SOLO service_role.
describe('field_presence — privada de la oficina, escrita solo por el servidor', () => {
  const ROW = {
    lat: 14.6928, lng: -17.4467, accuracy_m: 12, distance_m: 40, presence: 'far',
  }

  async function resolvedIncident(): Promise<string> {
    const { data, error } = await admin.from('incidents').insert({
      numero_incident: `TEST-GEO-P${Math.random().toString(36).slice(2, 8)}`, title: 'Geo presence',
      contract_machine_id: t.lineAId, assigned_to: t.techA, status: 'en_cours',
    }).select('id').single()
    if (error) throw new Error(`seed incident: ${error.message}`)
    const id = data!.id as string
    const r = await admin.from('incidents').update({
      status: 'résolu', resolved_via: 'intervention', rapport_intervention: 'Rapport geo.',
    }).eq('id', id)
    if (r.error) throw new Error(`resolve: ${r.error.message}`)
    const p = await admin.from('field_presence')
      .upsert({ entity_type: 'incident', entity_id: id, tech_id: t.techA, ...ROW }, { onConflict: 'entity_type,entity_id' })
    if (p.error) throw new Error(`presence: ${p.error.message}`)
    return id
  }

  async function presenceOf(id: string) {
    const { data, error } = await admin.from('field_presence')
      .select('presence, distance_m, lat').eq('entity_type', 'incident').eq('entity_id', id)
    if (error) throw new Error(`read presence: ${error.message}`)
    return data
  }

  it('el cliente dueño de la avería no la lee (ni la avería lleva ya la posición)', async () => {
    const id = await resolvedIncident()
    const c = await signInAs(SC.clientAEmail)
    // Ve su avería…
    const { data: own } = await c.from('incidents').select('id').eq('id', id)
    expect(own).toHaveLength(1)
    // …pero no la presencia del técnico.
    expectEmpty(await c.from('field_presence').select('*').eq('entity_id', id))
    // Y la avería ya no tiene columnas de posición que pedir.
    expect((await c.from('incidents').select('tech_lat').eq('id', id)).error).not.toBeNull()
  })

  it('el técnico (el suyo) no la lee', async () => {
    const id = await resolvedIncident()
    const c = await signInAs(SC.techAEmail)
    expectEmpty(await c.from('field_presence').select('*').eq('entity_id', id))
  })

  it('el anónimo no la lee', async () => {
    const id = await resolvedIncident()
    const { data } = await anonClient().from('field_presence').select('*').eq('entity_id', id)
    expect(data ?? []).toHaveLength(0)
  })

  it('el admin sí la lee', async () => {
    const id = await resolvedIncident()
    const c = await signInAs(SC.adminEmail)
    const { data, error } = await c.from('field_presence').select('presence, distance_m').eq('entity_id', id)
    expect(error).toBeNull()
    expect(data).toEqual([{ presence: 'far', distance_m: 40 }])
  })

  it('ni el técnico ni el admin con su sesión la escriben (insert, update, delete)', async () => {
    const id = await resolvedIncident()
    for (const email of [SC.techAEmail, SC.adminEmail]) {
      const c = await signInAs(email)
      const other = crypto.randomUUID()
      await c.from('field_presence').insert({ entity_type: 'incident', entity_id: other, tech_id: t.techA, ...ROW, presence: 'near' })
      await c.from('field_presence').update({ presence: 'near', distance_m: 5 }).eq('entity_id', id)
      await c.from('field_presence').delete().eq('entity_id', id)
      expect(await presenceOf(other)).toEqual([])
      expect(await presenceOf(id)).toEqual([{ presence: 'far', distance_m: 40, lat: 14.6928 }])
    }
  })

  it('reabrir una avería borra su presencia, la reabra el técnico o el servidor', async () => {
    const byTech = await resolvedIncident()
    const c = await signInAs(SC.techAEmail)
    expect((await c.from('incidents').update({ status: 'en_cours' }).eq('id', byTech)).error).toBeNull()
    expect(await presenceOf(byTech)).toEqual([])

    const byServer = await resolvedIncident()
    expect((await admin.from('incidents').update({ status: 'assigné' }).eq('id', byServer)).error).toBeNull()
    expect(await presenceOf(byServer)).toEqual([])
  })

  it('volver a guardar una avería resuelta (sin reabrir) conserva su presencia', async () => {
    const id = await resolvedIncident()
    expect((await admin.from('incidents').update({ status: 'fermé' }).eq('id', id)).error).toBeNull()
    expect(await presenceOf(id)).toEqual([{ presence: 'far', distance_m: 40, lat: 14.6928 }])
  })

  it('borrar la avería o la visita se lleva su fila', async () => {
    const id = await resolvedIncident()
    expect((await admin.from('incidents').delete().eq('id', id)).error).toBeNull()
    expect(await presenceOf(id)).toEqual([])

    const { data: v, error } = await admin.from('maintenance_visits')
      .insert({ plan_id: t.planAId, contract_machine_id: t.lineAId, scheduled_date: '2026-12-01' })
      .select('id').single()
    expect(error).toBeNull()
    const visitId = v!.id as string
    expect((await admin.from('field_presence')
      .insert({ entity_type: 'visit', entity_id: visitId, tech_id: t.techA, ...ROW })).error).toBeNull()
    expect((await admin.from('maintenance_visits').delete().eq('id', visitId)).error).toBeNull()
    const { data: rows } = await admin.from('field_presence').select('entity_id').eq('entity_id', visitId)
    expect(rows).toEqual([])
  })
})
