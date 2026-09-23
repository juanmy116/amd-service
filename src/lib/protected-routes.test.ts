import { describe, expect, it } from 'vitest'
import { isProtectedPath } from './protected-routes'

describe('isProtectedPath', () => {
  it('protege las cuatro zonas privadas', () => {
    for (const p of ['/admin', '/portal/x', '/tech', '/tech/incidents/1', '/atelier']) {
      expect(isProtectedPath(p)).toBe(true)
    }
  })

  it('deja públicos los ficheros de la PWA (iOS los pide sin cookies)', () => {
    expect(isProtectedPath('/amd-sav.webmanifest')).toBe(false)
    expect(isProtectedPath('/sw.js')).toBe(false)
  })

  it('documenta la trampa: cualquier ruta que EMPIECE por /tech queda protegida', () => {
    expect(isProtectedPath('/tech.webmanifest')).toBe(true)
  })
})
