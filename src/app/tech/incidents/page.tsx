import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import TechIncidentList from '@/components/tech/TechIncidentList'
import type { TechIncident } from '@/components/tech/TechIncidentList'
import { TECH_INCIDENT_SELECT } from '@/lib/incident'
import { coordsForMachines } from '@/lib/geo.server'

export default async function TechIncidentsPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  // Cliente resuelto vía la cadena contract_machine_id → contract_machines → contracts → clients.
  // Las incidencias públicas (machine_id directo, sin línea de contrato) no tienen cliente:
  // se muestran por su numéro de série.
  const { data } = await supabase
    .from('incidents')
    .select(TECH_INCIDENT_SELECT)
    .eq('assigned_to', user.id)
    .order('created_at', { ascending: false })

  // Nº de série de la machine (interne via contract_machines, publique via machine_id
  // directement) pour demander ses coordonnées à « Plus proche » (Fase 3 §Task 8).
  const seriesBySerie = (data ?? []).map((r) => r.contract_machines?.machines?.numero_serie ?? r.machine_id)
  const coordsBySerie = await coordsForMachines(seriesBySerie.filter((s): s is string => !!s))

  const incidents: TechIncident[] = (data ?? []).map((row) => {
    const r = row
    const serie = r.contract_machines?.machines?.numero_serie ?? r.machine_id
    return {
      id: r.id,
      numero_incident: r.numero_incident,
      title: r.title,
      status: r.status,
      priority: r.priority,
      created_at: r.created_at,
      machine_id: r.machine_id,
      clients: r.contract_machines?.contracts?.clients ?? null,
      coords: serie ? coordsBySerie.get(serie) ?? null : null,
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
