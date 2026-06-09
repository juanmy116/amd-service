import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import TechIncidentList from '@/components/tech/TechIncidentList'
import type { TechIncident } from '@/components/tech/TechIncidentList'

export default async function TechIncidentsPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  // Cliente resuelto vía la cadena contract_machine_id → contract_machines → contracts → clients.
  // Las incidencias públicas (machine_id directo, sin línea de contrato) no tienen cliente:
  // se muestran por su numéro de série.
  const { data } = await supabase
    .from('incidents')
    .select('id, numero_incident, title, status, priority, created_at, machine_id, contract_machines(contracts(clients(nom_client)))')
    .eq('assigned_to', user.id)
    .order('created_at', { ascending: false })

  const incidents: TechIncident[] = (data ?? []).map((row) => {
    const r = row as unknown as {
      id: string; numero_incident: string; title: string; status: string
      priority: string; created_at: string; machine_id: string | null
      contract_machines: { contracts: { clients: { nom_client: string } | null } | null } | null
    }
    return {
      id: r.id,
      numero_incident: r.numero_incident,
      title: r.title,
      status: r.status,
      priority: r.priority,
      created_at: r.created_at,
      machine_id: r.machine_id,
      clients: r.contract_machines?.contracts?.clients ?? null,
    }
  })

  return (
    <div className="p-4 space-y-4">
      <h1 className="text-lg font-semibold text-ink pt-2 font-display">
        Mes interventions
      </h1>
      <TechIncidentList incidents={incidents} />
    </div>
  )
}
