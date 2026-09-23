import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { QrCode } from 'lucide-react'
import type { Metadata, Viewport } from 'next'
import { MANIFEST_PATH } from '@/lib/pwa/manifest'
import { ServiceWorkerRegister } from '@/components/tech/ServiceWorkerRegister'
import TechNav from './tech-nav'
import TechDesktopSidebar from './tech-desktop-sidebar'
import TechAgendaPanel from '@/components/tech/AgendaPanel'

// Solo /tech se ofrece como app instalable (ver src/lib/pwa/manifest.ts).
export const metadata: Metadata = {
  manifest: MANIFEST_PATH,
  appleWebApp: { capable: true, title: 'AMD SAV', statusBarStyle: 'default' },
  icons: { apple: '/pwa/apple-touch-icon.png' },
}

// viewportFit: 'cover' hace que env(safe-area-inset-*) tenga valor en el iPhone instalado;
// sin él, la barra de gestos tapa la navegación inferior.
export const viewport: Viewport = {
  viewportFit: 'cover',
  themeColor: '#BF0D0D',
}

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
    <div className="min-h-screen bg-page">
      <ServiceWorkerRegister />
      <div className="hidden lg:block">
        <TechDesktopSidebar fullName={profile?.full_name ?? null} />
      </div>
      <main className="lg:ml-64 xl:mr-72">
        <div className="max-w-lg mx-auto lg:max-w-none pb-[calc(5rem+env(safe-area-inset-bottom))] lg:pb-0 pl-[env(safe-area-inset-left)] pr-[env(safe-area-inset-right)]">
          {children}
        </div>
      </main>
      <div className="hidden xl:block">
        <TechAgendaPanel />
      </div>
      <div className="lg:hidden fixed bottom-[calc(4rem+env(safe-area-inset-bottom))] left-0 right-0 flex justify-center px-4 z-40 pointer-events-none">
        <Link
          href="/tech/scan"
          className="pointer-events-auto flex items-center gap-2 px-6 py-3.5 rounded-full text-white text-sm font-semibold bg-accent shadow-raised"
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
