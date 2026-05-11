import { createClient } from '@/lib/supabase/server'
import { createMaintenancePlanAction } from './actions'
import NewMaintenancePlanForm from '@/components/admin/NewMaintenancePlanForm'

export default async function NewMaintenancePlanPage() {
  const supabase = await createClient()

  // Contratos activos que aún no tienen plan de mantenimiento
  const [{ data: allContracts }, { data: existingPlans }] = await Promise.all([
    supabase
      .from('contracts')
      .select('id, numero_contrat, clients(nom_client), machines(marque, modele)')
      .eq('statut', 'actif')
      .order('numero_contrat'),
    supabase
      .from('maintenance_plans')
      .select('contract_id'),
  ])

  const plannedIds = new Set((existingPlans ?? []).map(p => p.contract_id))
  const availableContracts = (allContracts ?? []).filter(c => !plannedIds.has(c.id))

  return (
    <NewMaintenancePlanForm
      action={createMaintenancePlanAction}
      contracts={availableContracts as any}
    />
  )
}
