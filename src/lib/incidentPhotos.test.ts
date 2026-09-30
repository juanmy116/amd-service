import { describe, it, expect } from 'vitest'
import { isIncidentPhotoPath, isIncidentPhotoPathFor } from './incidentPhotos'

const UID = '0f8b2c1e-3d4a-4b5c-8d9e-0a1b2c3d4e5f'
const OTHER = '9f1e2d3c-4b5a-4687-8c9d-0e1f2a3b4c5d'
const HASH = 'a'.repeat(64)

describe('isIncidentPhotoPath', () => {
  it('acepta las rutas que genera el servidor (portal, QR y las del primer día)', () => {
    for (const path of [
      `incidents/${UID}/2026/06/${HASH}.jpeg`,
      `incidents/public/${UID}/2026/06/${HASH}.png`,
      `incidents/2026/06/${HASH}.webp`,
      `incidents/public/2026/06/${HASH}.jpeg`,
    ]) {
      expect(isIncidentPhotoPath(path)).toBe(true)
    }
  })

  it('rechaza path traversal y caracteres que alteran la URL de firma', () => {
    for (const path of [
      `incidents/${UID}/../../object/sign/counter-images/x.jpeg`,
      `incidents/${UID}/2026/06/../${HASH}.jpeg`,
      `incidents/${UID}/2026/06/${HASH}.jpeg?x=1`,
      `incidents/${UID}/2026/06/${HASH}.jpeg#x`,
      `incidents/${UID}/2026/06/%2e%2e/${HASH}.jpeg`,
      `/incidents/${UID}/2026/06/${HASH}.jpeg`,
      `incidents/${UID}/../../../../../bucket/incident-photos/empty`,
      `incidents\\..\\${HASH}.jpeg`,
    ]) {
      expect(isIncidentPhotoPath(path)).toBe(false)
    }
  })

  it('rechaza rutas fuera del patrón', () => {
    for (const path of [
      '',
      `counter-images/${HASH}.jpeg`,
      `incidents/${UID}/2026/06/${HASH}.gif`,
      `incidents/${UID}/2026/06/test-photo.jpeg`,
      `incidents/${UID}/2026/06/${HASH}.jpeg\n`,
    ]) {
      expect(isIncidentPhotoPath(path)).toBe(false)
    }
  })
})

describe('isIncidentPhotoPathFor', () => {
  it('acepta la ruta exacta que genera createIncidentPhotoUploadUrl para el prefijo', () => {
    expect(isIncidentPhotoPathFor(UID, `incidents/${UID}/2026/09/${HASH}.jpeg`)).toBe(true)
  })

  it('rechaza traversal bajo el propio prefijo, rutas de otro usuario y formas no generadas', () => {
    for (const path of [
      `incidents/${UID}/../../../../../bucket/incident-photos/empty`,
      `incidents/${UID}/2026/09/../../${HASH}.jpeg`,
      `incidents/${OTHER}/2026/09/${HASH}.jpeg`,
      `incidents/${UID}/${HASH}.jpeg`,
      `incidents/${UID}/2026/09/${HASH}.gif`,
      `incidents/${UID}/2026/09/${HASH.toUpperCase()}.jpeg`,
    ]) {
      expect(isIncidentPhotoPathFor(UID, path)).toBe(false)
    }
  })
})
