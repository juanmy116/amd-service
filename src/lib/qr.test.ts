import { describe, it, expect } from 'vitest'
import { extractSerie } from '@/lib/qr'

// extractSerie alimenta la navegación del escáner QR del técnico. Un bug aquí
// (parseo incorrecto del QR) mandaba al técnico a una ficha inexistente.
describe('extractSerie', () => {
  it('URL completa del gateway → última parte de la ruta', () => {
    expect(extractSerie('https://amd-service.vercel.app/m/CN88THY0CK')).toBe('CN88THY0CK')
  })

  it('URL completa con query/hash → ignora lo que sobra', () => {
    expect(extractSerie('https://amd-service.vercel.app/m/CN88THY0CK?utm=qr#x')).toBe('CN88THY0CK')
  })

  it('ruta relativa /m/<serie>', () => {
    expect(extractSerie('/m/ABC123')).toBe('ABC123')
  })

  it('ruta antigua /maquina/<serie>', () => {
    expect(extractSerie('/maquina/ABC123')).toBe('ABC123')
  })

  it('ruta antigua /tech/scan/<serie>', () => {
    expect(extractSerie('/tech/scan/ABC123')).toBe('ABC123')
  })

  it('nº de serie suelto → él mismo', () => {
    expect(extractSerie('ABC123')).toBe('ABC123')
  })

  it('nº de serie con espacios alrededor → recortado', () => {
    expect(extractSerie('  ABC123  ')).toBe('ABC123')
  })

  it('serie URL-encoded → decodificada', () => {
    expect(extractSerie('https://amd-service.vercel.app/m/CN%2088')).toBe('CN 88')
  })

  it('ruta relativa con serie URL-encoded → decodificada', () => {
    expect(extractSerie('/tech/scan/CN%2088')).toBe('CN 88')
  })
})
