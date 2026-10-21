import { describe, it, expect, beforeAll, beforeEach, afterAll } from 'vitest'
import { adminClient, cleanup, URL, ANON_KEY, SERVICE_KEY } from './helpers'
import { seedTenants, SC, type Tenants } from './scenario'

// Escaneo del QR (Fase 3, `src/lib/scan.server.ts`) contra la BD local real:
// 1. Solo se sella la visita QUE TOCA: la pendiente más antigua (del técnico o sin técnico) con
//    fecha ≤ hoy + 14 días.
// 2. `needsLocation` y el primer escaneo: la ubicación solo se fija si la máquina está instalada
//    en un cliente (línea abierta), no tiene ubicación y el GPS es ≤ 100 m.
//
// `createAdminClient()` lee NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SECRET_KEY: se apuntan AQUÍ al
// Supabase local antes de importar el módulo, para que nunca pueda tocar otra base.

const admin = adminClient()
let t: Tenants
let scan: typeof import('@/lib/scan.server')

const dayOffset = (days: number) => new Date(Date.now() + days * 86_400_000).toISOString().slice(0, 10)

beforeAll(async () => {
  if (!ANON_KEY || !SERVICE_KEY) {
    throw new Error('Faltan ANON_KEY/SERVICE_ROLE_KEY. Ejecuta con `supabase start` y exporta las claves.')
  }
  process.env.NEXT_PUBLIC_SUPABASE_URL = URL
  process.env.SUPABASE_SECRET_KEY = SERVICE_KEY
  scan = await import('@/lib/scan.server')
  await cleanup(admin)
  t = await seedTenants(admin)
}, 90_000)

afterAll(async () => {
  await cleanup(admin)
})

async function newVisit(scheduled: string, assignedTo: string | null): Promise<string> {
  const { data, error } = await admin.from('maintenance_visits')
    .insert({ plan_id: t.planAId, contract_machine_id: t.lineAId, scheduled_date: scheduled, assigned_to: assignedTo })
    .select('id').single()
  if (error) throw new Error(`seed visit: ${error.message}`)
  return data!.id as string
}

async function stamped(ids: string[]): Promise<Record<string, boolean>> {
  const { data, error } = await admin.from('maintenance_visits').select('id, qr_verified').in('id', ids)
  if (error) throw new Error(`read visits: ${error.message}`)
  return Object.fromEntries((data ?? []).map((v) => [v.id, v.qr_verified]))
}

describe('stampQrScan — solo la visita que toca', () => {
  beforeEach(async () => {
    // Solo las visitas de este caso en la línea A.
    const { error } = await admin.from('maintenance_visits').delete().eq('contract_machine_id', t.lineAId)
    if (error) throw new Error(`reset visits: ${error.message}`)
  })

  it('sella la pendiente más antigua dentro de la ventana, no las siguientes', async () => {
    const due = await newVisit(dayOffset(-10), t.techA)
    const next = await newVisit(dayOffset(5), t.techA)
    const later = await newVisit(dayOffset(90), null)
    await scan.stampQrScan(SC.snA, t.techA)
    expect(await stamped([due, next, later])).toEqual({ [due]: true, [next]: false, [later]: false })
  })

  it('la de otro técnico no cuenta: sella la más antigua del que escanea o sin técnico', async () => {
    const others = await newVisit(dayOffset(-20), t.techB)
    const unassigned = await newVisit(dayOffset(3), null)
    await scan.stampQrScan(SC.snA, t.techA)
    expect(await stamped([others, unassigned])).toEqual({ [others]: false, [unassigned]: true })
  })

  it('una visita a más de 14 días no se sella aunque sea la única', async () => {
    const far = await newVisit(dayOffset(20), t.techA)
    await scan.stampQrScan(SC.snA, t.techA)
    expect(await stamped([far])).toEqual({ [far]: false })
  })
})

describe('primer escaneo — ubicación de la máquina', () => {
  const GOOD = { lat: 14.6928, lng: -17.4467, accuracy: 20 }

  async function location(serie: string) {
    const { data, error } = await admin.from('machines')
      .select('lat, lng, location_source, location_set_by').eq('numero_serie', serie).single()
    if (error) throw new Error(`read location: ${error.message}`)
    return data
  }

  beforeEach(async () => {
    const { error } = await admin.from('machines')
      .update({ lat: null, lng: null, location_accuracy_m: null, location_source: null, location_set_at: null, location_set_by: null })
      .eq('numero_serie', SC.snA)
    if (error) throw new Error(`reset location: ${error.message}`)
  })

  it('máquina instalada y sin ubicación ⇒ needsLocation y el primer escaneo la fija', async () => {
    expect(await scan.stampQrScan(SC.snA, t.techA)).toEqual({ needsLocation: true })
    await scan.setFirstScanLocation(SC.snA, t.techA, GOOD)
    expect(await location(SC.snA)).toEqual({ lat: 14.6928, lng: -17.4467, location_source: 'first_scan', location_set_by: t.techA })
    expect(await scan.stampQrScan(SC.snA, t.techA)).toEqual({ needsLocation: false })
  })

  it('no pisa una ubicación ya puesta', async () => {
    await admin.from('machines').update({ lat: 14.7, lng: -17.45, location_source: 'admin' }).eq('numero_serie', SC.snA)
    await scan.setFirstScanLocation(SC.snA, t.techA, GOOD)
    expect(await location(SC.snA)).toMatchObject({ lat: 14.7, lng: -17.45, location_source: 'admin' })
  })

  it('GPS peor de 100 m ⇒ no la fija', async () => {
    await scan.setFirstScanLocation(SC.snA, t.techA, { ...GOOD, accuracy: 101 })
    expect(await location(SC.snA)).toMatchObject({ lat: null, location_source: null })
  })

  it('máquina en el almacén (sin línea abierta) ⇒ ni needsLocation ni ubicación', async () => {
    const serie = 'TEST-GEO-STOCK'
    expect((await admin.from('machines').insert({ numero_serie: serie, marque: 'TESTGEO', modele: 'G1' })).error).toBeNull()
    expect(await scan.stampQrScan(serie, t.techA)).toEqual({ needsLocation: false })
    await scan.setFirstScanLocation(serie, t.techA, GOOD)
    expect(await location(serie)).toMatchObject({ lat: null, location_source: null })
  })
})

describe('stampQrScan — averías', () => {
  const PREFIX = 'TEST-SCAN-'
  let seq = 0

  async function newIncident(assignedTo: string | null, status: string): Promise<string> {
    const { data, error } = await admin.from('incidents')
      .insert({
        numero_incident: `${PREFIX}${Date.now()}-${seq++}`, title: 'Scan test',
        contract_machine_id: t.lineAId, assigned_to: assignedTo, status,
      })
      .select('id').single()
    if (error) throw new Error(`seed incident: ${error.message}`)
    return data!.id as string
  }

  async function scansOf(id: string) {
    const { data, error } = await admin.from('incident_scans')
      .select('scanned_by, scanned_at').eq('incident_id', id).order('scanned_at')
    if (error) throw new Error(`read scans: ${error.message}`)
    return data ?? []
  }

  async function statusOf(id: string): Promise<string> {
    const { data, error } = await admin.from('incidents').select('status').eq('id', id).single()
    if (error) throw new Error(`read status: ${error.message}`)
    return data!.status as string
  }

  beforeEach(async () => {
    // Solo las averías de este describe (las borra en cascada sus escaneos e historial).
    const { error } = await admin.from('incidents').delete().like('numero_incident', `${PREFIX}%`)
    if (error) throw new Error(`reset incidents: ${error.message}`)
  })

  it('inserta un escaneo por avería del técnico y por avería sin técnico', async () => {
    const mine = await newIncident(t.techA, 'assigné')
    const free = await newIncident(null, 'nouveau')
    await scan.stampQrScan(SC.snA, t.techA)
    expect((await scansOf(mine)).map((s) => s.scanned_by)).toEqual([t.techA])
    expect((await scansOf(free)).map((s) => s.scanned_by)).toEqual([t.techA])
  })

  it('no inserta en averías de otro técnico ni las cambia de estado', async () => {
    const others = await newIncident(t.techB, 'assigné')
    await scan.stampQrScan(SC.snA, t.techA)
    expect(await scansOf(others)).toHaveLength(0)
    expect(await statusOf(others)).toBe('assigné')
  })

  it('dos escaneos en menos de 60 s dejan una sola fila', async () => {
    const mine = await newIncident(t.techA, 'assigné')
    await scan.stampQrScan(SC.snA, t.techA)
    await scan.stampQrScan(SC.snA, t.techA)
    expect(await scansOf(mine)).toHaveLength(1)
  })

  it('un escaneo de hace más de 60 s no bloquea el siguiente', async () => {
    const mine = await newIncident(t.techA, 'assigné')
    await scan.stampQrScan(SC.snA, t.techA)
    const old = new Date(Date.now() - 120_000).toISOString()
    const { error } = await admin.from('incident_scans').update({ scanned_at: old }).eq('incident_id', mine)
    if (error) throw new Error(`backdate: ${error.message}`)
    await scan.stampQrScan(SC.snA, t.techA)
    expect(await scansOf(mine)).toHaveLength(2)
  })

  it('assigné del técnico → en_cours, con línea de historial', async () => {
    const mine = await newIncident(t.techA, 'assigné')
    const free = await newIncident(null, 'nouveau')
    await scan.stampQrScan(SC.snA, t.techA)
    expect(await statusOf(mine)).toBe('en_cours')
    expect(await statusOf(free)).toBe('nouveau')
    const { data, error } = await admin.from('incident_history')
      .select('changed_by, old_status, new_status, comment').eq('incident_id', mine)
    expect(error).toBeNull()
    expect(data).toContainEqual({
      changed_by: t.techA, old_status: 'assigné', new_status: 'en_cours', comment: 'Mise en cours — scan QR',
    })
  })

  it('en_cours puesta por la oficina: escanear no cambia el estado pero sí deja fila', async () => {
    const mine = await newIncident(t.techA, 'en_cours')
    await scan.stampQrScan(SC.snA, t.techA)
    expect(await statusOf(mine)).toBe('en_cours')
    expect(await scansOf(mine)).toHaveLength(1)
  })
})
