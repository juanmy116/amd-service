import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { playAlertSound, ALERT_SOUND_MS, type AlertAudio } from './sound'

function fakeAudio(play: () => Promise<void> = () => Promise.resolve()) {
  const audio = {
    loop: false,
    volume: 1,
    currentTime: 0,
    paused: true,
    play: vi.fn(async () => { audio.paused = false; return play() }),
    pause: vi.fn(() => { audio.paused = true }),
  }
  return audio as unknown as AlertAudio & { paused: boolean; play: ReturnType<typeof vi.fn>; pause: ReturnType<typeof vi.fn> }
}

describe('playAlertSound', () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => vi.useRealTimers())

  it('suena en bucle y se apaga sola al cumplir la duración', async () => {
    const audio = fakeAudio()
    playAlertSound(audio, ALERT_SOUND_MS)

    expect(audio.play).toHaveBeenCalled()
    expect(audio.loop).toBe(true)

    // A mitad sigue sonando: el fichero dura ~2 s, así que sin bucle ya habría callado.
    await vi.advanceTimersByTimeAsync(2_500)
    expect(audio.paused).toBe(false)

    await vi.advanceTimersByTimeAsync(ALERT_SOUND_MS)
    expect(audio.paused).toBe(true)
    expect(audio.loop).toBe(false)
    expect(audio.volume).toBe(1)   // deja el volumen listo para el próximo aviso
  })

  it('cancel() la corta antes de tiempo', async () => {
    const audio = fakeAudio()
    const { cancel } = playAlertSound(audio, ALERT_SOUND_MS)

    await vi.advanceTimersByTimeAsync(1_000)
    cancel()
    expect(audio.paused).toBe(true)

    // Y no queda ningún temporizador suelto que vuelva a tocarla.
    audio.pause.mockClear()
    await vi.advanceTimersByTimeAsync(ALERT_SOUND_MS * 2)
    expect(audio.pause).not.toHaveBeenCalled()
  })

  it('propaga el bloqueo de autoplay del navegador', async () => {
    const audio = fakeAudio(() => Promise.reject(new Error('NotAllowedError')))
    const { started } = playAlertSound(audio, ALERT_SOUND_MS)
    await expect(started).rejects.toThrow()
    expect(audio.loop).toBe(false)   // no deja el audio en bucle si nunca llegó a sonar
  })
})
