import { describe, it, expect } from 'vitest'
import {
  validateCounterUpload,
  extensionForType,
  sha256Hex,
  MAX_UPLOAD_BYTES,
} from './counterUpload'

describe('validateCounterUpload', () => {
  it('acepta los tipos admitidos (imágenes + PDF)', () => {
    for (const type of ['image/jpeg', 'image/png', 'image/webp', 'application/pdf']) {
      expect(validateCounterUpload({ type, size: 1024 })).toEqual({ ok: true })
    }
  })

  it('rechaza un tipo no admitido', () => {
    expect(validateCounterUpload({ type: 'image/gif', size: 1024 })).toEqual({ ok: false, error: 'type' })
    expect(validateCounterUpload({ type: 'text/plain', size: 1024 })).toEqual({ ok: false, error: 'type' })
  })

  it('rechaza un archivo vacío', () => {
    expect(validateCounterUpload({ type: 'image/jpeg', size: 0 })).toEqual({ ok: false, error: 'empty' })
  })

  it('rechaza un archivo que supera el tope de 10MB', () => {
    expect(validateCounterUpload({ type: 'image/jpeg', size: MAX_UPLOAD_BYTES + 1 })).toEqual({ ok: false, error: 'too_large' })
  })

  it('acepta un archivo justo en el tope', () => {
    expect(validateCounterUpload({ type: 'image/jpeg', size: MAX_UPLOAD_BYTES })).toEqual({ ok: true })
  })
})

describe('extensionForType', () => {
  it('mapea PDF e imágenes', () => {
    expect(extensionForType('application/pdf')).toBe('pdf')
    expect(extensionForType('image/jpeg')).toBe('jpeg')
    expect(extensionForType('image/png')).toBe('png')
    expect(extensionForType('image/webp')).toBe('webp')
  })
})

describe('sha256Hex', () => {
  it('produce el hash conocido de la cadena vacía', async () => {
    expect(await sha256Hex(new Uint8Array(0)))
      .toBe('e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855')
  })

  it('es determinista para los mismos bytes (clave de la dedup email↔upload)', async () => {
    const bytes = new TextEncoder().encode('compteur')
    expect(await sha256Hex(bytes)).toBe(await sha256Hex(bytes))
  })
})
