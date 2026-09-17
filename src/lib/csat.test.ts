import { describe, it, expect } from 'vitest'
import { CSAT_VALIDITY_DAYS, csatExpiresAt, isSurveyStillValid, resolveCsatRecipient } from './csat'

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

describe('isSurveyStillValid', () => {
  const now = new Date('2026-09-17T10:00:00.000Z')

  it('es vigente si se envió y aún no ha caducado', () => {
    expect(isSurveyStillValid('2026-09-15T10:00:00.000Z', '2026-09-22T10:00:00.000Z', now)).toBe(true)
  })

  it('no es vigente si nunca se envió, aunque la fila no haya caducado', () => {
    expect(isSurveyStillValid(null, '2026-09-22T10:00:00.000Z', now)).toBe(false)
  })

  it('no es vigente si el enlace ya caducó: reenviarlo sería contar como enviada una encuesta muerta', () => {
    expect(isSurveyStillValid('2026-08-01T10:00:00.000Z', '2026-08-08T10:00:00.000Z', now)).toBe(false)
  })

  it('una caducidad exactamente ahora ya no vale', () => {
    expect(isSurveyStillValid('2026-09-10T10:00:00.000Z', now.toISOString(), now)).toBe(false)
  })

  it('sin fecha de caducidad o con una ilegible se trata como no vigente (lado seguro)', () => {
    expect(isSurveyStillValid('2026-09-15T10:00:00.000Z', null, now)).toBe(false)
    expect(isSurveyStillValid('2026-09-15T10:00:00.000Z', undefined, now)).toBe(false)
    expect(isSurveyStillValid('2026-09-15T10:00:00.000Z', 'pas une date', now)).toBe(false)
  })
})

describe('csatExpiresAt', () => {
  it('da 7 días desde el envío, que es lo que promete el email', () => {
    expect(csatExpiresAt(new Date('2026-09-17T10:00:00.000Z'))).toBe('2026-09-24T10:00:00.000Z')
    expect(CSAT_VALIDITY_DAYS).toBe(7)
  })

  it('cruza bien el fin de mes', () => {
    expect(csatExpiresAt(new Date('2026-09-28T23:30:00.000Z'))).toBe('2026-10-05T23:30:00.000Z')
  })

  it('el enlace que acaba de salir queda vigente para la propia guarda', () => {
    const now = new Date('2026-09-17T10:00:00.000Z')
    expect(isSurveyStillValid(now.toISOString(), csatExpiresAt(now), now)).toBe(true)
  })
})
