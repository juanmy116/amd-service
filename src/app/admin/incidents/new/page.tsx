import { createClient } from '@/lib/supabase/server'
import IncidentForm from '@/components/admin/IncidentForm'
import { createIncidentAction } from './actions'

export default async function NewIncidentPage() {
  const supabase = await createClient()

  const [{ data: rawContracts }, { data: technicians }] = await Promise.all([
    supabase
      .from('contracts')
      .select('id, numero_contrat, clients(nom_client)')
      .eq('statut', 'actif')
      .order('numero_contrat'),
    supabase
      .from('profiles')
      .select('id, full_name')
      .eq('role', 'technician')
      .order('full_name'),
  ])

  const contracts = rawContracts?.map((c) => ({
    id:             c.id,
    numero_contrat: c.numero_contrat,
    client_name:    (c.clients as unknown as { nom_client: string } | null)?.nom_client ?? '',
  })) ?? []

  return (
    <IncidentForm
      action={createIncidentAction}
      contracts={contracts}
      technicians={technicians ?? []}
      title="Nouvel incident"
    />
  )
}
