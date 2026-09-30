import { describe, expect, it } from 'vitest'
import { isPlainName, renderTemplate, safeHttpUrl } from './email-templates'

const csat = (over: Record<string, string> = {}) =>
  renderTemplate('csat', {
    title: 'Bourrage papier',
    csat_url: 'https://amd-service.vercel.app/csat/abc123',
    reference: 'SAV-2026-0042',
    client_name: 'Awa Ndiaye',
    equipement: 'Ricoh MP 2014 · E123456',
    ...over,
  })

describe('renderTemplate csat (F9)', () => {
  it('caso normal: saludo, referencia, equipo y botón de la encuesta', () => {
    const { subject, html } = csat()
    expect(subject).toBe('Votre avis sur notre intervention — SAV-2026-0042')
    expect(html).toContain('<p>Bonjour Awa Ndiaye,</p>')
    expect(html).toContain('SAV-2026-0042')
    expect(html).toContain('Ricoh MP 2014 · E123456')
    expect(html).toContain('href="https://amd-service.vercel.app/csat/abc123"')
  })

  it('una etiqueta sin cerrar en el nombre no abre un enlace (el ataque del informe)', () => {
    const { html } = csat({ client_name: '<a href=https://evil.tld/csat' })
    expect(html).not.toContain('<a href=https://evil.tld')
    expect(html).not.toContain('evil.tld')
  })

  it('un nombre con HTML se queda sin saludo y la etiqueta no llega al correo', () => {
    const { html } = csat({ client_name: 'Awa <b>Ndiaye</b>' })
    expect(html).not.toContain('Bonjour')
    expect(html).not.toContain('<b>')
  })

  it('un nombre que es una dirección web se queda sin saludo', () => {
    for (const name of [
      'https://evil.tld/avis-amd', 'www.evil-amd.com', 'amd-avis.com/csat', 'contact@evil.sn', '185.10.2.3',
      // TLD fuera de cualquier lista, IDN, puntos Unicode y subdominios (revisión del PR #171)
      'amd-service.support/avis', 'amd-sav.ai/csat', 'amd-senegal.africa', 'amd.tv/avis',
      'amdé.com/avis', 'evil．com', 'evil。com', 'a.evil.com', 'x.com/evil',
    ]) {
      const { html } = csat({ client_name: name })
      expect(html, name).not.toContain('Bonjour')
      expect(html, name).not.toContain(name)
    }
  })

  it('los nombres normales conservan el saludo', () => {
    for (const name of [
      'Mamadou Diop (DAF)', 'Diop & Fils', 'Awa / Accueil', 'Bureau 2 - Fatou', 'M.Diop', "Aïssatou N'Diaye",
      'A.Ly', 'M. De Souza', 'Diop Jr.', 'Fatou Ly, Accueil', 'Ndèye Fatou Sow', 'Awa Diop 2',
    ]) {
      expect(csat({ client_name: name }).html, name).toContain('<p>Bonjour ')
    }
    expect(csat({ client_name: 'Diop & Fils' }).html).toContain('Bonjour Diop &amp; Fils,')
  })

  it('sin nombre no hay saludo', () => {
    expect(csat({ client_name: '' }).html).not.toContain('Bonjour')
  })

  it('se escapan también la referencia y el equipo', () => {
    const { html } = csat({ equipement: '<img src=x>' })
    expect(html).toContain('&lt;img src=x&gt;')
    expect(html).not.toContain('<img')
  })

  it('sin un enlace http(s) válido la encuesta no se genera', () => {
    expect(() => csat({ csat_url: 'javascript:alert(1)' })).toThrow()
    expect(() => csat({ csat_url: '' })).toThrow()
  })
})

describe('otras plantillas', () => {
  it('ticket_open escapa el título y omite un portal_url que no sea http(s)', () => {
    const { subject, html } = renderTemplate('ticket_open', {
      title: 'Écran <noir>', incident_id: '42', priority: 'haute', portal_url: 'javascript:alert(1)',
    })
    expect(subject).toBe('Demande enregistrée : Écran <noir>')
    expect(html).toContain('Objet : Écran &lt;noir&gt;')
    expect(html).not.toContain('Suivre mon dossier')
  })

  it('raw deja pasar el HTML tal cual (lo construye quien llama)', () => {
    expect(renderTemplate('raw', { subject: 'S', html: '<b>x</b>' }).html).toBe('<b>x</b>')
  })
})

describe('safeHttpUrl', () => {
  it('acepta http(s) y rechaza el resto', () => {
    expect(safeHttpUrl('https://a.b/c')).toBe('https://a.b/c')
    expect(safeHttpUrl('http://localhost:3000/csat/x')).toBe('http://localhost:3000/csat/x')
    expect(safeHttpUrl('data:text/html,x')).toBe('')
    expect(safeHttpUrl('no es una url')).toBe('')
    expect(safeHttpUrl(undefined)).toBe('')
  })
})

describe('isPlainName', () => {
  it('iniciales y abreviaturas al final de palabra valen; dominios no', () => {
    expect(isPlainName('M.Diop')).toBe(true)
    expect(isPlainName('A.Ly')).toBe(true)
    expect(isPlainName('Diop Jr.')).toBe(true)
    expect(isPlainName('Evil.COM')).toBe(false)
    expect(isPlainName('amd.tv')).toBe(false)
    expect(isPlainName('Awa/Accueil')).toBe(false)
  })
})

describe('valores que no son texto', () => {
  it('un número en data no rompe la plantilla', () => {
    const data = { total: 3, greens: 1, attention: 2, url: 'https://amd-service.vercel.app/admin/contadores/pendientes' }
    const { html } = renderTemplate('counter_batch_processed', data as unknown as Record<string, string>)
    expect(html).toContain('<strong>3</strong>')
  })

  it('counter_batch_processed sin URL absoluta omite el enlace en vez de dejarlo vacío', () => {
    const { html } = renderTemplate('counter_batch_processed', { total: '3', url: '/admin/contadores/pendientes' })
    expect(html).not.toContain('href=""')
    expect(html).not.toContain('Voir la file')
  })
})
