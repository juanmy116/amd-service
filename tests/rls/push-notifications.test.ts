import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { adminClient, anonClient, signInAs, cleanup, createUserWithRole, ANON_KEY, SERVICE_KEY } from './helpers'
import { expectEmpty } from './assert'
import { seedTenants, SC, type Tenants } from './scenario'

// Notificaciones push a técnicos (migración 20260924100000, Fase 2 de la PWA).
//
// 1. push_subscriptions: cada usuario ve SOLO sus aparatos; el admin, todos; nadie los da de
//    alta con su propia sesión (el alta va por Server Action con service_role).
// 2. push_notifications: cola + registro interno, solo el admin la lee.
// 3. El trigger de asignación encola 'assigned' / 'unassigned' al cambiar assigned_to en
//    incidents y maintenance_visits, y nada más.
// 4. No se avisa a quien hace el cambio (admin que se asigna a sí mismo).
// 5. Sin Vault (CI/local) el trigger no falla: la fila queda 'pending'.
// 6. Borrar un técnico con trabajo asignado sigue funcionando (FK ON DELETE SET NULL).

const admin = adminClient()
let t: Tenants

const EP_A = 'https://push.test/TEST-push-endpoint-a'
const EP_B = 'https://push.test/TEST-push-endpoint-b'
const DEL_TECH_EMAIL = 'push-tech-del@rls.test'

interface Row {
  recipient_id: string
  kind: string
  entity_type: string
  entity_id: string
  status: string
}

async function queueFor(entityId: string): Promise<Row[]> {
  const { data, error } = await admin.from('push_notifications')
    .select('recipient_id, kind, entity_type, entity_id, status')
    .eq('entity_id', entityId)
    .order('created_at')
  if (error) throw new Error(`read queue: ${error.message}`)
  return (data ?? []) as Row[]
}

async function newIncident(numero: string, assignedTo: string | null = null): Promise<string> {
  const { data, error } = await admin.from('incidents')
    .insert({ numero_incident: numero, title: 'Push test', contract_machine_id: t.lineAId, assigned_to: assignedTo })
    .select('id').single()
  if (error) throw new Error(`seed incident ${numero}: ${error.message}`)
  return data!.id as string
}

async function setIncident(id: string, patch: Record<string, unknown>): Promise<void> {
  const { error } = await admin.from('incidents').update(patch).eq('id', id)
  if (error) throw new Error(`update incident: ${error.message}`)
}

beforeAll(async () => {
  if (!ANON_KEY || !SERVICE_KEY) {
    throw new Error('Faltan ANON_KEY/SERVICE_ROLE_KEY. Ejecuta con `supabase start` y exporta las claves.')
  }
  await cleanup(admin)
  await admin.from('push_subscriptions').delete().like('endpoint', 'https://push.test/TEST-%')
  t = await seedTenants(admin)

  const { error } = await admin.from('push_subscriptions').insert([
    { user_id: t.techA, endpoint: EP_A, p256dh: 'TEST-p256dh-a', auth: 'TEST-auth-a' },
    { user_id: t.techB, endpoint: EP_B, p256dh: 'TEST-p256dh-b', auth: 'TEST-auth-b' },
  ])
  if (error) throw new Error(`seed subscriptions: ${error.message}`)
}, 90_000)

afterAll(async () => {
  // Las filas de ambas tablas cuelgan de profiles (ON DELETE CASCADE): cleanup() borra los
  // usuarios de prueba y se las lleva. El borrado explícito deja limpio también un run a medias.
  // `if (t)`: si beforeAll falló, no tapar su error con otro.
  await admin.from('push_subscriptions').delete().like('endpoint', 'https://push.test/TEST-%')
  if (t) {
    await admin.from('push_notifications').delete()
      .in('recipient_id', [t.adminUid, t.techA, t.techB, t.clientAUid, t.clientBUid])
  }
  await cleanup(admin)
})

describe('RLS — push_subscriptions', () => {
  it('el técnico A ve solo su suscripción', async () => {
    const c = await signInAs(SC.techAEmail)
    const { data, error } = await c.from('push_subscriptions').select('endpoint').like('endpoint', 'https://push.test/%')
    expect(error).toBeNull()
    expect((data ?? []).map((r) => r.endpoint)).toEqual([EP_A])
  })

  it('el técnico B ve solo la suya', async () => {
    const c = await signInAs(SC.techBEmail)
    const { data, error } = await c.from('push_subscriptions').select('endpoint').like('endpoint', 'https://push.test/%')
    expect(error).toBeNull()
    expect((data ?? []).map((r) => r.endpoint)).toEqual([EP_B])
  })

  it('el admin ve las dos', async () => {
    const c = await signInAs(SC.adminEmail)
    const { data, error } = await c.from('push_subscriptions').select('endpoint').like('endpoint', 'https://push.test/%')
    expect(error).toBeNull()
    expect((data ?? []).map((r) => r.endpoint).sort()).toEqual([EP_A, EP_B].sort())
  })

  it('el cliente no ve ninguna', async () => {
    const c = await signInAs(SC.clientAEmail)
    expectEmpty(await c.from('push_subscriptions').select('endpoint').like('endpoint', 'https://push.test/%'))
  })

  it('el anónimo no ve ninguna', async () => {
    const { data } = await anonClient().from('push_subscriptions').select('endpoint').like('endpoint', 'https://push.test/%')
    expect(data ?? []).toHaveLength(0)
  })

  it('el técnico no puede darse de alta con su sesión (sin policy de INSERT)', async () => {
    const c = await signInAs(SC.techAEmail)
    const { error } = await c.from('push_subscriptions').insert({
      user_id: t.techA, endpoint: 'https://push.test/TEST-push-endpoint-self', p256dh: 'x', auth: 'y',
    })
    expect(error).not.toBeNull()
  })
})

describe('RLS — push_notifications (admin-only)', () => {
  // El escenario base asigna TEST-I-A al técnico A ⇒ el trigger ya dejó una fila suya.
  it('el admin la lee', async () => {
    const c = await signInAs(SC.adminEmail)
    const { data, error } = await c.from('push_notifications').select('id').eq('recipient_id', t.techA)
    expect(error).toBeNull()
    expect((data ?? []).length).toBeGreaterThanOrEqual(1)
  })

  it('el técnico no la ve, ni siquiera las filas de las que es destinatario', async () => {
    const c = await signInAs(SC.techAEmail)
    expectEmpty(await c.from('push_notifications').select('id').eq('recipient_id', t.techA))
  })

  it('el cliente no la ve', async () => {
    const c = await signInAs(SC.clientAEmail)
    expectEmpty(await c.from('push_notifications').select('id'))
  })
})

describe('trigger de asignación — incidencias', () => {
  it('asignar, reasignar, retirar y tocar otra columna encolan lo justo', async () => {
    const id = await newIncident('TEST-PUSH-1')
    expect(await queueFor(id)).toHaveLength(0)

    // De nadie → técnico A: 1 'assigned' para A, pendiente (sin Vault no hay «toque», sin error).
    await setIncident(id, { assigned_to: t.techA })
    let q = await queueFor(id)
    expect(q).toHaveLength(1)
    expect(q[0]).toMatchObject({
      recipient_id: t.techA, kind: 'assigned', entity_type: 'incident', entity_id: id, status: 'pending',
    })

    // A → B: +2 ('assigned' para B, 'unassigned' para A).
    await setIncident(id, { assigned_to: t.techB })
    q = await queueFor(id)
    expect(q).toHaveLength(3)
    const added = q.slice(1).map((r) => `${r.kind}:${r.recipient_id}`).sort()
    expect(added).toEqual([`assigned:${t.techB}`, `unassigned:${t.techA}`].sort())

    // B → nadie: +1 'unassigned' para B.
    await setIncident(id, { assigned_to: null })
    q = await queueFor(id)
    expect(q).toHaveLength(4)
    expect(q[3]).toMatchObject({ recipient_id: t.techB, kind: 'unassigned', entity_type: 'incident' })

    // Otra columna: nada nuevo.
    await setIncident(id, { priority: 'haute' })
    expect(await queueFor(id)).toHaveLength(4)

    // Reescribir el MISMO técnico no es un cambio.
    await setIncident(id, { assigned_to: t.techA })
    await setIncident(id, { assigned_to: t.techA })
    expect(await queueFor(id)).toHaveLength(5)

    expect((await queueFor(id)).every((r) => r.status === 'pending')).toBe(true)
  })

  it('crear una incidencia ya asignada encola 1 aviso', async () => {
    const id = await newIncident('TEST-PUSH-2', t.techA)
    const q = await queueFor(id)
    expect(q).toHaveLength(1)
    expect(q[0]).toMatchObject({ recipient_id: t.techA, kind: 'assigned', entity_type: 'incident', status: 'pending' })
  })

  it('crear una incidencia sin asignar no encola nada', async () => {
    const id = await newIncident('TEST-PUSH-3')
    expect(await queueFor(id)).toHaveLength(0)
  })

  it('un admin que se asigna a sí mismo no se avisa', async () => {
    const id = await newIncident('TEST-PUSH-4')
    const c = await signInAs(SC.adminEmail)
    const { error } = await c.from('incidents').update({ assigned_to: t.adminUid }).eq('id', id)
    expect(error).toBeNull()
    const { data } = await admin.from('incidents').select('assigned_to').eq('id', id).single()
    expect(data!.assigned_to).toBe(t.adminUid) // el UPDATE ocurrió de verdad (no lo filtró la RLS)
    expect(await queueFor(id)).toHaveLength(0)

    // Y al retirárselo él mismo tampoco; si pasa a un técnico, al técnico sí.
    const { error: e2 } = await c.from('incidents').update({ assigned_to: t.techB }).eq('id', id)
    expect(e2).toBeNull()
    const q = await queueFor(id)
    expect(q).toHaveLength(1)
    expect(q[0]).toMatchObject({ recipient_id: t.techB, kind: 'assigned' })
  })
})

describe('trigger de asignación — tareas terminadas', () => {
  it('la resolución de oficina que acredita a un técnico no le avisa', async () => {
    // src/lib/resolution.ts escribe assigned_to en el MISMO UPDATE que cierra la avería.
    const id = await newIncident('TEST-PUSH-6', t.techA)
    const before = (await queueFor(id)).length
    await setIncident(id, {
      status: 'résolu',
      assigned_to: t.techB,
      resolved_via: 'bureau',
      resolution_reason: 'technicien_non_enregistre',
      resolution_note: 'Résolu par téléphone avec le client.',
    })
    expect(await queueFor(id)).toHaveLength(before)
  })
})

describe('trigger de asignación — mantenimientos', () => {
  it('visita: asignar, reasignar y retirar', async () => {
    const { data, error } = await admin.from('maintenance_visits')
      .insert({ plan_id: t.planAId, contract_machine_id: t.lineAId, scheduled_date: '2026-08-15' })
      .select('id').single()
    if (error) throw new Error(`seed visit: ${error.message}`)
    const id = data!.id as string
    expect(await queueFor(id)).toHaveLength(0)

    const upd = async (assigned_to: string | null) => {
      const { error: e } = await admin.from('maintenance_visits').update({ assigned_to }).eq('id', id)
      if (e) throw new Error(`update visit: ${e.message}`)
    }

    await upd(t.techA)
    let q = await queueFor(id)
    expect(q).toHaveLength(1)
    expect(q[0]).toMatchObject({ recipient_id: t.techA, kind: 'assigned', entity_type: 'visit', status: 'pending' })

    await upd(t.techB)
    q = await queueFor(id)
    expect(q).toHaveLength(3)
    expect(q.slice(1).map((r) => `${r.kind}:${r.recipient_id}`).sort())
      .toEqual([`assigned:${t.techB}`, `unassigned:${t.techA}`].sort())

    await upd(null)
    q = await queueFor(id)
    expect(q).toHaveLength(4)
    expect(q[3]).toMatchObject({ recipient_id: t.techB, kind: 'unassigned', entity_type: 'visit' })

    const { error: e2 } = await admin.from('maintenance_visits').update({ notes: 'TEST' }).eq('id', id)
    expect(e2).toBeNull()
    expect(await queueFor(id)).toHaveLength(4)
  })

  it('visita creada ya asignada encola 1 aviso', async () => {
    const { data, error } = await admin.from('maintenance_visits')
      .insert({ plan_id: t.planAId, contract_machine_id: t.lineAId, scheduled_date: '2026-08-20', assigned_to: t.techB })
      .select('id').single()
    if (error) throw new Error(`seed visit: ${error.message}`)
    const q = await queueFor(data!.id as string)
    expect(q).toHaveLength(1)
    expect(q[0]).toMatchObject({ recipient_id: t.techB, kind: 'assigned', entity_type: 'visit' })
  })
})

describe('borrar un técnico con trabajo asignado', () => {
  it('no se bloquea: la FK pone assigned_to a NULL sin encolar un aviso huérfano', async () => {
    const uid = await createUserWithRole(admin, DEL_TECH_EMAIL, 'technician')
    const id = await newIncident('TEST-PUSH-DEL', uid)
    expect(await queueFor(id)).toHaveLength(1)

    const { error } = await admin.auth.admin.deleteUser(uid)
    expect(error).toBeNull()

    const { data } = await admin.from('incidents').select('assigned_to').eq('id', id).single()
    expect(data!.assigned_to).toBeNull()
    // La fila 'assigned' se fue con el perfil (CASCADE) y no se encoló ningún 'unassigned'.
    expect(await queueFor(id)).toHaveLength(0)
  })
})
