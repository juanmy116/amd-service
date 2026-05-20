import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import Sidebar from '@/components/admin/Sidebar'
import AdminAgendaPanel from '@/components/admin/AgendaPanel'
import AgendaPanelWrapper from '@/components/admin/AgendaPanelWrapper'

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('profiles')
    .select('role, full_name')
    .eq('id', user.id)
    .single()

  if (profile?.role !== 'admin') redirect('/dashboard')

  return (
    <div className="flex h-screen overflow-hidden bg-page">
      <Sidebar fullName={profile.full_name} />
      <main className="flex-1 overflow-y-auto">
        {children}
      </main>
      <AgendaPanelWrapper>
        <AdminAgendaPanel />
      </AgendaPanelWrapper>
    </div>
  )
}
