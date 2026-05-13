import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { QrCode } from 'lucide-react'
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
      <div className="hidden lg:block">
        <TechDesktopSidebar fullName={profile?.full_name ?? null} />
      </div>
      <main className="lg:ml-64 xl:mr-72">
        <div className="max-w-lg mx-auto lg:max-w-none pb-20 lg:pb-0">
          {children}
        </div>
      </main>
      <div className="hidden xl:block">
        <TechAgendaPanel />
      </div>
      <div className="lg:hidden fixed bottom-16 left-0 right-0 flex justify-center px-4 z-40 pointer-events-none">
        <Link
          href="/tech/scan"
          className="pointer-events-auto flex items-center gap-2 px-6 py-3.5 rounded-full shadow-lg text-white text-sm font-semibold"
          style={{ backgroundColor: '#BF0D0D' }}
        >
          <QrCode size={20} />
          Scanner une machine
        </Link>
      </div>
      <div className="lg:hidden">
        <TechNav />
      </div>
    </div>
  )
}
