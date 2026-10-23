import { describe, it, expect } from 'vitest'
import { normalizeClientPhone } from '@/lib/phone'

describe('normalizeClientPhone', () => {
  it('conserva un número completo', () => {
    expect(normalizeClientPhone('+221 77 123 45 67')).toBe('+221 77 123 45 67')
    expect(normalizeClientPhone('33 820 12 34')).toBe('33 820 12 34')
  })

  it('el prefijo solo (casilla sin completar) cuenta como vacío', () => {
    expect(normalizeClientPhone('+221 ')).toBeNull()
    expect(normalizeClientPhone('+221')).toBeNull()
    expect(normalizeClientPhone('00221')).toBeNull()
    expect(normalizeClientPhone('   ')).toBeNull()
    expect(normalizeClientPhone('')).toBeNull()
    expect(normalizeClientPhone(null)).toBeNull()
  })

  it('quita lo que no es de un teléfono y junta los espacios', () => {
    expect(normalizeClientPhone('+221  77<b>123</b> 45 67')).toBe('+221 77123 45 67')
    expect(normalizeClientPhone('voir email')).toBeNull()
  })

  it('corta a 30 caracteres', () => {
    expect(normalizeClientPhone('+221 ' + '7'.repeat(40))?.length).toBe(30)
  })
})
