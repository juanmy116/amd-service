'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { LayoutDashboard, AlertCircle, Printer, LogOut, CalendarDays } from 'lucide-react'
import { signOut } from '@/app/login/actions'

const NAV = [
  { href: '/tech',           label: 'Tableau de bord',   icon: LayoutDashboard, exact: true },
  { href: '/tech/incidents', label: 'Mes interventions', icon: AlertCircle },
  { href: '/tech/machines',  label: 'Machines',          icon: Printer },
  { href: '/tech/planning',  label: 'Planning',          icon: CalendarDays },
]

export default function TechDesktopSidebar({ fullName }: { fullName: string | null }) {
  const pathname = usePathname()

  return (
    <aside className="fixed top-0 left-0 h-screen w-64 flex flex-col bg-white border-r border-gray-200 z-10">

      {/* Logo */}
      <div className="flex items-center gap-3 px-5 h-16 border-b border-gray-200">
        <div className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0" style={{ backgroundColor: '#BF0D0D' }}>
          <span className="text-white font-bold text-sm" style={{ fontFamily: 'Poppins, sans-serif' }}>A</span>
        </div>
        <div>
          <p className="text-sm font-semibold text-gray-900 leading-none" style={{ fontFamily: 'Poppins, sans-serif' }}>AMD Service</p>
          <p className="text-xs text-gray-400 mt-0.5">Espace technicien</p>
        </div>
      </div>

      {/* Nav */}
      <nav className="flex-1 px-3 py-4 space-y-0.5 overflow-y-auto">
        {NAV.map(({ href, label, icon: Icon, exact }) => {
          const active = exact ? pathname === href : pathname.startsWith(href)
          return (
            <Link
              key={href}
              href={href}
              className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                active ? 'text-white' : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900'
              }`}
              style={active ? { backgroundColor: '#BF0D0D' } : {}}
            >
              <Icon size={18} />
              {label}
            </Link>
          )
        })}
      </nav>

      {/* User + logout */}
      <div className="px-3 py-4 border-t border-gray-200">
        {fullName && (
          <p className="px-3 text-xs text-gray-400 mb-2 truncate">{fullName}</p>
        )}
        <form action={signOut}>
          <button type="submit" className="flex items-center gap-3 w-full px-3 py-2.5 rounded-lg text-sm font-medium text-gray-600 hover:bg-gray-100 hover:text-gray-900 transition-colors">
            <LogOut size={18} />
            Déconnexion
          </button>
        </form>
      </div>
    </aside>
  )
}
