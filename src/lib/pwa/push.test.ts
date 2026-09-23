import { describe, expect, it } from 'vitest'
import { parseSubscription, urlBase64ToUint8Array } from './push'

describe('urlBase64ToUint8Array', () => {
  it('decodifica base64url sin relleno', () => {
    expect(urlBase64ToUint8Array('AQID')).toEqual(new Uint8Array([1, 2, 3]))
  })

  it('acepta `-` y `_` (alfabeto base64url)', () => {
    // '+/+/' en base64 estándar equivale a '-_-_' en base64url.
    expect(urlBase64ToUint8Array('-_-_')).toEqual(urlBase64ToUint8Array('+/+/'.replace(/\+/g, '-').replace(/\//g, '_')))
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
