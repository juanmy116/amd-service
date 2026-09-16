/**
 * Campana del kiosko. La comparten el aviso automático de avería nueva (`NewIncidentAlert`) y el
 * botón de prueba de la cabecera (`SoundTestButton`), para que probar el sonido pruebe de verdad
 * el mismo fichero que sonará cuando entre una panne.
 */
export const ALERT_SOUND = '/sounds/nouvelle-panne.mp3'

/**
 * Cuánto tiene que sonar la campana. El fichero dura ~2 s y en un taller ruidoso se pierde, así
 * que se repite en bucle hasta cubrir este tiempo.
 */
export const ALERT_SOUND_MS = 5_000

/** Fundido final: cortar el bucle en seco, a mitad de campanada, suena a fallo. */
const FADE_MS = 250
const FADE_STEPS = 10

/** Lo que `playAlertSound` necesita de un `<audio>`; así se puede probar sin navegador. */
export type AlertAudio = Pick<HTMLAudioElement, 'play' | 'pause' | 'currentTime' | 'loop' | 'volume'>

export type AlertPlayback = {
  /** Resuelve si el navegador dejó sonar; rechaza si lo bloqueó por falta de interacción. */
  started: Promise<void>
  /** Corta el sonido ya (para no solapar dos avisos seguidos). */
  cancel: () => void
}

/**
 * Hace sonar la campana en bucle durante `durationMs` y la apaga con un fundido corto.
 *
 * Devuelve `started` aparte para que quien llama distinga el bloqueo de autoplay del navegador
 * (Chromium no deja sonar nada hasta que alguien ha interactuado con la página) de un fallo real
 * del fichero.
 */
export function playAlertSound(audio: AlertAudio, durationMs: number = ALERT_SOUND_MS): AlertPlayback {
  let fade: ReturnType<typeof setInterval> | undefined

  const reset = () => {
    audio.pause()
    audio.loop = false
    audio.volume = 1
    audio.currentTime = 0
  }

  audio.loop = true
  audio.volume = 1
  audio.currentTime = 0

  // Si el navegador lo bloquea no hay nada que apagar: se deja el audio como estaba.
  const started = Promise.resolve(audio.play()).catch((err) => {
    clearTimeout(stop)
    reset()
    throw err
  })

  const stop = setTimeout(() => {
    let step = 0
    fade = setInterval(() => {
      step++
      audio.volume = Math.max(0, 1 - step / FADE_STEPS)
      if (step >= FADE_STEPS) {
        clearInterval(fade)
        reset()
      }
    }, FADE_MS / FADE_STEPS)
  }, Math.max(0, durationMs - FADE_MS))

  return {
    started,
    cancel: () => {
      clearTimeout(stop)
      if (fade) clearInterval(fade)
      reset()
    },
  }
}
