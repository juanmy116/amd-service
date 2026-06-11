import { createClient } from '@/lib/supabase/server'
import ContractForm, { type BillingPlanOption } from '@/components/admin/ContractForm'
import { createContractAction } from './actions'

export default async function NewContractPage() {
  const supabase = await createClient()

  // availableMachines = machines that have NO open line (date_fin IS NULL)
  const [{ data: clients }, { data: allMachines }, { data: openLines }, { data: billingPlans }] = await Promise.all([
    supabase.from('clients').select('id, nom_client, princity_company_id').eq('active', true).order('nom_client'),
    supabase.from('machines').select('numero_serie, marque, modele').eq('active', true).order('marque').order('modele'),
    supabase.from('contract_machines').select('machine_id').is('date_fin', null),
    supabase.from('billing_plans').select('id, name, type').eq('active', true).order('name'),
  ])

  const openMachineIds = new Set((openLines ?? []).map((l) => l.machine_id))
  const availableMachines = (allMachines ?? []).filter((m) => !openMachineIds.has(m.numero_serie))

  return (
    <ContractForm
      action={createContractAction}
      clients={clients ?? []}
      availableMachines={availableMachines}
      billingPlans={(billingPlans ?? []) as BillingPlanOption[]}
      title="Nouveau contrat"
    />
  )
}
