'use client'

import { useState } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import {
  LayoutDashboard, Users, Printer, FileText,
  AlertCircle, UserCog, LogOut, BarChart2, Wrench, CalendarDays,
  ChevronLeft, ChevronRight, Plug,
} from 'lucide-react'
import { signOut } from '@/app/login/actions'

const NAV = [
  { href: '/admin',             label: 'Tableau de bord', icon: LayoutDashboard, exact: true },
  { href: '/admin/clients',     label: 'Clients',         icon: Users },
  { href: '/admin/machines',    label: 'Machines',        icon: Printer },
  { href: '/admin/contadores',  label: 'Compteurs',       icon: BarChart2 },
  { href: '/admin/contracts',   label: 'Contrats',        icon: FileText },
  { href: '/admin/incidents',   label: 'Incidents SAV',   icon: AlertCircle },
  { href: '/admin/maintenance', label: 'Maintenance',     icon: Wrench },
  { href: '/admin/calendrier',  label: 'Calendrier',      icon: CalendarDays },
  { href: '/admin/team',        label: 'Équipe',          icon: UserCog },
  { href: '/admin/princity',    label: 'Princity API',    icon: Plug },
]

export default function Sidebar({ fullName }: { fullName: string | null }) {
  const pathname    = usePathname()
  const [collapsed, setCollapsed] = useState(false)

  return (
    <aside
      className={`${
        collapsed ? 'w-16' : 'w-64'
      } h-screen flex flex-col bg-white border-r border-gray-200 shrink-0 overflow-x-hidden transition-all duration-200`}
    >

      {/* Logo + botón toggle */}
      <div className={`flex items-center h-16 border-b border-gray-200 shrink-0 ${collapsed ? 'justify-center px-2' : 'px-4 justify-between'}`}>
        <div className="flex items-center gap-2.5 min-w-0">
          <div
            className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0"
            style={{ backgroundColor: '#BF0D0D' }}
          >
            <span className="text-white font-bold text-sm" style={{ fontFamily: 'Poppins, sans-serif' }}>A</span>
          </div>
          {!collapsed && (
            <div className="min-w-0">
              <p className="text-sm font-semibold text-gray-900 leading-none truncate" style={{ fontFamily: 'Poppins, sans-serif' }}>
                AMD Service
              </p>
              <p className="text-xs text-gray-400 mt-0.5">Back-office</p>
            </div>
          )}
        </div>

        {!collapsed && (
          <button
            onClick={() => setCollapsed(true)}
            className="flex items-center justify-center w-7 h-7 rounded-lg text-gray-400 hover:bg-gray-100 hover:text-gray-600 transition-colors shrink-0"
            title="Réduire"
          >
            <ChevronLeft size={15} />
          </button>
        )}
      </div>

      {/* Nav */}
      <nav className={`flex-1 py-3 space-y-0.5 overflow-y-auto ${collapsed ? 'px-2' : 'px-3'}`}>

        {/* Botón expandir — solo cuando está colapsado */}
        {collapsed && (
          <button
            onClick={() => setCollapsed(false)}
            className="flex items-center justify-center w-full py-2 mb-1 rounded-lg text-gray-400 hover:bg-gray-100 hover:text-gray-600 transition-colors"
            title="Développer"
          >
            <ChevronRight size={15} />
          </button>
        )}

        {NAV.map(({ href, label, icon: Icon, exact }) => {
          const active = exact ? pathname === href : pathname.startsWith(href)
          return (
            <Link
              key={href}
              href={href}
              title={collapsed ? label : undefined}
              className={`flex items-center rounded-lg text-sm font-medium transition-colors ${
                collapsed ? 'justify-center p-2.5' : 'gap-3 px-3 py-2.5'
              } ${
                active
                  ? 'text-white'
                  : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900'
              }`}
              style={active ? { backgroundColor: '#BF0D0D' } : {}}
            >
              <Icon size={18} />
              {!collapsed && label}
            </Link>
          )
        })}
      </nav>

      {/* User + logout */}
      <div className={`py-3 border-t border-gray-200 shrink-0 ${collapsed ? 'px-2' : 'px-3'}`}>
        {!collapsed && fullName && (
          <p className="px-3 text-xs text-gray-400 mb-2 truncate">{fullName}</p>
        )}
        <form action={signOut}>
          <button
            type="submit"
            title={collapsed ? 'Déconnexion' : undefined}
            className={`flex items-center rounded-lg text-sm font-medium text-gray-600 hover:bg-gray-100 hover:text-gray-900 transition-colors w-full ${
              collapsed ? 'justify-center p-2.5' : 'gap-3 px-3 py-2.5'
            }`}
          >
            <LogOut size={18} />
            {!collapsed && 'Déconnexion'}
          </button>
        </form>
      </div>

    </aside>
  )
}
