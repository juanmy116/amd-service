import { describe, it, expect } from 'vitest'
import { validateContactEmail } from './publicIncident'

describe('validateContactEmail', () => {
  it('acepta un email normal', () => {
    expect(validateContactEmail('fatou@2as.sn')).toBeNull()
  })

  it('exige el email: sin él no se puede enviar la encuesta', () => {
    expect(validateContactEmail('')).toBe("L'adresse email est obligatoire.")
    expect(validateContactEmail('   ')).toBe("L'adresse email est obligatoire.")
  })

  it('rechaza un email mal formado', () => {
    expect(validateContactEmail('fatou')).toBe("L'adresse email n'est pas valide.")
    expect(validateContactEmail('fatou@')).toBe("L'adresse email n'est pas valide.")
    expect(validateContactEmail('fatou@2as')).toBe("L'adresse email n'est pas valide.")
    expect(validateContactEmail('a b@2as.sn')).toBe("L'adresse email n'est pas valide.")
  })
})
