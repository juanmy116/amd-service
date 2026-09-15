'use client'

import { useRef, useState } from 'react'
import { Volume2, VolumeX } from 'lucide-react'
import { ALERT_SOUND } from '@/lib/atelier/sound'

type Result = 'idle' | 'playing' | 'blocked'

/**
 * Prueba la campana de avería nueva sin tener que inventarse una incidencia.
 *
 * Sirve para separar los dos motivos por los que el kiosko puede quedarse mudo:
 *  - si al pulsar sale «Son bloqué», es el navegador, que exige un gesto previo → falta la
 *    opción `--autoplay-policy=no-user-gesture-required` de Chromium (paso 4 del runbook);
 *  - si el botón se pone verde y aun así no se oye nada, el navegador está reproduciendo y el
 *    problema está por debajo: la salida de audio de la Raspberry o el volumen de la TV
 *    (ver la sección «Sonido» de `docs/kiosque-atelier-raspberry.md`).
 */
export default function SoundTestButton() {
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const [result, setResult] = useState<Result>('idle')

  async function test() {
    const audio = (audioRef.current ??= new Audio(ALERT_SOUND))
    audio.currentTime = 0
    try {
      await audio.play()
      setResult('playing')
      setTimeout(() => setResult('idle'), 4000)
    } catch {
      setResult('blocked')
    }
  }

  const blocked = result === 'blocked'

  return (
    <button
      type="button"
      onClick={test}
      title="Tester le son de l'alerte"
      className={[
        'flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-sm font-semibold transition-colors',
        blocked
          ? 'bg-warning/15 text-warning'
          : result === 'playing'
            ? 'bg-success/15 text-success'
            : 'bg-white/5 text-white/50 hover:text-white',
      ].join(' ')}
    >
      {blocked ? <VolumeX size={16} /> : <Volume2 size={16} />}
      {blocked && 'Son bloqué'}
    </button>
  )
}
