import { describe, expect, it } from 'vitest'
import { isAllowedPushEndpoint, parseSubscription, sameKey, urlBase64ToUint8Array } from './push'

describe('urlBase64ToUint8Array', () => {
  it('decodifica base64url sin relleno', () => {
    expect(urlBase64ToUint8Array('AQID')).toEqual(new Uint8Array([1, 2, 3]))
  })

  it('acepta `-` y `_` (alfabeto base64url)', () => {
    // '-_-_' equivale a '+/+/' en base64 estándar.
    expect(urlBase64ToUint8Array('-_-_')).toEqual(new Uint8Array([251, 255, 191]))
  })

  it('rellena correctamente un caso real de padding (2 caracteres)', () => {
    expect(urlBase64ToUint8Array('AQ')).toEqual(new Uint8Array([1]))
  })
})

describe('sameKey', () => {
  const key = new Uint8Array([1, 2, 3, 4])

  it('true si el ArrayBuffer tiene los mismos bytes', () => {
    expect(sameKey(new Uint8Array([1, 2, 3, 4]).buffer, key)).toBe(true)
  })

  it('false si algún byte difiere', () => {
    expect(sameKey(new Uint8Array([1, 2, 3, 5]).buffer, key)).toBe(false)
  })

  it('false si la longitud difiere', () => {
    expect(sameKey(new Uint8Array([1, 2, 3]).buffer, key)).toBe(false)
    expect(sameKey(new Uint8Array([1, 2, 3, 4, 5]).buffer, key)).toBe(false)
  })

  it('false si el existente es null (no hay suscripción previa)', () => {
    expect(sameKey(null, key)).toBe(false)
  })
})

describe('parseSubscription', () => {
  const valid = {
    endpoint: 'https://fcm.googleapis.com/fcm/send/abc123',
    keys: { p256dh: 'p256dh-key', auth: 'auth-key' },
  }

  it('acepta una suscripción válida', () => {
    expect(parseSubscription(valid)).toEqual({
      endpoint: valid.endpoint,
      p256dh: 'p256dh-key',
      auth: 'auth-key',
    })
  })

  it('rechaza null/undefined/no-objeto', () => {
    expect(parseSubscription(null)).toBeNull()
    expect(parseSubscription(undefined)).toBeNull()
    expect(parseSubscription('string')).toBeNull()
  })

  it('rechaza si falta endpoint', () => {
    expect(parseSubscription({ keys: valid.keys })).toBeNull()
  })

  it('rechaza si el endpoint no es https', () => {
    expect(parseSubscription({ ...valid, endpoint: 'http://fcm.googleapis.com/x' })).toBeNull()
  })

  it('acepta los hosts reales de los servicios push (Apple, Google)', () => {
    expect(parseSubscription({ ...valid, endpoint: 'https://web.push.apple.com/abc' })).not.toBeNull()
    expect(parseSubscription({ ...valid, endpoint: 'https://fcm.googleapis.com/fcm/send/abc' })).not.toBeNull()
  })

  it('rechaza un host fuera de la lista (SSRF: send-push hace POST directo al endpoint)', () => {
    expect(parseSubscription({ ...valid, endpoint: 'https://evil.example.com/x' })).toBeNull()
  })

  it('rechaza un host disfrazado con el dominio real como subdominio falso', () => {
    expect(parseSubscription({ ...valid, endpoint: 'https://web.push.apple.com.evil.com/x' })).toBeNull()
  })

  it('rechaza si faltan las keys', () => {
    expect(parseSubscription({ endpoint: valid.endpoint, keys: {} })).toBeNull()
    expect(parseSubscription({ endpoint: valid.endpoint, keys: { p256dh: 'x' } })).toBeNull()
    expect(parseSubscription({ endpoint: valid.endpoint, keys: { auth: 'x' } })).toBeNull()
  })

  it('rechaza un endpoint demasiado largo (> 2048)', () => {
    const long = 'https://example.com/' + 'a'.repeat(2048)
    expect(parseSubscription({ ...valid, endpoint: long })).toBeNull()
  })

  it('rechaza una key demasiado larga (> 512)', () => {
    expect(parseSubscription({ ...valid, keys: { p256dh: 'a'.repeat(513), auth: 'auth-key' } })).toBeNull()
    expect(parseSubscription({ ...valid, keys: { p256dh: 'p256dh-key', auth: 'a'.repeat(513) } })).toBeNull()
  })
})

describe('isAllowedPushEndpoint', () => {
  it('acepta los endpoints https de los servicios push reales', () => {
    expect(isAllowedPushEndpoint('https://web.push.apple.com/abc')).toBe(true)
    expect(isAllowedPushEndpoint('https://fcm.googleapis.com/fcm/send/abc')).toBe(true)
    expect(isAllowedPushEndpoint('https://updates.push.services.mozilla.com/wpush/v2/x')).toBe(true)
  })

  it('rechaza otros hosts, http, URLs rotas y no-strings', () => {
    expect(isAllowedPushEndpoint('https://evil.example.com/x')).toBe(false)
    expect(isAllowedPushEndpoint('https://web.push.apple.com.evil.com/x')).toBe(false)
    expect(isAllowedPushEndpoint('http://fcm.googleapis.com/x')).toBe(false)
    expect(isAllowedPushEndpoint('no es una url')).toBe(false)
    expect(isAllowedPushEndpoint('')).toBe(false)
    expect(isAllowedPushEndpoint(null)).toBe(false)
    expect(isAllowedPushEndpoint(42)).toBe(false)
  })

  it('rechaza un endpoint demasiado largo (> 2048)', () => {
    expect(isAllowedPushEndpoint('https://fcm.googleapis.com/' + 'a'.repeat(2048))).toBe(false)
  })
})
