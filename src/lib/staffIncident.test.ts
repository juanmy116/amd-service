import { describe, it, expect } from 'vitest'
import { cleanStaffDescription, staffIncidentTitle, validateStaffIncident } from './staffIncident'

const machine = { marque: 'Canon', modele: 'iR-ADV C3530', numero_serie: 'XYZ123' }

describe('staffIncidentTitle', () => {
  it('panne: tipo, máquina y serie', () => {
    expect(staffIncidentTitle('panne', machine, null)).toBe('Panne — Canon iR-ADV C3530 (XYZ123)')
  })

  it('recogida: el motivo va en el título (no tiene columna propia)', () => {
    expect(staffIncidentTitle('recuperation', machine, 'atelier'))
      .toBe("Récupération (Réparation à l'atelier) — Canon iR-ADV C3530 (XYZ123)")
    expect(staffIncidentTitle('recuperation', machine, 'fin_contrat'))
      .toBe('Récupération (Fin de contrat) — Canon iR-ADV C3530 (XYZ123)')
    expect(staffIncidentTitle('recuperation', machine, 'remplacement'))
      .toBe('Récupération (Remplacement) — Canon iR-ADV C3530 (XYZ123)')
  })
})

describe('validateStaffIncident', () => {
  it('la panne exige descripción', () => {
    expect(validateStaffIncident({ kind: 'panne', reason: null, description: '' })).toBe('Décrivez la panne.')
    expect(validateStaffIncident({ kind: 'panne', reason: null, description: 'Bourrage' })).toBeNull()
  })

  it('la recogida exige motivo y no descripción', () => {
    expect(validateStaffIncident({ kind: 'recuperation', reason: null, description: 'x' }))
      .toBe('Choisissez le motif de la récupération.')
    expect(validateStaffIncident({ kind: 'recuperation', reason: 'fin_contrat', description: '' })).toBeNull()
  })
})

describe('cleanStaffDescription', () => {
  it('recorta, quita caracteres de control y conserva los saltos de línea', () => {
    expect(cleanStaffDescription('  ligne 1\nligne 2\x07  ')).toBe('ligne 1\nligne 2')
  })

  it('topa a 1000 caracteres y tolera lo que no es texto', () => {
    expect(cleanStaffDescription('a'.repeat(5000))).toHaveLength(1000)
    expect(cleanStaffDescription(null)).toBe('')
  })
})
