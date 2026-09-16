'use client'

import { useRef, useState } from 'react'
import { Volume2, VolumeX } from 'lucide-react'
import { ALERT_SOUND, ALERT_SOUND_MS, playAlertSound } from '@/lib/atelier/sound'

type Result = 'idle' | 'playing' | 'error'

/**
 * Hace sonar la campana de avería nueva sin tener que inventarse una incidencia.
 *
 * Sirve para probar la cadena que va del navegador al altavoz: si se pulsa y no se oye nada, el
 * problema está por debajo del navegador (salida de audio de la Raspberry, cable, volumen de la
 * TV → sección «Sonido» de `docs/kiosque-atelier-raspberry.md`).
 *
 * Lo que este botón NO puede comprobar es el bloqueo de audio del navegador: Chromium siempre
 * deja sonar lo que nace de un clic, así que aquí saldría verde incluso en una Raspberry a la que
 * le falte `--autoplay-policy=no-user-gesture-required`. Ese caso lo delata otro sitio, y sin
 * ambigüedad: cuando entra una panne de verdad, `NewIncidentAlert` intenta sonar SIN que nadie
 * haya tocado nada, y si el navegador lo bloquea saca su botón «Activer le son des alertes».
 */
export default function SoundTestButton() {
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const [result, setResult] = useState<Result>('idle')

  async function test() {
    const audio = (audioRef.current ??= new Audio(ALERT_SOUND))
    try {
      // Misma duración que el aviso real: si la prueba sonara menos, no probaría lo mismo.
      await playAlertSound(audio, ALERT_SOUND_MS).started
      setResult('playing')
      setTimeout(() => setResult('idle'), ALERT_SOUND_MS)
    } catch {
      // Aquí solo se llega si el fichero no carga o no se puede decodificar.
      setResult('error')
    }
  }

  const failed = result === 'error'

  return (
    <button
      type="button"
      onClick={test}
      title="Faire sonner l'alerte (test du haut-parleur)"
      className={[
        'flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-sm font-semibold transition-colors',
        failed
          ? 'bg-warning/15 text-warning'
          : result === 'playing'
            ? 'bg-success/15 text-success'
            : 'bg-white/5 text-white/50 hover:text-white',
      ].join(' ')}
    >
      {failed ? <VolumeX size={16} /> : <Volume2 size={16} />}
      {failed && 'Erreur son'}
    </button>
  )
}
