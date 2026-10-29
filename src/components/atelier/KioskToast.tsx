'use client'

import { useEffect, useState } from 'react'
import { CheckCircle2 } from 'lucide-react'

/** Cuánto se queda el acuse de recibo en pantalla. */
const VISIBLE_MS = 8_000

type Props = {
  message: string
  /** Instante de lo ocurrido: identifica cada acuse y reinicia la cuenta atrás. */
  at: number
}

/** Texto del acuse cuando una resolución de oficina archiva la avería. */
export function archivedMessage(numero: string | null): string {
  return numero ? `${numero} — résolue au bureau et archivée` : 'Panne résolue au bureau et archivée'
}

/**
 * Acuse de recibo del kiosko: dice en voz alta lo que acaba de pasar.
 *
 * Nació para el archivado: una resolución de oficina va directa a «Fermé», y los tableros de la
 * TV solo enseñan averías vivas — así que la tarjeta desaparece en el acto. De pie delante de la
 * pantalla, una tarjeta que se esfuma se parece demasiado a que no haya funcionado, y quien lo
 * dude lo intentará otra vez. También confirma las averías creadas con la burbuja «+».
 *
 * Flota, a diferencia de `UnattendedBanner`: dura unos segundos y desaparece, así que no puede
 * acabar tapando nada de forma permanente.
 */
export default function KioskToast({ message, at }: Props) {
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
      <span className="font-display text-xl font-bold tracking-tight">{message}</span>
    </div>
  )
}
