'use client'

import { useEffect, useRef, useState } from 'react'
import { BellRing, VolumeX } from 'lucide-react'

type Props = {
  /** Cuántas averías nuevas han entrado en el último refresco. */
  newCount: number
  /** Número de la última que entró, para nombrarla en el aviso. */
  lastNumero: string | null
  /** Marca de tiempo del aviso: identifica cada tanda y evita repetir la campana. */
  at: number
}

const SOUND = '/sounds/nouvelle-panne.mp3'
/** Cuánto se queda el cartel en pantalla. En un taller ruidoso el aviso visual es el que manda. */
const BANNER_MS = 12_000

/**
 * Avisa de que ha entrado una avería nueva: campana + cartel en pantalla.
 *
 * Los navegadores no dejan sonar audio hasta que alguien ha interactuado con la página, así que
 * el primer intento puede fallar. Cuando pasa, se enseña un botón para activarlo (basta una vez
 * por sesión). En la Raspberry conviene además arrancar Chromium con
 * `--autoplay-policy=no-user-gesture-required`, y entonces suena desde el encendido.
 */
export default function NewIncidentAlert({ newCount, lastNumero, at }: Props) {
  const audioRef = useRef<HTMLAudioElement | null>(null)
  // Última tanda ya anunciada. Sin esto la campana suena dos veces en desarrollo (React monta
  // los efectos por duplicado) y ante cualquier re-ejecución del efecto.
  const announced = useRef(0)
  const [blocked, setBlocked] = useState(false)
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    audioRef.current = new Audio(SOUND)
    audioRef.current.preload = 'auto'
  }, [])

  useEffect(() => {
    if (newCount === 0 || at === announced.current) return
    announced.current = at

    setVisible(true)
    const hide = setTimeout(() => setVisible(false), BANNER_MS)

    const audio = audioRef.current
    if (audio) {
      audio.currentTime = 0
      audio.play().then(
        () => setBlocked(false),
        () => setBlocked(true) // el navegador exige un clic previo
      )
    }

    return () => clearTimeout(hide)
  }, [newCount, at])

  async function enableSound() {
    const audio = audioRef.current
    if (!audio) return
    try {
      await audio.play()
      setBlocked(false)
    } catch {
      /* si vuelve a fallar, el botón sigue ahí */
    }
  }

  if (blocked) {
    return (
      <button
        type="button"
        onClick={enableSound}
        className="fixed bottom-6 left-6 z-50 flex items-center gap-2 rounded-xl border border-warning/40 bg-warning/15 px-4 py-3 text-sm font-bold text-white shadow-lg"
      >
        <VolumeX size={18} className="text-warning" />
        Activer le son des alertes
      </button>
    )
  }

  if (!visible) return null

  return (
    <div
      role="status"
      className="fixed top-24 left-1/2 z-50 flex -translate-x-1/2 items-center gap-3 rounded-2xl border-2 border-white/20 bg-accent px-7 py-4 text-white shadow-2xl animate-pulse"
    >
      <BellRing size={26} />
      <span className="font-display text-xl font-extrabold">
        {newCount === 1 ? 'Nouvelle panne signalée' : `${newCount} nouvelles pannes signalées`}
      </span>
      {lastNumero && <span className="font-mono text-lg font-bold text-white/80">{lastNumero}</span>}
    </div>
  )
}
