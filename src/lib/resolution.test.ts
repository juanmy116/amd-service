import { describe, it, expect } from 'vitest'
import {
  archivedReportNote,
  buildResolution,
  clearResolution,
  finalResolutionStatus,
  historyComment,
  MIN_NOTE_LENGTH,
  OFFICE_RESOLUTION_STATUS,
  reopens,
  requiresOfficeResolution,
  sendsSurvey,
} from './resolution'

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
      // El informe también: el formulario del técnico lo rellena con lo que ya hubiera, así que
      // una avería reabierta en mayo se cerraba con el informe de marzo sin escribir una línea.
      rapport_intervention: null,
      qr_verified: false,
      qr_scanned_by: null,
    })
  })
})

describe('requiresOfficeResolution', () => {
  it('resolver desde el tablero pide explicación', () => {
    expect(requiresOfficeResolution('en_cours', 'résolu', null)).toBe(true)
  })

  it('archivar sin pasar por resuelto también: si no, «Fermé» sería el atajo barato', () => {
    expect(requiresOfficeResolution('nouveau', 'fermé', null)).toBe(true)
    expect(requiresOfficeResolution('en_cours', 'fermé', null)).toBe(true)
  })

  it('cerrar una resuelta es el final normal del camino, no pide nada', () => {
    expect(requiresOfficeResolution('résolu', 'fermé', null)).toBe(false)
  })

  it('no pisa el rastro existente: el informe de un técnico no se convierte en «oficina»', () => {
    expect(requiresOfficeResolution('fermé', 'résolu', 'intervention')).toBe(false)
    expect(requiresOfficeResolution('en_cours', 'résolu', 'bureau')).toBe(false)
  })

  it('reabrir no pide explicación (la pedirá la próxima resolución)', () => {
    expect(requiresOfficeResolution('résolu', 'en_cours', null)).toBe(false)
  })

  it('editar una resuelta sin rastro no es resolverla: corregir una errata no puede pedir motivo', () => {
    // Sin esto la ficha entraba en un callejón sin salida: el servidor exigía una explicación
    // y el formulario no dibujaba el campo donde escribirla.
    expect(requiresOfficeResolution('résolu', 'résolu', null)).toBe(false)
  })

  it('documentar una avería ya cerrada tampoco: no estaba abierta, no se está resolviendo', () => {
    expect(requiresOfficeResolution('fermé', 'résolu', null)).toBe(false)
    expect(requiresOfficeResolution('fermé', 'fermé', null)).toBe(false)
  })
})

describe('finalResolutionStatus — quién saca la avería de «résolu»', () => {
  it('una intervención se queda en résolu: la cerrará el envío de la encuesta', () => {
    expect(finalResolutionStatus('résolu', 'intervention')).toBe('résolu')
  })

  it('una de oficina se archiva: sin encuesta, nadie la sacaría de ahí nunca', () => {
    expect(finalResolutionStatus('résolu', 'bureau')).toBe(OFFICE_RESOLUTION_STATUS)
  })

  it('sin rastro tampoco se queda esperando una encuesta que no va a salir', () => {
    expect(finalResolutionStatus('résolu', null)).toBe(OFFICE_RESOLUTION_STATUS)
  })

  it('los demás estados pasan tal cual: esto solo decide qué significa «Résolu»', () => {
    expect(finalResolutionStatus('en_cours', null)).toBe('en_cours')
    expect(finalResolutionStatus('fermé', 'bureau')).toBe('fermé')
    expect(finalResolutionStatus('nouveau', 'intervention')).toBe('nouveau')
  })
})

describe('sendsSurvey — a quién se le pregunta qué tal fue', () => {
  it('una intervención de verdad sí pide opinión al cliente', () => {
    expect(sendsSurvey('intervention')).toBe(true)
  })

  it('una resolución de oficina no: nadie fue, no hay visita que puntuar', () => {
    expect(sendsSurvey('bureau')).toBe(false)
  })

  it('sin rastro (histórico, o una puerta que no marca) tampoco se molesta al cliente', () => {
    expect(sendsSurvey(null)).toBe(false)
    expect(sendsSurvey(undefined)).toBe(false)
  })

  it('lo que archiva la oficina no puede disparar la encuesta', () => {
    // Las dos mitades de la misma decisión: la oficina cierra en `fermé`, y quien manda la
    // encuesta solo mira `résolu`. Si alguien cambiara una, este test cae.
    expect(OFFICE_RESOLUTION_STATUS).not.toBe('résolu')
    expect(sendsSurvey('bureau')).toBe(false)
  })
})

describe('archivedReportNote — el informe anterior no se tira', () => {
  it('lo convierte en una línea de historial antes de borrarlo', () => {
    expect(archivedReportNote('Changement du tambour.'))
      .toBe('Rapport de la résolution précédente : Changement du tambour.')
  })

  it('sin informe anterior no inventa una línea', () => {
    expect(archivedReportNote(null)).toBeNull()
    expect(archivedReportNote('   ')).toBeNull()
    expect(archivedReportNote(undefined)).toBeNull()
  })
})

describe('historyComment — nada de lo que hay que contar se pierde', () => {
  it('junta el comentario escrito a mano con la nota de archivo', () => {
    expect(historyComment('Le client rappelle.', 'Rapport précédent : X'))
      .toBe('Le client rappelle.\n\nRapport précédent : X')
  })

  it('con una sola nota, no añade separadores', () => {
    expect(historyComment(null, 'Rapport précédent : X')).toBe('Rapport précédent : X')
    expect(historyComment('Le client rappelle.', null)).toBe('Le client rappelle.')
  })

  it('sin nada que contar, no inventa una línea', () => {
    expect(historyComment(null, undefined, '   ')).toBeNull()
  })
})
