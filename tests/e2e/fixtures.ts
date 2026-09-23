import { adminClient, createUserWithRole, cleanup, PASSWORD } from '../rls/helpers'

// Datos de prueba del recorrido E2E. Reutiliza los helpers de RLS para crear
// usuarios por rol vía service_role. Prefijos TEST-/@e2e.test para el cleanup.
export const E2E = {
  adminEmail: 'admin@e2e.test',
  techEmail: 'tech@e2e.test',
  clientEmail: 'client@e2e.test',
  password: PASSWORD,
  serie: 'TEST-SN-E2E',
  incidentNumero: 'TEST-E2E-I1',
  // Máquina del mismo contrato SIN incidencias del técnico: solo tiene una visita de
  // mantenimiento asignada. Prueba que la ficha se ve por «cualquier técnico ve cualquier
  // máquina activa», no porque tenga una avería ahí (ver tech-scan.spec.ts).
  serieLibre: 'TEST-SN-E2E-LIBRE',
  clientNombre: 'TEST Client E2E',
}

export type SeedIds = { techId: string; incidentId: string; visitId: string }

// Crea: admin, técnico y cliente; un cliente con su vínculo de acceso; un contrato
// con dos máquinas (líneas abiertas); una incidencia INTERNA `nouveau` sin asignar
// ligada a la primera línea; y un plan de mantenimiento activo con una visita
// `planifié` asignada al técnico en la SEGUNDA máquina (sin incidencias). Idempotente
// (limpia antes).
export async function seed(): Promise<SeedIds> {
  const admin = adminClient()
  await cleanup(admin)

  await createUserWithRole(admin, E2E.adminEmail, 'admin')
  const techId = await createUserWithRole(admin, E2E.techEmail, 'technician')
  const clientUid = await createUserWithRole(admin, E2E.clientEmail, 'client')

  const { data: cli, error: cliErr } = await admin
    .from('clients').insert({ nom_client: E2E.clientNombre }).select('id').single()
  if (cliErr) throw new Error(`seed client: ${cliErr.message}`)
  const clientId = cli!.id
  const { error: cpErr } = await admin
    .from('client_profiles').insert({ profile_id: clientUid, client_id: clientId })
  if (cpErr) throw new Error(`seed client_profiles: ${cpErr.message}`)

  const { data: contract, error: cErr } = await admin
    .from('contracts')
    .insert({ numero_contrat: 'TEST-E2E-C1', client_id: clientId, date_debut: '2026-01-01', statut: 'actif' })
    .select('id').single()
  if (cErr) throw new Error(`seed contract: ${cErr.message}`)

  const { error: mErr } = await admin
    .from('machines').insert({ numero_serie: E2E.serie, marque: 'TEST', modele: 'E2E', active: true })
  if (mErr) throw new Error(`seed machine: ${mErr.message}`)

  const { data: line, error: lErr } = await admin
    .from('contract_machines')
    .insert({ contract_id: contract!.id, machine_id: E2E.serie, date_debut: '2026-01-01', statut: 'actif' })
    .select('id').single()
  if (lErr) throw new Error(`seed line: ${lErr.message}`)

  const { data: inc, error: iErr } = await admin
    .from('incidents')
    .insert({
      numero_incident: E2E.incidentNumero,
      title: 'Bourrage papier E2E',
      contract_machine_id: line!.id,
      status: 'nouveau',
    })
    .select('id').single()
  if (iErr) throw new Error(`seed incident: ${iErr.message}`)

  // Segunda máquina del mismo contrato, SIN incidencia del técnico: solo lleva una visita
  // de mantenimiento asignada. Prueba «cualquier técnico ve cualquier máquina activa» (Task 1)
  // sin depender de que tenga una avería ahí.
  const { error: mLibreErr } = await admin
    .from('machines').insert({ numero_serie: E2E.serieLibre, marque: 'TEST', modele: 'E2E', active: true })
  if (mLibreErr) throw new Error(`seed machine libre: ${mLibreErr.message}`)

  const { data: lineLibre, error: lLibreErr } = await admin
    .from('contract_machines')
    .insert({ contract_id: contract!.id, machine_id: E2E.serieLibre, date_debut: '2026-01-01', statut: 'actif' })
    .select('id').single()
  if (lLibreErr) throw new Error(`seed line libre: ${lLibreErr.message}`)

  const { data: plan, error: pErr } = await admin
    .from('maintenance_plans')
    .insert({ contract_id: contract!.id, frequency: 'trimestriel', active: true })
    .select('id').single()
  if (pErr) throw new Error(`seed maintenance_plans: ${pErr.message}`)

  const { data: visit, error: vErr } = await admin
    .from('maintenance_visits')
    .insert({
      plan_id: plan!.id,
      contract_machine_id: lineLibre!.id,
      scheduled_date: '2026-01-15',
      status: 'planifié',
      assigned_to: techId,
    })
    .select('id').single()
  if (vErr) throw new Error(`seed maintenance_visits: ${vErr.message}`)

  return { techId, incidentId: inc!.id, visitId: visit!.id }
}

export async function teardown(): Promise<void> {
  await cleanup(adminClient())
}
