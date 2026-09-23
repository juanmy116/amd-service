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

  it('no protege rutas que solo empiezan por un prefijo protegido (no son ese prefijo ni una subruta)', () => {
    for (const p of ['/tech.webmanifest', '/technologies', '/administration']) {
      expect(isProtectedPath(p)).toBe(false)
    }
  })
})
