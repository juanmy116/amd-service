import { createClient } from '@/lib/supabase/server'
import IncidentForm from '@/components/admin/IncidentForm'
import { createIncidentAction } from './actions'

export default async function NewIncidentPage() {
  const supabase = await createClient()

  const [{ data: rawContracts }, { data: technicians }] = await Promise.all([
    supabase
      .from('contracts')
      .select('id, numero_contrat, client_id, contract_machines(id, statut, date_fin, machines(numero_serie, marque, modele))')
      .eq('statut', 'actif')
      .order('numero_contrat'),
    supabase
      .from('profiles')
      .select('id, full_name')
      .eq('role', 'technician')
      .order('full_name'),
  ])

  // Transform to the shape IncidentForm expects, keeping only active lines
  const contracts = (rawContracts ?? [])
    .map((c) => ({
      id: c.id,
      numero_contrat: c.numero_contrat,
      client_id: c.client_id,
      lines: (c.contract_machines ?? [])
        .filter((l) => l.statut === 'actif' && l.date_fin === null && l.machines !== null)
        .map((l) => ({
          id: l.id,
          machine: {
            numero_serie: l.machines!.numero_serie,
            marque: l.machines!.marque,
            modele: l.machines!.modele,
          },
        })),
    }))
    // Only include contracts that have at least one active machine line
    .filter((c) => c.lines.length > 0)

  return (
    <IncidentForm
      action={createIncidentAction}
      contracts={contracts}
      technicians={technicians ?? []}
      title="Nouvel incident"
    />
  )
}
