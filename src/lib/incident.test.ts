import { describe, it, expect } from 'vitest'
import { getIncidentDisplayName, TECH_INCIDENT_SELECT } from '@/lib/incident'

// El nombre a mostrar prioriza cliente > nº serie > título. Una incidencia interna
// tiene cliente; una pública (QR) solo machine_id; el título es el último recurso.
describe('getIncidentDisplayName', () => {
  it('incidencia interna con cliente → nombre del cliente', () => {
    expect(getIncidentDisplayName({
      clients: { nom_client: 'Axa Senegal' },
      machine_id: 'ABC123',
      title: 'Bourrage papier',
    })).toBe('Axa Senegal')
  })

  it('incidencia pública sin cliente → nº de serie', () => {
    expect(getIncidentDisplayName({
      clients: null,
      machine_id: 'ABC123',
      title: 'Bourrage papier',
    })).toBe('ABC123')
  })

  it('sin cliente ni nº de serie → título', () => {
    expect(getIncidentDisplayName({
      clients: null,
      machine_id: null,
      title: 'Bourrage papier',
    })).toBe('Bourrage papier')
  })
})

describe('TECH_INCIDENT_SELECT', () => {
  it('referencia la cadena contract_machines → contracts → clients (no columnas legacy)', () => {
    expect(TECH_INCIDENT_SELECT).toContain('contract_machines(contracts(clients(nom_client)))')
    expect(TECH_INCIDENT_SELECT).toContain('machine_id')
    // No debe volver a colarse el join legacy que vació la lista del técnico.
    expect(TECH_INCIDENT_SELECT).not.toContain('client_id')
  })
})
