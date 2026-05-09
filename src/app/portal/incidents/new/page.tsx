import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import NewIncidentForm from './form'
import { createPortalIncidentAction } from './actions'

export default async function PortalNewIncidentPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: clientProfile } = await supabase
    .from('client_profiles')
    .select('client_id')
    .eq('profile_id', user.id)
    .single()

  if (!clientProfile) redirect('/portal/verify')

  const { data: contracts } = await supabase
    .from('contracts')
    .select('id, numero_contrat, machine_id, machines(marque, modele)')
    .eq('client_id', clientProfile.client_id)
    .eq('statut', 'actif')

  const options = contracts?.map((c) => {
    const m = c.machines as unknown as { marque: string; modele: string } | null
    return {
      id:    c.id,
      label: m ? `${m.marque} ${m.modele} — ${c.numero_contrat}` : c.machine_id,
    }
  }) ?? []

  return <NewIncidentForm action={createPortalIncidentAction} contracts={options} />
}
