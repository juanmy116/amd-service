import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import TechNav from './tech-nav'
import TechDesktopSidebar from './tech-desktop-sidebar'
import TechAgendaPanel from '@/components/tech/AgendaPanel'

export default async function TechLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('profiles')
    .select('role, full_name')
    .eq('id', user.id)
    .single()

  if (profile?.role !== 'technician') redirect('/dashboard')

  return (
    <div className="min-h-screen bg-gray-50">

      {/* Desktop sidebar — oculto en móvil */}
      <div className="hidden lg:block">
        <TechDesktopSidebar fullName={profile?.full_name ?? null} />
      </div>

      {/* Contenido principal */}
      <main className="lg:ml-64 xl:mr-72">
        {/* Móvil: columna centrada estrecha + padding bottom para la nav */}
        {/* Desktop: ancho completo */}
        <div className="max-w-lg mx-auto lg:max-w-none pb-20 lg:pb-0">
          {children}
        </div>
      </main>

      {/* Panel derecho agenda — solo desktop xl+ */}
      <div className="hidden xl:block">
        <TechAgendaPanel />
      </div>

      {/* Mobile bottom nav — oculto en desktop */}
      <div className="lg:hidden">
        <TechNav />
      </div>
    </div>
  )
}
