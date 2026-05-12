'use client'

import { useState } from 'react'
import { CalendarDays, X } from 'lucide-react'

export default function AgendaPanelWrapper({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = useState(false)

  return (
    <>
      {/* Panel: inline en xl+, drawer overlay en < xl cuando open */}
      <div
        className={
          open
            ? 'flex flex-col fixed inset-y-0 right-0 w-80 z-50 shadow-2xl overflow-hidden xl:relative xl:inset-auto xl:w-72 xl:h-screen xl:shrink-0 xl:shadow-none xl:z-auto'
            : 'hidden xl:flex xl:flex-col xl:w-72 xl:h-screen xl:shrink-0 xl:overflow-hidden'
        }
      >
        {/* Cabecera de cierre — solo visible en mobile cuando abierto */}
        {open && (
          <div className="xl:hidden flex items-center justify-between px-4 py-3 bg-white border-b border-gray-200 shrink-0">
            <span className="text-sm font-semibold text-gray-800" style={{ fontFamily: 'Poppins, sans-serif' }}>
              Agenda
            </span>
            <button
              onClick={() => setOpen(false)}
              className="flex items-center justify-center w-8 h-8 rounded-lg hover:bg-gray-100 transition-colors"
            >
              <X size={18} className="text-gray-500" />
            </button>
          </div>
        )}

        {/* Contenido del panel */}
        <div className="flex-1 min-h-0">
          {children}
        </div>
      </div>

      {/* Backdrop — solo mobile */}
      {open && (
        <div
          className="xl:hidden fixed inset-0 bg-black/40 z-40"
          onClick={() => setOpen(false)}
        />
      )}

      {/* Botón flotante (FAB) — solo mobile, solo cuando cerrado */}
      {!open && (
        <button
          onClick={() => setOpen(true)}
          className="xl:hidden fixed bottom-6 right-6 z-40 w-12 h-12 rounded-full shadow-lg text-white flex items-center justify-center hover:opacity-90 transition-opacity"
          style={{ backgroundColor: '#BF0D0D' }}
          aria-label="Ouvrir l'agenda"
        >
          <CalendarDays size={20} />
        </button>
      )}
    </>
  )
}
