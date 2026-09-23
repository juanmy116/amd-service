import { describe, expect, it } from 'vitest'
import { installHint } from './display'

const IPHONE = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1'
const IPAD_DESKTOP_UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Safari/605.1.15'
const ANDROID = 'Mozilla/5.0 (Linux; Android 14; SM-A546B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0 Mobile Safari/537.36'
const MAC = IPAD_DESKTOP_UA

describe('installHint', () => {
  it('ya instalada ⇒ no muestra nada', () => {
    expect(installHint({ userAgent: IPHONE, maxTouchPoints: 5, standalone: true, dismissed: false })).toBe('none')
  })

  it('cerrada por el técnico ⇒ no muestra nada', () => {
    expect(installHint({ userAgent: IPHONE, maxTouchPoints: 5, standalone: false, dismissed: true })).toBe('none')
  })

  it('iPhone en Safari ⇒ pasos de iOS', () => {
    expect(installHint({ userAgent: IPHONE, maxTouchPoints: 5, standalone: false, dismissed: false })).toBe('ios')
  })

  it('iPad (se anuncia como Mac pero es táctil) ⇒ pasos de iOS', () => {
    expect(installHint({ userAgent: IPAD_DESKTOP_UA, maxTouchPoints: 5, standalone: false, dismissed: false })).toBe('ios')
  })

  it('Android ⇒ indicación genérica', () => {
    expect(installHint({ userAgent: ANDROID, maxTouchPoints: 5, standalone: false, dismissed: false })).toBe('other')
  })

  it('ordenador (sin pantalla táctil) ⇒ no muestra nada', () => {
    expect(installHint({ userAgent: MAC, maxTouchPoints: 0, standalone: false, dismissed: false })).toBe('none')
  })
})
