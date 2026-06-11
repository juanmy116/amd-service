import { createClient, type SupabaseClient } from '@supabase/supabase-js'

// Las claves las exporta el job de CI con `supabase status -o env` (API_URL,
// ANON_KEY, SERVICE_ROLE_KEY). Para correr en local: `supabase start` y exportarlas.
export const URL =
  process.env.SUPABASE_URL ?? process.env.API_URL ?? 'http://127.0.0.1:54321'
export const ANON_KEY =
  process.env.SUPABASE_ANON_KEY ?? process.env.ANON_KEY ?? ''
export const SERVICE_KEY =
  process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SERVICE_ROLE_KEY ?? ''

export const PASSWORD = 'password123!'

// Cliente con service_role: salta RLS, sirve para crear fixtures.
export function adminClient(): SupabaseClient {
  return createClient(URL, SERVICE_KEY, { auth: { persistSession: false, autoRefreshToken: false } })
}

// Cliente anónimo (rol `anon`).
export function anonClient(): SupabaseClient {
  return createClient(URL, ANON_KEY, { auth: { persistSession: false, autoRefreshToken: false } })
}

export type Role = 'admin' | 'technician' | 'client'

// Crea un usuario auth confirmado y le fija el rol en su profile (el trigger
// handle_new_user ya creó el profile sin rol → tomaría el default).
export async function createUserWithRole(
  admin: SupabaseClient,
  email: string,
  role: Role,
): Promise<string> {
  const { data, error } = await admin.auth.admin.createUser({
    email,
    password: PASSWORD,
    email_confirm: true,
  })
  if (error) throw new Error(`createUser(${email}): ${error.message}`)
  const uid = data.user!.id
  const { error: upErr } = await admin.from('profiles').update({ role }).eq('id', uid)
  if (upErr) throw new Error(`set role(${email}): ${upErr.message}`)
  return uid
}

// Devuelve un cliente Supabase autenticado como el usuario indicado.
export async function signInAs(email: string): Promise<SupabaseClient> {
  const c = anonClient()
  const { error } = await c.auth.signInWithPassword({ email, password: PASSWORD })
  if (error) throw new Error(`signIn(${email}): ${error.message}`)
  return c
}

// Borra todos los datos de fixture (prefijo TEST-) y los usuarios de prueba.
// En CI la BD es efímera (supabase db reset), pero esto da idempotencia en local.
export async function cleanup(admin: SupabaseClient): Promise<void> {
  await admin.from('incidents').delete().like('numero_incident', 'TEST-%')
  await admin.from('contract_machines').delete().like('machine_id', 'TEST-%')
  await admin.from('contracts').delete().like('numero_contrat', 'TEST-%')
  await admin.from('machines').delete().like('numero_serie', 'TEST-%')
  // client_profiles antes que clients (FK).
  const { data: testClients } = await admin.from('clients').select('id').like('nom_client', 'TEST %')
  const clientIds = (testClients ?? []).map((c) => c.id)
  if (clientIds.length) await admin.from('client_profiles').delete().in('client_id', clientIds)
  await admin.from('clients').delete().like('nom_client', 'TEST %')

  // Borra usuarios de prueba de RLS (@rls.test) y E2E (@e2e.test) — dominio .test reservado.
  const { data } = await admin.auth.admin.listUsers()
  for (const u of data?.users ?? []) {
    if (u.email?.endsWith('.test')) {
      await admin.auth.admin.deleteUser(u.id)
    }
  }
}
