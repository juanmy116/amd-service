import { describe, it, expect } from 'vitest'
import { resolveCsatRecipient } from './csat'

describe('resolveCsatRecipient', () => {
  it('usa el email del formulario público cuando lo hay', () => {
    expect(resolveCsatRecipient('client@2as.sn', null)).toEqual({
      email: 'client@2as.sn',
      source: 'contact',
    })
  })

  it('cae a la cuenta del portal cuando no hay email de contacto', () => {
    expect(resolveCsatRecipient(null, 'portal@2as.sn')).toEqual({
      email: 'portal@2as.sn',
      source: 'portal',
    })
  })

  it('el email del formulario gana al del portal: es quien vivió la intervención', () => {
    expect(resolveCsatRecipient('client@2as.sn', 'portal@2as.sn')).toEqual({
      email: 'client@2as.sn',
      source: 'contact',
    })
  })

  it('devuelve null cuando no hay ninguno', () => {
    expect(resolveCsatRecipient(null, null)).toBeNull()
    expect(resolveCsatRecipient(undefined, undefined)).toBeNull()
  })

  it('ignora cadenas vacías o de solo espacios', () => {
    expect(resolveCsatRecipient('   ', 'portal@2as.sn')).toEqual({
      email: 'portal@2as.sn',
      source: 'portal',
    })
    expect(resolveCsatRecipient('', '')).toBeNull()
  })

  it('recorta los espacios del email elegido', () => {
    expect(resolveCsatRecipient('  client@2as.sn  ', null)).toEqual({
      email: 'client@2as.sn',
      source: 'contact',
    })
  })
})
