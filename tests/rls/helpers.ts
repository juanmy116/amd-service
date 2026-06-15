import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { expect } from 'vitest'

// Aserción para "este rol autenticado NO ve la fila": el resultado debe ser un set
// VACÍO devuelto por RLS, NO un error de consulta. Sin el chequeo de `error`, una
// consulta rota (columna/tabla mal escrita, permiso denegado) devuelve data=null →
// length 0 → el test "no ve nada" pasaría por el motivo equivocado (falso verde).
// NO usar para el cliente anónimo: anon puede recibir permission-denied legítimo
// (no tiene GRANT en varias tablas), y ahí 0 filas por error sí es lo esperado.
export function expectEmpty(res: { data: unknown[] | null; error: unknown }): void {
  expect(res.error).toBeNull()
  expect(res.data ?? []).toHaveLength(0)
}

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

// Ejecuta un .delete() y lanza si la BD devolvió error (supabase-js no lanza solo).
async function delOrThrow(q: PromiseLike<{ error: { message: string } | null }>, label: string): Promise<void> {
  const { error } = await q
  if (error) throw new Error(`cleanup ${label}: ${error.message}`)
}

// Borra todos los datos de fixture (prefijo TEST-) y los usuarios de prueba.
// En CI la BD es efímera (supabase db reset), pero esto da idempotencia en local.
export async function cleanup(admin: SupabaseClient): Promise<void> {
  // Tablas que referencian con ON DELETE RESTRICT al grafo base (clients,
  // machines, incidents) o son independientes con prefijo TEST: se borran ANTES,
  // o el borrado del grafo fallaría por la FK.
  // NOTA: las facturas NO se borran aquí — son inmutables por trigger (ni siquiera
  // service_role puede borrarlas). El billing test usa clientes dedicados con prefijo
  // 'TESTINV ' (fuera de este barrido) para que sus facturas nunca bloqueen el
  // borrado de los clientes 'TEST '. Ver tests/rls/billing-isolation.test.ts.
  await admin.from('csat_responses').delete().like('token', 'TEST-%')           // RESTRICT → incidents
  await admin.from('machine_counters').delete().like('machine_id', 'TEST-%')    // RESTRICT → machines
  await admin.from('leads').delete().like('name', 'TEST %')
  await admin.from('billing_plans').delete().like('name', 'TEST %')
  await admin.from('pending_counter_imports').delete().like('image_hash_sha256', 'TEST%')
  await admin.from('princity_api_logs').delete().like('function_name', 'TEST-%')
  await admin.from('princity_health').delete().like('function_name', 'TEST-%')

  // Grafo base: si UN delete falla (FK RESTRICT no prevista, etc.), supabase-js NO
  // lanza — dejaría datos y el SIGUIENTE archivo fallaría con un duplicate key
  // desorientador. Chequeamos el error aquí para que el fallo apunte a su causa real.
  await delOrThrow(admin.from('incidents').delete().like('numero_incident', 'TEST-%'), 'incidents')
  await delOrThrow(admin.from('contract_machines').delete().like('machine_id', 'TEST-%'), 'contract_machines')
  await delOrThrow(admin.from('contracts').delete().like('numero_contrat', 'TEST-%'), 'contracts')
  await delOrThrow(admin.from('machines').delete().like('numero_serie', 'TEST-%'), 'machines')
  // client_profiles antes que clients (FK).
  const { data: testClients } = await admin.from('clients').select('id').like('nom_client', 'TEST %')
  const clientIds = (testClients ?? []).map((c) => c.id)
  if (clientIds.length) await admin.from('client_profiles').delete().in('client_id', clientIds)
  await delOrThrow(admin.from('clients').delete().like('nom_client', 'TEST %'), 'clients')

  // Borra usuarios de prueba de RLS (@rls.test) y E2E (@e2e.test) — dominio .test reservado.
  // perPage alto: el default (50) dejaría usuarios sin borrar si se acumulasen (p.ej.
  // un run interrumpido), y el siguiente createUser fallaría por email ya existente.
  const { data } = await admin.auth.admin.listUsers({ perPage: 1000 })
  for (const u of data?.users ?? []) {
    if (u.email?.endsWith('.test')) {
      await admin.auth.admin.deleteUser(u.id)
    }
  }
}
