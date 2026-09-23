import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { isProtectedPath } from '@/lib/protected-routes'
import { MANIFEST_PATH, techManifest } from './manifest'

describe('techManifest', () => {
  it('abre la app de técnicos a pantalla completa', () => {
    expect(techManifest.name).toBe('AMD SAV')
    expect(techManifest.short_name).toBe('AMD SAV')
    expect(techManifest.id).toBe('/tech')
    expect(techManifest.start_url).toBe('/tech')
    expect(techManifest.scope).toBe('/') // /login y /dashboard deben seguir dentro de la app
    expect(techManifest.display).toBe('standalone')
  })

  it('todos los iconos existen en public/', () => {
    for (const icon of techManifest.icons ?? []) {
      expect(existsSync(join(process.cwd(), 'public', icon.src))).toBe(true)
    }
  })

  it('incluye un icono maskable de 512', () => {
    expect(techManifest.icons).toContainEqual(expect.objectContaining({ sizes: '512x512', purpose: 'maskable' }))
  })

  it('se sirve fuera de las rutas protegidas', () => {
    expect(isProtectedPath(MANIFEST_PATH)).toBe(false)
  })
})
