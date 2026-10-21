import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { adminClient, signInAs, cleanup, createUserWithRole, ANON_KEY, SERVICE_KEY } from './helpers'
import { seedTenants, SC, type Tenants } from './scenario'

// Doble escaneo (migración 20261021110000): el técnico de campo no puede empezar una avería ni
// cerrarla con su sesión sin los escaneos del QR. La oficina, el Atelier (técnico con
// is_dispatcher) y service_role quedan fuera. Ventanas: 2 escaneos del ciclo, separados >= 60 s,
// el último con <= 60 min (espejo de src/lib/scanGate.ts).
// Corre contra Supabase LOCAL efímero.

const admin = adminClient()

const REPORT = { resolved_via: 'intervention', rapport_intervention: 'TEST rapport doble scan.' }
const BUREAU = {
  resolved_via: 'bureau', resolution_reason: 'telephone', resolution_note: 'Réglé au téléphone.',
}

let t: Tenants
let dispatcherEmail: string
let dispatcherId: string
let n = 0

const minutesAgo = (m: number) => new Date(Date.now() - m * 60_000).toISOString()

async function newIncident(status = 'en_cours', assignedTo?: string): Promise<string> {
  const { data, error } = await admin.from('incidents').insert({
    numero_incident: `TEST-SCAN-${++n}`, title: 'Scan', contract_machine_id: t.lineAId,
    assigned_to: assignedTo ?? t.techA, status,
  }).select('id').single()
  if (error) throw new Error(`seed incident: ${error.message}`)
  return data!.id as string
}

async function scan(incidentId: string, at: string, by = t.techA) {
  const { error } = await admin.from('incident_scans').insert({ incident_id: incidentId, scanned_by: by, scanned_at: at })
  if (error) throw new Error(`seed scan: ${error.message}`)
}

async function statusOf(id: string): Promise<string> {
  const { data } = await admin.from('incidents').select('status').eq('id', id).single()
  return data!.status as string
}

beforeAll(async () => {
  if (!ANON_KEY || !SERVICE_KEY) {
    throw new Error('Faltan ANON_KEY/SERVICE_ROLE_KEY. Ejecuta con `supabase start` y exporta las claves.')
  }
  await cleanup(admin)
  t = await seedTenants(admin)
  dispatcherEmail = 'sc-dispatcher@rls.test'
  dispatcherId = await createUserWithRole(admin, dispatcherEmail, 'technician')
  const { error } = await admin.from('profiles').update({ is_dispatcher: true }).eq('id', dispatcherId)
  if (error) throw new Error(`dispatcher flag: ${error.message}`)
}, 60_000)

afterAll(async () => {
  await cleanup(admin)
})

describe('doble escaneo — el técnico de campo con su sesión', () => {
  it('técnico: assigné → en_cours con su sesión → rechazado', async () => {
    const id = await newIncident('assigné')
    const c = await signInAs(SC.techAEmail)
    const { error } = await c.from('incidents').update({ status: 'en_cours' }).eq('id', id)
    expect(error?.code).toBe('23514')
    expect(error?.message).toContain('Scannez')
    expect(await statusOf(id)).toBe('assigné')
  })

  it('técnico: en_cours → résolu sin escaneos → rechazado', async () => {
    const id = await newIncident()
    const c = await signInAs(SC.techAEmail)
    const { error } = await c.from('incidents').update({ status: 'résolu', ...REPORT }).eq('id', id)
    expect(error?.code).toBe('23514')
    expect(error?.message).toContain('Scannez')
    expect(await statusOf(id)).toBe('en_cours')
  })

  it('técnico: con un escaneo → rechazado', async () => {
    const id = await newIncident()
    await scan(id, minutesAgo(5))
    const c = await signInAs(SC.techAEmail)
    const { error } = await c.from('incidents').update({ status: 'résolu', ...REPORT }).eq('id', id)
    expect(error?.code).toBe('23514')
    expect(await statusOf(id)).toBe('en_cours')
  })

  it('técnico: con dos escaneos (el último hace 5 min) → permitido', async () => {
    const id = await newIncident()
    await scan(id, minutesAgo(30))
    await scan(id, minutesAgo(5))
    const c = await signInAs(SC.techAEmail)
    const { error } = await c.from('incidents').update({ status: 'résolu', ...REPORT }).eq('id', id)
    expect(error).toBeNull()
    expect(await statusOf(id)).toBe('résolu')
  })

  it('técnico: con dos escaneos (el último hace 61 min) → rechazado', async () => {
    const id = await newIncident()
    await scan(id, minutesAgo(120))
    await scan(id, minutesAgo(61))
    const c = await signInAs(SC.techAEmail)
    const { error } = await c.from('incidents').update({ status: 'résolu', ...REPORT }).eq('id', id)
    expect(error?.code).toBe('23514')
    expect(await statusOf(id)).toBe('en_cours')
  })

  it('técnico: dos escaneos separados por 1 s → rechazado', async () => {
    const id = await newIncident()
    const base = Date.now() - 5 * 60_000
    await scan(id, new Date(base).toISOString())
    await scan(id, new Date(base + 1000).toISOString())
    const c = await signInAs(SC.techAEmail)
    const { error } = await c.from('incidents').update({ status: 'résolu', ...REPORT }).eq('id', id)
    expect(error?.code).toBe('23514')
    expect(await statusOf(id)).toBe('en_cours')
  })

  it('técnico: los escaneos de otro técnico no cuentan', async () => {
    const id = await newIncident()
    await scan(id, minutesAgo(30), t.techB)
    await scan(id, minutesAgo(5), t.techB)
    const c = await signInAs(SC.techAEmail)
    const { error } = await c.from('incidents').update({ status: 'résolu', ...REPORT }).eq('id', id)
    expect(error?.code).toBe('23514')
  })

  it('técnico: en_cours → fermé con vía intervention e informe, sin escaneos → rechazado', async () => {
    const id = await newIncident()
    const c = await signInAs(SC.techAEmail)
    const { error } = await c.from('incidents').update({ status: 'fermé', ...REPORT }).eq('id', id)
    expect(error?.code).toBe('23514')
    expect(await statusOf(id)).toBe('en_cours')
  })

  it('técnico: escaneos anteriores al resolved_at de una reabierta → rechazado', async () => {
    const id = await newIncident()
    await scan(id, minutesAgo(30))
    await scan(id, minutesAgo(20))
    // La oficina cierra (la app fija resolved_at) y reabre (no lo limpia): el ciclo anterior está gastado.
    expect((await admin.from('incidents').update({ status: 'fermé', ...BUREAU, resolved_at: minutesAgo(1) }).eq('id', id)).error).toBeNull()
    expect((await admin.from('incidents').update({ status: 'en_cours' }).eq('id', id)).error).toBeNull()
    const c = await signInAs(SC.techAEmail)
    const { error } = await c.from('incidents').update({ status: 'résolu', ...REPORT }).eq('id', id)
    expect(error?.code).toBe('23514')
    expect(await statusOf(id)).toBe('en_cours')
  })

  it('oficina puso en_cours; técnico con dos escaneos posteriores → permitido', async () => {
    const id = await newIncident('assigné')
    const office = await signInAs(SC.adminEmail)
    expect((await office.from('incidents').update({ status: 'en_cours' }).eq('id', id)).error).toBeNull()
    await scan(id, minutesAgo(20))
    await scan(id, minutesAgo(2))
    const c = await signInAs(SC.techAEmail)
    const { error } = await c.from('incidents').update({ status: 'résolu', ...REPORT }).eq('id', id)
    expect(error).toBeNull()
    expect(await statusOf(id)).toBe('résolu')
  })

  it('técnico guarda el informe sin cambiar de estado → permitido', async () => {
    const id = await newIncident()
    const c = await signInAs(SC.techAEmail)
    const { error } = await c.from('incidents').update({ rapport_intervention: 'TEST borrador' }).eq('id', id)
    expect(error).toBeNull()
    expect(await statusOf(id)).toBe('en_cours')
  })
})

describe('doble escaneo — quien queda fuera', () => {
  it('admin con su sesión cierra sin escaneos → permitido', async () => {
    const id = await newIncident()
    const c = await signInAs(SC.adminEmail)
    const { error } = await c.from('incidents').update({ status: 'fermé', ...BUREAU }).eq('id', id)
    expect(error).toBeNull()
    expect(await statusOf(id)).toBe('fermé')
  })

  it('dispatcher (técnico con is_dispatcher) cierra sin escaneos → permitido', async () => {
    // Asignada al dispatcher para que su RLS le deje actualizarla: lo único que puede pararlo es el guard.
    const id = await newIncident('en_cours', dispatcherId)
    const c = await signInAs(dispatcherEmail)
    const { error } = await c.from('incidents').update({ status: 'fermé', ...BUREAU }).eq('id', id)
    expect(error).toBeNull()
    expect(await statusOf(id)).toBe('fermé')
  })

  it('service_role → permitido', async () => {
    const id = await newIncident('assigné')
    expect((await admin.from('incidents').update({ status: 'en_cours' }).eq('id', id)).error).toBeNull()
    expect((await admin.from('incidents').update({ status: 'résolu', ...REPORT }).eq('id', id)).error).toBeNull()
    expect(await statusOf(id)).toBe('résolu')
  })
})
