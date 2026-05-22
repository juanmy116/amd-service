import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'

export default async function MachineGateway({
  params,
}: {
  params: Promise<{ serie: string }>
}) {
  const { serie } = await params
  const encoded = encodeURIComponent(decodeURIComponent(serie))

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    redirect(`/signaler/${encoded}`)
  }

  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single()

  if (!profile) redirect('/login')

  if (profile.role === 'technician' || profile.role === 'admin') {
    redirect(`/tech/scan/${encoded}`)
  }

  if (profile.role === 'client') {
    redirect(`/portal/incidents/new?machine=${encoded}`)
  }

  redirect('/login')
}
