'use client'

import { useState } from 'react'
import { CalendarDays, X } from 'lucide-react'

export default function AgendaPanelWrapper({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = useState(false)

  return (
    <>
      {/* Panel: inline en xl+; en < xl es un drawer que se desliza desde la derecha.
          Siempre montado: cerrado queda `invisible` (fuera del orden de Tab) y fuera de pantalla. */}
      <div
        className={`flex flex-col fixed inset-y-0 right-0 w-80 z-50 overflow-hidden bg-card transition-[translate,visibility] duration-300 ease-out xl:relative xl:inset-auto xl:w-72 xl:h-screen xl:shrink-0 xl:z-auto xl:translate-x-0 xl:visible xl:shadow-none xl:transition-none ${
          open ? 'translate-x-0 visible shadow-2xl' : 'translate-x-full invisible'
        }`}
      >
        {/* Cabecera de cierre — solo mobile (en xl+ el panel es fijo) */}
        <div className="xl:hidden flex items-center justify-between px-4 py-3 bg-card border-b border-line shrink-0">
          <span className="text-sm font-semibold text-ink font-display">
            Agenda
          </span>
          <button
            onClick={() => setOpen(false)}
            className="flex items-center justify-center w-8 h-8 rounded-lg hover:bg-neutral-soft transition-colors"
            aria-label="Fermer l'agenda"
          >
            <X size={18} className="text-ink-soft" />
          </button>
        </div>

        {/* Contenido del panel */}
        <div className="flex-1 min-h-0">
          {children}
        </div>
      </div>

      {/* Backdrop — solo mobile; siempre montado, sin capturar clics cuando está cerrado */}
      <div
        className={`xl:hidden fixed inset-0 z-40 bg-black/40 transition-opacity duration-300 ${
          open ? 'opacity-100' : 'opacity-0 pointer-events-none'
        }`}
        aria-hidden="true"
        onClick={() => setOpen(false)}
      />

      {/* Botón flotante (FAB) — solo mobile, solo cuando cerrado */}
      {!open && (
        <button
          onClick={() => setOpen(true)}
          className="xl:hidden fixed bottom-6 right-6 z-40 w-12 h-12 rounded-full shadow-lg text-white bg-accent flex items-center justify-center hover:opacity-90 transition-opacity"
          aria-label="Ouvrir l'agenda"
        >
          <CalendarDays size={20} />
        </button>
      )}
    </>
  )
}
