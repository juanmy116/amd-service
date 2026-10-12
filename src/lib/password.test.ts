import { describe, expect, it } from 'vitest'
import { validateNewPassword } from './password'

describe('validateNewPassword', () => {
  it('acepta una contraseña de 8 caracteres repetida igual', () => {
    expect(validateNewPassword('abcd1234', 'abcd1234')).toBeNull()
  })

  it('rechaza menos de 8 caracteres', () => {
    expect(validateNewPassword('abc123', 'abc123')).toMatch(/au moins 8/)
  })

  it('rechaza si la confirmación no coincide', () => {
    expect(validateNewPassword('abcd1234', 'abcd1235')).toMatch(/ne correspondent pas/)
  })

  it('mira la longitud antes que la confirmación', () => {
    expect(validateNewPassword('abc', 'xyz')).toMatch(/au moins 8/)
  })
})
