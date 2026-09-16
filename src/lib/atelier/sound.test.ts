import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { playAlertSound, canRing, ALERT_SOUND_MS, RINGING_HOURS, type AlertAudio } from './sound'

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

describe('canRing', () => {
  // Hora LOCAL del aparato: es la que ve el taller. Se construye con `new Date(y, m, d, h)`
  // justamente para no depender de la zona horaria de quien ejecute los tests.
  const at = (hour: number, minute = 0) => new Date(2026, 8, 16, hour, minute)

  it('suena en horario de taller', () => {
    expect(canRing(at(RINGING_HOURS.from))).toBe(true)   // 07:00 en punto, primera campanada
    expect(canRing(at(12))).toBe(true)
    expect(canRing(at(18, 59))).toBe(true)               // último minuto
  })

  it('calla de noche y de madrugada', () => {
    expect(canRing(at(RINGING_HOURS.to))).toBe(false)    // 19:00 ya no
    expect(canRing(at(22))).toBe(false)
    expect(canRing(at(3))).toBe(false)                   // el caso que motivó esto
    expect(canRing(at(6, 59))).toBe(false)
  })

  it('no distingue días: el taller abre también el fin de semana', () => {
    const domingo = new Date(2026, 8, 20, 10)
    expect(domingo.getDay()).toBe(0)
    expect(canRing(domingo)).toBe(true)
  })
})
