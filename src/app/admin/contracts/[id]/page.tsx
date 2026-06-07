import { createClient } from '@/lib/supabase/server'
import { notFound } from 'next/navigation'
import ContractForm from '@/components/admin/ContractForm'
import { updateContractAction, deleteContractAction } from './actions'

export default async function EditContractPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const supabase = await createClient()

  const { data: contract } = await supabase.from('contracts').select('*').eq('id', id).single()
  if (!contract) notFound()

  // Clientes activos + el cliente actual del contrato aunque esté inactivo
  // (evita que el <select> muestre el primer cliente de la lista si el cliente
  // del contrato fue desactivado, lo que causaría guardar el cliente equivocado)
  const [{ data: clients }, { data: allMachines }, { data: openLines }, { data: contractLines }, { data: billingPlans }] = await Promise.all([
    supabase.from('clients')
      .select('id, nom_client, princity_company_id')
      .or(`active.eq.true,id.eq.${contract.client_id}`)
      .order('nom_client'),
    supabase.from('machines').select('numero_serie, marque, modele').eq('active', true).order('marque').order('modele'),
    // Lines open on a DIFFERENT contract (exclude this contract's own open lines)
    supabase.from('contract_machines').select('machine_id').is('date_fin', null).neq('contract_id', id),
    // All lines (open and closed) for THIS contract, with machine join
    supabase.from('contract_machines')
      .select('id, machine_id, date_debut, date_fin, statut, billing_day_override, maintenance_frequency_override, notes, billing_plan_id, price_bw_override, price_color_override, fixed_fee_override, machines(numero_serie, marque, modele)')
      .eq('contract_id', id)
      .order('date_debut', { ascending: true }),
    supabase.from('billing_plans').select('id, name, type').eq('active', true).order('name'),
  ])

  // availableMachines = machines with no open line on another contract
  const blockedByOther = new Set((openLines ?? []).map((l) => l.machine_id))
  const availableMachines = (allMachines ?? []).filter((m) => !blockedByOther.has(m.numero_serie))

  // initialLines: only the open (date_fin IS NULL) lines of this contract
  const initialLines = (contractLines ?? [])
    .filter((l) => l.date_fin === null)
    .map((l) => ({
      id: l.id,
      machine_id: l.machine_id,
      date_debut: l.date_debut,
      billing_day_override: l.billing_day_override ?? null,
      maintenance_frequency_override: (l.maintenance_frequency_override ?? null) as 'mensuel' | 'trimestriel' | null,
      notes: l.notes ?? null,
      billing_plan_id: l.billing_plan_id ?? null,
      price_bw_override: l.price_bw_override ?? null,
      price_color_override: l.price_color_override ?? null,
      fixed_fee_override: l.fixed_fee_override ?? null,
    }))

  const boundUpdateAction = updateContractAction.bind(null, contract.id)

  return (
    <ContractForm
      action={boundUpdateAction}
      defaultValues={contract}
      initialLines={initialLines}
      clients={clients ?? []}
      availableMachines={availableMachines}
      billingPlans={billingPlans ?? []}
      title={contract.numero_contrat}
      isEdit
      contractId={contract.id}
      deleteAction={deleteContractAction}
    />
  )
}
