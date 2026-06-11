import { createClient } from '@/lib/supabase/server'
import { createMaintenancePlanAction } from './actions'
import NewMaintenancePlanForm from '@/components/admin/NewMaintenancePlanForm'

export default async function NewMaintenancePlanPage() {
  const supabase = await createClient()

  // Contratos activos que aún no tienen plan de mantenimiento
  // Restore the machines(marque, modele) join that was accidentally removed in Block 3
  const [{ data: allContracts }, { data: existingPlans }] = await Promise.all([
    supabase
      .from('contracts')
      .select('id, numero_contrat, clients(nom_client), contract_machines(id, statut, date_fin, machines(marque, modele))')
      .eq('statut', 'actif')
      .order('numero_contrat'),
    supabase
      .from('maintenance_plans')
      .select('contract_id'),
  ])

  const plannedIds = new Set((existingPlans ?? []).map(p => p.contract_id))

  // Build a display label per contract using the first active machine
  const availableContracts = (allContracts ?? [])
    .filter(c => !plannedIds.has(c.id))
    .map(c => {
      const firstActiveMachine = (c.contract_machines ?? [])
        .filter((l) => l.statut === 'actif' && l.date_fin === null && l.machines !== null)
        .map((l) => l.machines!)[0] ?? null

      return {
        id: c.id,
        numero_contrat: c.numero_contrat,
        clients: c.clients ?? { nom_client: '—' },
        machines: firstActiveMachine ?? { marque: '—', modele: '' },
      }
    })

  return (
    <NewMaintenancePlanForm
      action={createMaintenancePlanAction}
      contracts={availableContracts}
    />
  )
}
