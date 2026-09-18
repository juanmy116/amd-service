import { describe, it, expect } from 'vitest'
import { buildResolution, clearResolution, MIN_NOTE_LENGTH, reopens } from './resolution'

describe('buildResolution — vía intervention (el técnico)', () => {
  it('rechaza resolver sin informe', () => {
    const r = buildResolution({ via: 'intervention', rapport: null })
    expect(r.ok).toBe(false)
    expect(r.ok === false && r.error).toMatch(/rapport/i)
  })

  it('rechaza un informe de solo espacios', () => {
    expect(buildResolution({ via: 'intervention', rapport: '   \n  ' }).ok).toBe(false)
  })

  it('acepta un informe y lo guarda recortado en las dos columnas', () => {
    const r = buildResolution({ via: 'intervention', rapport: '  Remplacé le tambour  ' })
    expect(r).toEqual({
      ok: true,
      fields: {
        resolved_via: 'intervention',
        resolution_reason: null,
        resolution_note: 'Remplacé le tambour',
        rapport_intervention: 'Remplacé le tambour',
      },
    })
  })

  it('nunca pone motivo: es exclusivo de la vía bureau (lo exige un CHECK en la BD)', () => {
    const r = buildResolution({ via: 'intervention', rapport: 'Nettoyage complet' })
    expect(r.ok === true && r.fields.resolution_reason).toBeNull()
  })
})

describe('buildResolution — vía bureau (el tablero)', () => {
  it('rechaza resolver sin motivo', () => {
    const r = buildResolution({ via: 'bureau', reason: null, note: 'Alerte Princity erronée' })
    expect(r.ok).toBe(false)
    expect(r.ok === false && r.error).toMatch(/motif/i)
  })

  it('rechaza resolver sin explicación', () => {
    const r = buildResolution({ via: 'bureau', reason: 'fausse_alerte', note: '  ' })
    expect(r.ok).toBe(false)
    expect(r.ok === false && r.error).toMatch(/explication/i)
  })

  it('«ok» no cuela', () => {
    const r = buildResolution({ via: 'bureau', reason: 'fausse_alerte', note: 'ok' })
    expect(r.ok).toBe(false)
    expect(r.ok === false && r.error).toContain(String(MIN_NOTE_LENGTH))
  })

  it('acepta motivo + explicación', () => {
    const r = buildResolution({
      via: 'bureau',
      reason: 'telephone',
      note: 'Résolu au téléphone avec le client',
    })
    expect(r).toEqual({
      ok: true,
      fields: {
        resolved_via: 'bureau',
        resolution_reason: 'telephone',
        resolution_note: 'Résolu au téléphone avec le client',
      },
    })
  })

  it('acredita al técnico que intervino sin registrarlo', () => {
    const r = buildResolution({
      via: 'bureau',
      reason: 'technicien_non_enregistre',
      note: 'Amar est passé lundi sans le saisir',
      technicianId: 'tech-uuid',
    })
    expect(r.ok === true && r.fields.assigned_to).toBe('tech-uuid')
  })

  it('sin técnico indicado no toca assigned_to: nadie se lleva un mérito que no es suyo', () => {
    const r = buildResolution({
      via: 'bureau',
      reason: 'doublon',
      note: 'Doublon de SAV-2026-0041',
      technicianId: null,
    })
    expect(r.ok === true && 'assigned_to' in r.fields).toBe(false)
  })
})

describe('reopens', () => {
  it('volver a circulación desde résolu o fermé reabre', () => {
    expect(reopens('résolu', 'en_cours')).toBe(true)
    expect(reopens('fermé', 'en_cours')).toBe(true)
    expect(reopens('fermé', 'assigné')).toBe(true)
  })

  it('cerrar NO es reabrir: el rastro es el archivo de lo que pasó', () => {
    expect(reopens('résolu', 'fermé')).toBe(false)
  })

  it('guardar una avería que ya estaba en curso no borra el escaneo que se acaba de hacer', () => {
    expect(reopens('en_cours', 'en_cours')).toBe(false)
    expect(reopens('assigné', 'en_cours')).toBe(false)
  })
})

describe('clearResolution — al reabrir una avería', () => {
  it('borra el rastro para que la segunda resolución no herede el de la primera', () => {
    expect(clearResolution()).toEqual({
      resolved_via: null,
      resolution_reason: null,
      resolution_note: null,
      qr_verified: false,
      qr_scanned_by: null,
    })
  })
})
