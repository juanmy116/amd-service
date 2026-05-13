import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import TechIncidentList from '@/components/tech/TechIncidentList'
import type { TechIncident } from '@/components/tech/TechIncidentList'

export default async function TechIncidentsPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data } = await supabase
    .from('incidents')
    .select('id, title, status, priority, created_at, clients!client_id(nom_client)')
    .eq('assigned_to', user.id)
    .order('created_at', { ascending: false })

  const incidents = (data ?? []) as unknown as TechIncident[]

  return (
    <div className="p-4 space-y-4">
      <h1 className="text-lg font-semibold text-gray-900 pt-2" style={{ fontFamily: 'Poppins, sans-serif' }}>
        Mes interventions
      </h1>
      <TechIncidentList incidents={incidents} />
    </div>
  )
}
