'use client'

import { useEffect, useState } from 'react'
import { CheckCircle2 } from 'lucide-react'

/** Cuánto se queda el acuse de recibo en pantalla. */
const VISIBLE_MS = 8_000

type Props = {
  /** Número de la avería que se acaba de archivar, para nombrarla. */
  numero: string | null
  /** Instante del archivado: identifica cada acuse y reinicia la cuenta atrás. */
  at: number
}

/**
 * Acuse de recibo del kiosko: «la avería se archivó».
 *
 * Una resolución de oficina va directa a «Fermé», y los tableros de la TV solo enseñan averías
 * vivas — así que la tarjeta desaparece en el acto. De pie delante de la pantalla, una tarjeta
 * que se esfuma se parece demasiado a que no haya funcionado, y quien lo dude lo intentará otra
 * vez. Esto dice en voz alta lo que acaba de pasar.
 *
 * Flota, a diferencia de `UnattendedBanner`: dura unos segundos y desaparece, así que no puede
 * acabar tapando nada de forma permanente.
 */
export default function ArchivedToast({ numero, at }: Props) {
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    if (!at) return
    setVisible(true)
    const t = setTimeout(() => setVisible(false), VISIBLE_MS)
    return () => clearTimeout(t)
  }, [at])

  if (!visible) return null

  return (
    <div
      role="status"
      className="fixed bottom-8 left-1/2 z-50 flex -translate-x-1/2 items-center gap-3 rounded-2xl border-2 border-success/40 bg-success/20 px-7 py-4 text-white shadow-2xl"
    >
      <CheckCircle2 size={28} className="shrink-0 text-success" />
      <span className="font-display text-xl font-bold tracking-tight">
        {numero ? `${numero} — résolue au bureau et archivée` : 'Panne résolue au bureau et archivée'}
      </span>
    </div>
  )
}
