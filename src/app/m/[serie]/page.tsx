import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { stampQrScan } from '@/lib/scan.server'

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
    // Esta ruta es la que codifican las etiquetas impresas: llegar aquí significa haber
    // tenido la máquina delante. Es uno de los DOS sitios donde ese sello es creíble; el otro
    // es el escáner de la propia app (`recordQrScanAction`) — ver `stampQrScan`.
    await stampQrScan(decodeURIComponent(serie), user.id)
    redirect(`/tech/scan/${encoded}`)
  }

  if (profile.role === 'client') {
    redirect(`/portal/incidents/new?machine=${encoded}`)
  }

  redirect('/login')
}
