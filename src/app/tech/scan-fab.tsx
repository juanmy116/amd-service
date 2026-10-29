'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { QrCode } from 'lucide-react'

// Botón flotante «Scanner une machine». En la ficha de una avería se oculta: ahí el escaneo
// va dentro de los pasos de la propia ficha y el botón solo confundiría.
export default function ScanFab() {
  const pathname = usePathname()
  if (/^\/tech\/incidents\/[^/]+/.test(pathname)) return null

  return (
    <div className="lg:hidden fixed bottom-[calc(4rem+env(safe-area-inset-bottom))] left-0 right-0 flex justify-center px-4 z-40 pointer-events-none">
      <Link
        href="/tech/scan"
        className="pointer-events-auto flex items-center gap-2 px-6 py-3.5 rounded-full text-white text-sm font-semibold bg-accent shadow-raised"
      >
        <QrCode size={20} />
        Scanner une machine
      </Link>
    </div>
  )
}
