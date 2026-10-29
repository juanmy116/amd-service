import { describe, it, expect, beforeAll, beforeEach, afterAll } from 'vitest'
import { adminClient, cleanup, signInAs, URL, ANON_KEY, SERVICE_KEY } from './helpers'
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
    expect(await scan.stampQrScan(SC.snA, t.techA)).toMatchObject({ needsLocation: true })
    await scan.setFirstScanLocation(SC.snA, t.techA, GOOD)
    expect(await location(SC.snA)).toEqual({ lat: 14.6928, lng: -17.4467, location_source: 'first_scan', location_set_by: t.techA })
    expect(await scan.stampQrScan(SC.snA, t.techA)).toMatchObject({ needsLocation: false })
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
    expect(await scan.stampQrScan(serie, t.techA)).toMatchObject({ needsLocation: false })
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

  it('nouveau con técnico (la oficina la devolvió a «Nouveau») → en_cours, historial desde nouveau', async () => {
    const mine = await newIncident(t.techA, 'nouveau')
    await scan.stampQrScan(SC.snA, t.techA)
    expect(await statusOf(mine)).toBe('en_cours')
    const { data, error } = await admin.from('incident_history')
      .select('changed_by, old_status, new_status, comment').eq('incident_id', mine)
    expect(error).toBeNull()
    expect(data).toContainEqual({
      changed_by: t.techA, old_status: 'nouveau', new_status: 'en_cours', comment: 'Mise en cours — scan QR',
    })
  })

  it('nouveau de otro técnico: escanear no la empieza', async () => {
    const others = await newIncident(t.techB, 'nouveau')
    await scan.stampQrScan(SC.snA, t.techA)
    expect(await statusOf(others)).toBe('nouveau')
  })

  it('en_cours puesta por la oficina: escanear no cambia el estado pero sí deja fila', async () => {
    const mine = await newIncident(t.techA, 'en_cours')
    await scan.stampQrScan(SC.snA, t.techA)
    expect(await statusOf(mine)).toBe('en_cours')
    expect(await scansOf(mine)).toHaveLength(1)
  })

  // Policy de 20261021100000: solo el admin lee; nadie con sesión escribe (lo hace service_role).
  it('incident_scans: el admin lee, el técnico ni lee ni se fabrica escaneos', async () => {
    const mine = await newIncident(t.techA, 'en_cours')
    await scan.stampQrScan(SC.snA, t.techA)

    const office = await signInAs(SC.adminEmail)
    const asAdmin = await office.from('incident_scans').select('scanned_by').eq('incident_id', mine)
    expect(asAdmin.error).toBeNull()
    expect(asAdmin.data).toEqual([{ scanned_by: t.techA }])

    const tech = await signInAs(SC.techAEmail)
    const asTech = await tech.from('incident_scans').select('id').eq('incident_id', mine)
    expect(asTech.data ?? []).toHaveLength(0)
    const forged = await tech.from('incident_scans').insert({ incident_id: mine, scanned_by: t.techA })
    expect(forged.error).not.toBeNull()
    expect(await scansOf(mine)).toHaveLength(1)
  })

  describe('getCloseGate', () => {
    const insertScan = async (incidentId: string, userId: string, secondsAgo: number) => {
      const { error } = await admin.from('incident_scans')
        .insert({ incident_id: incidentId, scanned_by: userId, scanned_at: new Date(Date.now() - secondsAgo * 1000).toISOString() })
      if (error) throw new Error(`seed scan: ${error.message}`)
    }

    it('dos escaneos recientes → canClose true; uno → false', async () => {
      const id = await newIncident(t.techA, 'en_cours')
      await insertScan(id, t.techA, 600)
      expect((await scan.getCloseGate(id, t.techA, null)).canClose).toBe(false)
      await insertScan(id, t.techA, 60)
      const gate = await scan.getCloseGate(id, t.techA, null)
      expect(gate.canClose).toBe(true)
      expect(gate.closeUntil).toBeInstanceOf(Date)
    })

    it('solo cuentan los escaneos del propio técnico', async () => {
      const id = await newIncident(t.techA, 'en_cours')
      await insertScan(id, t.techA, 600)
      await insertScan(id, t.techB, 60)
      expect((await scan.getCloseGate(id, t.techA, null)).canClose).toBe(false)
    })

    it('los escaneos anteriores a resolvedAt no cuentan', async () => {
      const id = await newIncident(t.techA, 'en_cours')
      await insertScan(id, t.techA, 600)
      await insertScan(id, t.techA, 300)
      const resolvedAt = new Date(Date.now() - 100_000).toISOString()
      expect((await scan.getCloseGate(id, t.techA, resolvedAt)).canClose).toBe(false)
    })
  })
})
