'use client'

import { useEffect, useRef, useState } from 'react'
import { BellRing, VolumeX } from 'lucide-react'
import { ALERT_SOUND, ALERT_SOUND_MS, playAlertSound, type AlertPlayback } from '@/lib/atelier/sound'

type Props = {
  /** Cuántas averías nuevas han entrado en el último refresco. */
  newCount: number
  /** Número de la última que entró, para nombrarla en el aviso. */
  lastNumero: string | null
  /** Marca de tiempo del aviso: identifica cada tanda y evita repetir la campana. */
  at: number
  /** Cuántas averías siguen sin que nadie se haga cargo (estado `nouveau`). */
  unattendedCount: number
}

/** Cuánto se queda el cartel de entrada en pantalla. */
const BANNER_MS = 12_000

/**
 * Cada cuánto vuelve a sonar la campana mientras haya averías que nadie ha cogido.
 *
 * El aviso de entrada dura segundos: si el técnico está en una intervención, se lo pierde entero.
 * Por eso el kiosko insiste hasta que alguien se hace cargo — quien entre al taller lo oirá en
 * pocos minutos sin tener que mirar la pantalla en el momento justo.
 */
const REMINDER_MS = 5 * 60_000

/**
 * Los dos avisos de avería del kiosko:
 *
 * 1. **Entrada** — cuando aparece una avería nueva: campana + cartel unos segundos.
 * 2. **Insistencia** — mientras alguna siga sin que nadie la coja, campana repetida cada
 *    `REMINDER_MS`. La parte visible de ese aviso la pinta `UnattendedBanner`, en el flujo.
 *
 * Los navegadores no dejan sonar audio hasta que alguien ha interactuado con la página, así que
 * el primer intento puede fallar. Cuando pasa, se enseña un botón para activarlo (basta una vez
 * por sesión). En la Raspberry conviene además arrancar Chromium con
 * `--autoplay-policy=no-user-gesture-required`, y entonces suena desde el encendido.
 */
export default function PanneAlert({ newCount, lastNumero, at, unattendedCount }: Props) {
  const audioRef = useRef<HTMLAudioElement | null>(null)
  // Reproducción en curso: si entra otro aviso mientras suena, se corta antes de volver a empezar.
  const playbackRef = useRef<AlertPlayback | null>(null)
  // Última tanda ya anunciada. Sin esto la campana suena dos veces en desarrollo (React monta
  // los efectos por duplicado) y ante cualquier re-ejecución del efecto.
  const announced = useRef(0)
  const [blocked, setBlocked] = useState(false)
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    audioRef.current = new Audio(ALERT_SOUND)
    audioRef.current.preload = 'auto'
  }, [])

  function ring() {
    const audio = audioRef.current
    if (!audio) return
    playbackRef.current?.cancel()
    const playback = playAlertSound(audio, ALERT_SOUND_MS)
    playbackRef.current = playback
    playback.started.then(
      () => setBlocked(false),
      () => setBlocked(true) // el navegador exige un clic previo
    )
  }

  // 1. Avería recién entrada.
  useEffect(() => {
    if (newCount === 0 || at === announced.current) return
    announced.current = at

    setVisible(true)
    const hide = setTimeout(() => setVisible(false), BANNER_MS)
    ring()

    // Solo se retira el cartel. La campana se apaga sola al cumplir ALERT_SOUND_MS: cancelarla
    // aquí la cortaría a media campanada en cuanto el tablero se refrescara (cada 30 s).
    return () => clearTimeout(hide)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [newCount, at])

  // 2. Recordatorio mientras nadie coja la avería. `at` entra en las dependencias a propósito:
  //    si acaba de sonar el aviso de entrada, la cuenta de 5 min empieza de cero y no se solapan.
  useEffect(() => {
    if (unattendedCount === 0) return
    const timer = setInterval(ring, REMINDER_MS)
    return () => clearInterval(timer)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [unattendedCount, at])

  return (
    <>
      {blocked && (
        <button
          type="button"
          onClick={ring}
          className="fixed bottom-6 left-6 z-50 flex items-center gap-2 rounded-xl border border-warning/40 bg-warning/15 px-4 py-3 text-sm font-bold text-white shadow-lg"
        >
          <VolumeX size={18} className="text-warning" />
          Activer le son des alertes
        </button>
      )}

      {visible && (
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
      )}
    </>
  )
}
