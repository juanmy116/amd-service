import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { signOut } from '@/app/login/actions'
import { Printer, LogOut, AlertCircle, LayoutDashboard } from 'lucide-react'

export default async function PortalLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('profiles')
    .select('role, full_name')
    .eq('id', user.id)
    .single()

  if (profile?.role !== 'client') redirect('/dashboard')

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Top nav */}
      <header className="bg-white border-b border-gray-200 sticky top-0 z-10">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 h-14 flex items-center justify-between">

          {/* Logo */}
          <div className="flex items-center gap-2.5">
            <div className="w-7 h-7 rounded-lg flex items-center justify-center" style={{ backgroundColor: '#BF0D0D' }}>
              <span className="text-white font-bold text-xs" style={{ fontFamily: 'Poppins, sans-serif' }}>A</span>
            </div>
            <span className="text-sm font-semibold text-gray-900" style={{ fontFamily: 'Poppins, sans-serif' }}>
              AMD Service
            </span>
          </div>

          {/* Nav links */}
          <nav className="flex items-center gap-1">
            <Link href="/portal" className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm text-gray-600 hover:bg-gray-100 transition-colors">
              <LayoutDashboard size={15} />
              Tableau de bord
            </Link>
            <Link href="/portal/incidents" className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm text-gray-600 hover:bg-gray-100 transition-colors">
              <AlertCircle size={15} />
              Mes incidents
            </Link>
          </nav>

          {/* Right: new + logout */}
          <div className="flex items-center gap-2">
            <Link
              href="/portal/incidents/new"
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium text-white transition-opacity hover:opacity-90"
              style={{ backgroundColor: '#BF0D0D' }}
            >
              <Printer size={14} />
              Signaler un problème
            </Link>
            <form action={signOut}>
              <button type="submit" className="flex items-center justify-center w-8 h-8 rounded-lg text-gray-400 hover:bg-gray-100 hover:text-gray-600 transition-colors">
                <LogOut size={15} />
              </button>
            </form>
          </div>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-4 sm:px-6 py-8">
        {children}
      </main>
    </div>
  )
}
