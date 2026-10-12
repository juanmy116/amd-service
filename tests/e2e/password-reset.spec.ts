import { test, expect } from '@playwright/test'
import { adminClient } from '../rls/helpers'
import { E2E } from './fixtures'
import { loginAs } from './auth'

// «Mot de passe oublié» de punta a punta: pedir el correo, leerlo en el buzón de pruebas del
// Supabase local (Mailpit, puerto 54324), abrir el enlace y fijar una contraseña nueva.
const MAILPIT = 'http://127.0.0.1:54324/api/v1'
const NEW_PASSWORD = 'Nouveau-mdp-e2e-2026'

async function clearMailbox() {
  await fetch(`${MAILPIT}/messages`, { method: 'DELETE' })
}

// Espera el correo de recuperación de `email` y devuelve el enlace del botón.
async function waitForResetLink(email: string): Promise<string> {
  for (let i = 0; i < 30; i++) {
    const res = await fetch(`${MAILPIT}/search?query=${encodeURIComponent(`to:${email}`)}`)
    const { messages } = (await res.json()) as { messages: { ID: string }[] }
    if (messages?.length) {
      const msg = (await (await fetch(`${MAILPIT}/message/${messages[0]!.ID}`)).json()) as { HTML: string }
      const href = msg.HTML.match(/href="([^"]*nouveau-mot-de-passe[^"]*)"/)?.[1]
      if (href) return href.replaceAll('&amp;', '&')
    }
    await new Promise(r => setTimeout(r, 500))
  }
  throw new Error(`No llegó el correo de recuperación a ${email}`)
}

// Vuelve a dejar la contraseña de la suite y vacía el cupo del limitador para esta cuenta.
async function restoreTechPassword() {
  const admin = adminClient()
  const { data } = await admin.auth.admin.listUsers()
  const tech = data.users.find(u => u.email === E2E.techEmail)
  if (tech) await admin.auth.admin.updateUserById(tech.id, { password: E2E.password })
  await admin.from('rate_limit_hits').delete().eq('bucket', 'password_reset').like('identifier', `%:${E2E.techEmail}`)
  // El tope por IP sola (10/h) lo llenarían varias pasadas seguidas de la suite. Base local siempre
  // (local-only.ts), así que vaciarlo entero no toca a nadie.
  await admin.from('rate_limit_hits').delete().eq('bucket', 'password_reset_ip')
}

test.describe('Mot de passe oublié', () => {
  test.beforeEach(async () => {
    await restoreTechPassword()
    await clearMailbox()
  })
  test.afterAll(restoreTechPassword)

  test('el enlace del login lleva a pedir el correo, y el correo a fijar la contraseña nueva', async ({ page }) => {
    await page.goto('/login')
    await page.getByRole('link', { name: 'Mot de passe oublié ?' }).click()
    await expect(page).toHaveURL(/\/mot-de-passe-oublie/)

    await page.fill('input[name="email"]', E2E.techEmail)
    await page.getByRole('button', { name: 'Recevoir le lien' }).click()
    await expect(page.getByText('Vérifiez votre boîte email.')).toBeVisible()

    // El enlace apunta al site_url del Supabase local; se abre en la app de los tests.
    const link = new URL(await waitForResetLink(E2E.techEmail))
    await page.goto(link.pathname + link.search)

    await page.fill('input[name="password"]', NEW_PASSWORD)
    await page.fill('input[name="confirm"]', NEW_PASSWORD)
    await page.getByRole('button', { name: 'Enregistrer' }).click()

    await page.waitForURL(/\/login\?message=mot-de-passe-modifie/)
    await expect(page.getByText('Mot de passe modifié.')).toBeVisible()

    // Entra con la contraseña nueva…
    await page.fill('input[name="email"]', E2E.techEmail)
    await page.fill('input[name="password"]', NEW_PASSWORD)
    await page.locator('button[type="submit"]:has-text("Connexion")').click()
    await page.waitForURL('**/tech**', { timeout: 30_000 })

    // …y el mismo enlace ya no sirve una segunda vez.
    await page.context().clearCookies()
    await page.goto(link.pathname + link.search)
    await page.fill('input[name="password"]', 'Otra-mdp-e2e-2026')
    await page.fill('input[name="confirm"]', 'Otra-mdp-e2e-2026')
    await page.getByRole('button', { name: 'Enregistrer' }).click()
    await expect(page.getByText('Ce lien a expiré ou a déjà été utilisé.', { exact: false })).toBeVisible()
  })

  test('sin token, la página no enseña el formulario', async ({ page }) => {
    await page.goto('/nouveau-mot-de-passe')
    await expect(page.getByText("Ce lien n'est pas valide.", { exact: false })).toBeVisible()
    await expect(page.locator('input[name="password"]')).toHaveCount(0)
  })

  test('la contraseña antigua deja de funcionar tras el cambio (y no se gasta el enlace por una confirmación mal escrita)', async ({ page }) => {
    await page.goto('/mot-de-passe-oublie')
    await page.fill('input[name="email"]', E2E.techEmail)
    await page.getByRole('button', { name: 'Recevoir le lien' }).click()
    const link = new URL(await waitForResetLink(E2E.techEmail))
    await page.goto(link.pathname + link.search)

    // Confirmación distinta: error, y el enlace sigue sirviendo.
    await page.fill('input[name="password"]', NEW_PASSWORD)
    await page.fill('input[name="confirm"]', NEW_PASSWORD + 'x')
    await page.getByRole('button', { name: 'Enregistrer' }).click()
    await expect(page.getByText('Les mots de passe ne correspondent pas.')).toBeVisible()

    await page.fill('input[name="password"]', NEW_PASSWORD)
    await page.fill('input[name="confirm"]', NEW_PASSWORD)
    await page.getByRole('button', { name: 'Enregistrer' }).click()
    await page.waitForURL(/\/login\?message=mot-de-passe-modifie/)

    await page.fill('input[name="email"]', E2E.techEmail)
    await page.fill('input[name="password"]', E2E.password)
    await page.locator('button[type="submit"]:has-text("Connexion")').click()
    await expect(page.getByText('Email ou mot de passe incorrect.')).toBeVisible()
  })

  test('el resto de la suite sigue entrando con la contraseña de siempre', async ({ page }) => {
    await loginAs(page, E2E.techEmail)
    await expect(page).toHaveURL(/\/tech/)
  })
})
