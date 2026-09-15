'use client'

import { useEffect } from 'react'
import { X } from 'lucide-react'

type Props = {
  url: string
  onClose: () => void
}

/**
 * Foto del cliente a pantalla completa, DENTRO de la aplicación.
 *
 * Antes la foto se abría con `target="_blank"`, es decir en una pestaña nueva del navegador. En
 * el kiosko del taller Chromium arranca a pantalla completa y sin barra de pestañas: una vez
 * abierta la foto no había forma de volver al tablero sin teclado. De ahí esta ventana propia,
 * que se cierra de tres maneras (botón, clic en el fondo y Escape) porque el despachador solo
 * tiene un ratón a mano.
 */
export default function PhotoLightbox({ url, onClose }: Props) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Photo signalée par le client"
      onClick={onClose}
      className="fixed inset-0 z-[60] flex flex-col items-center justify-center gap-4 bg-black/90 p-8"
    >
      <button
        type="button"
        onClick={onClose}
        className="absolute right-6 top-6 flex items-center gap-2 rounded-xl bg-white/10 px-5 py-3 text-base font-bold text-white hover:bg-white/20 transition-colors"
      >
        <X size={20} />
        Fermer
      </button>

      {/* El clic en la foto no cierra: así se puede mirar de cerca sin miedo a perderla */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={url}
        alt="Photo signalée par le client"
        onClick={(e) => e.stopPropagation()}
        className="max-h-full max-w-full rounded-lg object-contain shadow-2xl"
      />
    </div>
  )
}
