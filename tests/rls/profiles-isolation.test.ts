import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { adminClient, anonClient, signInAs, cleanup, ANON_KEY, SERVICE_KEY } from './helpers'
import { seedTenants, SC, type Tenants } from './scenario'

// Aislamiento RLS de PROFILES y CLIENT_PROFILES.
//   profiles: cada usuario ve solo su perfil; el admin ve todos. Un usuario NO
//     puede escalar privilegios cambiándose role/is_dispatcher (doble defensa:
//     GRANT por columna + trigger tg_profiles_protect_privileged).
//   client_profiles: cada cliente ve solo su propio vínculo.

const admin = adminClient()
let t: Tenants

beforeAll(async () => {
  if (!ANON_KEY || !SERVICE_KEY) {
    throw new Error('Faltan ANON_KEY/SERVICE_ROLE_KEY. Ejecuta con `supabase start` y exporta las claves.')
  }
  await cleanup(admin)
  t = await seedTenants(admin)
}, 90_000)

afterAll(async () => {
  await cleanup(admin)
})

describe('RLS profiles — visibilidad', () => {
  it('el cliente A ve solo su propio perfil', async () => {
    const c = await signInAs(SC.clientAEmail)
    const { data } = await c.from('profiles').select('id').in('id', [t.clientAUid, t.clientBUid, t.techA])
    const ids = (data ?? []).map((x) => x.id)
    expect(ids).toContain(t.clientAUid)
    expect(ids).not.toContain(t.clientBUid)
    expect(ids).not.toContain(t.techA)
  })

  it('el técnico A ve solo su propio perfil', async () => {
    const c = await signInAs(SC.techAEmail)
    const { data } = await c.from('profiles').select('id').in('id', [t.techA, t.techB, t.clientAUid])
    const ids = (data ?? []).map((x) => x.id)
    expect(ids).toContain(t.techA)
    expect(ids).not.toContain(t.techB)
    expect(ids).not.toContain(t.clientAUid)
  })

  it('el admin ve los perfiles de todos los usuarios sembrados', async () => {
    const c = await signInAs(SC.adminEmail)
    const { data } = await c.from('profiles').select('id')
      .in('id', [t.adminUid, t.techA, t.techB, t.clientAUid, t.clientBUid])
    expect((data ?? []).length).toBe(5)
  })
})

describe('RLS profiles — escalada de privilegios bloqueada', () => {
  it('el cliente A NO puede auto-asignarse role=admin', async () => {
    const c = await signInAs(SC.clientAEmail)
    await c.from('profiles').update({ role: 'admin' }).eq('id', t.clientAUid)
    // Verificación independiente con service_role: el rol sigue siendo 'client'.
    const { data } = await admin.from('profiles').select('role').eq('id', t.clientAUid).single()
    expect(data?.role).toBe('client')
  })

  it('el técnico A NO puede auto-asignarse is_dispatcher', async () => {
    const c = await signInAs(SC.techAEmail)
    await c.from('profiles').update({ is_dispatcher: true }).eq('id', t.techA)
    const { data } = await admin.from('profiles').select('is_dispatcher').eq('id', t.techA).single()
    expect(data?.is_dispatcher).toBe(false)
  })

  it('el cliente A SÍ puede actualizar su propio full_name (columna no sensible)', async () => {
    const c = await signInAs(SC.clientAEmail)
    await c.from('profiles').update({ full_name: 'Cliente A Renombrado' }).eq('id', t.clientAUid)
    const { data } = await admin.from('profiles').select('full_name').eq('id', t.clientAUid).single()
    expect(data?.full_name).toBe('Cliente A Renombrado')
  })

  it('el cliente A NO puede modificar el perfil de otro usuario', async () => {
    const c = await signInAs(SC.clientAEmail)
    await c.from('profiles').update({ full_name: 'hijacked' }).eq('id', t.techA)
    const { data } = await admin.from('profiles').select('full_name').eq('id', t.techA).single()
    expect(data?.full_name).not.toBe('hijacked')
  })
})

describe('RLS client_profiles — aislamiento', () => {
  it('el cliente A ve solo su propio vínculo (no el del cliente B)', async () => {
    const c = await signInAs(SC.clientAEmail)
    const { data } = await c.from('client_profiles').select('profile_id, client_id')
      .in('profile_id', [t.clientAUid, t.clientBUid])
    const profileIds = (data ?? []).map((x) => x.profile_id)
    expect(profileIds).toContain(t.clientAUid)
    expect(profileIds).not.toContain(t.clientBUid)
  })
})
