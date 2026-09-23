import { test, expect } from '@playwright/test'
import { E2E } from './fixtures'
import { loginAs } from './auth'

// iOS descarga el manifest y el service worker SIN cookies: si el proxy los mandara a /login,
// «Añadir a pantalla de inicio» crearía un marcador de Safari en vez de la app.
test.describe('PWA técnicos — ficheros públicos', () => {
  test('el manifest responde sin sesión', async ({ request }) => {
    const res = await request.get('/amd-sav.webmanifest', { maxRedirects: 0 })
    expect(res.status()).toBe(200)
    expect(res.headers()['content-type']).toContain('application/manifest+json')
    const body = await res.json()
    expect(body.name).toBe('AMD SAV')
    expect(body.start_url).toBe('/tech')
  })

  test('el service worker responde sin sesión y sin caché', async ({ request }) => {
    const res = await request.get('/sw.js', { maxRedirects: 0 })
    expect(res.status()).toBe(200)
    expect(res.headers()['cache-control']).toContain('no-store')
  })

  test('los iconos responden sin sesión', async ({ request }) => {
    for (const path of ['/pwa/icon-192.png', '/pwa/icon-512.png', '/pwa/apple-touch-icon.png']) {
      const res = await request.get(path, { maxRedirects: 0 })
      expect(res.status(), path).toBe(200)
    }
  })
})

test.describe('PWA técnicos — etiquetas en el <head>', () => {
  test('/tech (con sesión de técnico) enlaza el manifest y los metadatos iOS', async ({ page }) => {
    await loginAs(page, E2E.techEmail)
    await page.waitForURL('**/tech**', { timeout: 30_000 }).catch(() => {})
    await expect(page).toHaveURL(/\/tech/)

    await expect(page.locator('link[rel="manifest"]')).toHaveAttribute('href', '/amd-sav.webmanifest')
    await expect(page.locator('link[rel="apple-touch-icon"]')).toHaveAttribute('href', /\/pwa\/apple-touch-icon\.png/)
    await expect(page.locator('meta[name="apple-mobile-web-app-title"]')).toHaveAttribute('content', 'AMD SAV')
    await expect(page.locator('meta[name="viewport"]')).toHaveAttribute('content', /viewport-fit=cover/)
  })

  test('la web pública no se ofrece como app instalable', async ({ page }) => {
    await page.goto('/')
    await expect(page.locator('link[rel="manifest"]')).toHaveCount(0)
  })
})
