import type { SupabaseClient } from '@supabase/supabase-js'
import { createUserWithRole } from './helpers'

// Escenario base de DOS inquilinos para los tests de aislamiento por rol.
// Reutilizado por park / maintenance / billing / profiles / admin-only.
//
// Grafo sembrado:
//   Cliente A ── contrato A ── máquina A (línea A activa)
//   Cliente B ── contrato B ── máquina B (línea B activa)
//   Técnico A: 1 incidencia asignada en la máquina A (→ ve A, no B)
//   Técnico B: sin trabajo asignado (→ no ve nada del parque)
//   1 plan + 1 visita de mantenimiento en el contrato A, asignada al técnico A
//
// Cada usuario externo (clientUserA/B) está vinculado a su cliente vía
// client_profiles, que es la fuente de verdad del aislamiento del portal.

export const SC = {
  adminEmail: 'sc-admin@rls.test',
  techAEmail: 'sc-tech-a@rls.test',
  techBEmail: 'sc-tech-b@rls.test',
  clientAEmail: 'sc-client-a@rls.test',
  clientBEmail: 'sc-client-b@rls.test',
  snA: 'TEST-SN-A',
  snB: 'TEST-SN-B',
  contractNumA: 'TEST-C-A',
  contractNumB: 'TEST-C-B',
  incidentNumA: 'TEST-I-A',
} as const

export interface Tenants {
  adminUid: string
  techA: string
  techB: string
  clientAUid: string
  clientBUid: string
  clientAId: number
  clientBId: number
  contractAId: string
  contractBId: string
  lineAId: string
  lineBId: string
  planAId: string
  visitAId: string
}

export async function seedTenants(admin: SupabaseClient): Promise<Tenants> {
  const adminUid = await createUserWithRole(admin, SC.adminEmail, 'admin')
  const techA = await createUserWithRole(admin, SC.techAEmail, 'technician')
  const techB = await createUserWithRole(admin, SC.techBEmail, 'technician')
  const clientAUid = await createUserWithRole(admin, SC.clientAEmail, 'client')
  const clientBUid = await createUserWithRole(admin, SC.clientBEmail, 'client')

  // Clientes + vínculo de acceso de cada usuario externo a su cliente.
  const clientAId = await insertClient(admin, 'TEST Client A', clientAUid)
  const clientBId = await insertClient(admin, 'TEST Client B', clientBUid)

  // Máquinas.
  await insertMachine(admin, SC.snA)
  await insertMachine(admin, SC.snB)

  // Contratos + línea activa (date_fin NULL) por cliente.
  const contractAId = await insertContract(admin, SC.contractNumA, clientAId)
  const contractBId = await insertContract(admin, SC.contractNumB, clientBId)
  const lineAId = await insertLine(admin, contractAId, SC.snA)
  const lineBId = await insertLine(admin, contractBId, SC.snB)

  // Incidencia asignada al técnico A en la máquina A: le da visibilidad de A.
  const { error: iErr } = await admin.from('incidents').insert({
    numero_incident: SC.incidentNumA, title: 'Incident A', contract_machine_id: lineAId, assigned_to: techA,
  })
  if (iErr) throw new Error(`seed incident: ${iErr.message}`)

  // Mantenimiento del contrato A, visita asignada al técnico A.
  const { data: plan, error: pErr } = await admin.from('maintenance_plans')
    .insert({ contract_id: contractAId, frequency: 'mensuel' }).select('id').single()
  if (pErr) throw new Error(`seed plan: ${pErr.message}`)
  const planAId = plan!.id as string
  const { data: visit, error: vErr } = await admin.from('maintenance_visits')
    .insert({ plan_id: planAId, contract_machine_id: lineAId, scheduled_date: '2026-07-01', assigned_to: techA })
    .select('id').single()
  if (vErr) throw new Error(`seed visit: ${vErr.message}`)
  const visitAId = visit!.id as string

  return {
    adminUid, techA, techB, clientAUid, clientBUid,
    clientAId, clientBId, contractAId, contractBId, lineAId, lineBId, planAId, visitAId,
  }
}

async function insertClient(admin: SupabaseClient, nom: string, profileId: string): Promise<number> {
  const { data, error } = await admin.from('clients').insert({ nom_client: nom }).select('id').single()
  if (error) throw new Error(`seed client (${nom}): ${error.message}`)
  const id = data!.id as number
  const { error: cpErr } = await admin.from('client_profiles').insert({ profile_id: profileId, client_id: id })
  if (cpErr) throw new Error(`seed client_profiles (${nom}): ${cpErr.message}`)
  return id
}

async function insertMachine(admin: SupabaseClient, sn: string): Promise<void> {
  const { error } = await admin.from('machines').insert({ numero_serie: sn, marque: 'TEST', modele: 'X', type: 'color' })
  if (error) throw new Error(`seed machine (${sn}): ${error.message}`)
}

async function insertContract(admin: SupabaseClient, num: string, clientId: number): Promise<string> {
  const { data, error } = await admin.from('contracts')
    .insert({ numero_contrat: num, client_id: clientId, date_debut: '2026-01-01', statut: 'actif' })
    .select('id').single()
  if (error) throw new Error(`seed contract (${num}): ${error.message}`)
  return data!.id as string
}

async function insertLine(admin: SupabaseClient, contractId: string, sn: string): Promise<string> {
  const { data, error } = await admin.from('contract_machines')
    .insert({ contract_id: contractId, machine_id: sn, date_debut: '2026-01-01', statut: 'actif' })
    .select('id').single()
  if (error) throw new Error(`seed line (${sn}): ${error.message}`)
  return data!.id as string
}
