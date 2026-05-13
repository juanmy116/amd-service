'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { LayoutDashboard, AlertCircle, Printer, CalendarDays } from 'lucide-react'

const NAV = [
  { href: '/tech',           label: 'Accueil',   icon: LayoutDashboard, exact: true },
  { href: '/tech/incidents', label: 'Incidents',  icon: AlertCircle },
  { href: '/tech/machines',  label: 'Machines',   icon: Printer },
  { href: '/tech/planning',  label: 'Planning',   icon: CalendarDays },
]

export default function TechNav() {
  const pathname = usePathname()

  return (
    <nav className="fixed bottom-0 left-0 right-0 max-w-lg mx-auto bg-white border-t border-gray-200 z-10">
      <div className="grid grid-cols-4 h-16">
        {NAV.map(({ href, label, icon: Icon, exact }) => {
          const active = exact ? pathname === href : pathname.startsWith(href)
          return (
            <Link
              key={href}
              href={href}
              className={`flex flex-col items-center justify-center gap-1 text-xs font-medium transition-colors ${
                active ? 'text-red-600' : 'text-gray-400 hover:text-gray-600'
              }`}
            >
              <Icon size={20} strokeWidth={active ? 2.5 : 1.75} />
              {label}
            </Link>
          )
        })}
      </div>
    </nav>
  )
}
