import { type Page } from '@playwright/test'
import { E2E } from './fixtures'

// Inicia sesión con email/password (form de src/app/login/login-form.tsx). El
// dashboard redirige por rol (admin→/admin, technician→/tech, client→/portal).
// Helper compartido por los specs — NO es un spec (Playwright prohíbe que un
// spec importe a otro).
export async function loginAs(page: Page, email: string) {
  await page.goto('/login')
  await page.fill('input[name="email"]', email)
  await page.fill('input[name="password"]', E2E.password)
  // Hay un tab "Connexion" (type=button) y un submit de Google: apuntamos al
  // submit cuyo texto es exactamente "Connexion".
  await page.locator('button[type="submit"]:has-text("Connexion")').click()
  // Esperar a que el login complete y el dashboard redirija (fuera de /login),
  // para que la cookie de sesión esté lista antes de navegar a rutas protegidas.
  await page.waitForURL((url) => !url.pathname.startsWith('/login'), { timeout: 30_000 })
}
