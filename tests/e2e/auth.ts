import { type Page } from '@playwright/test'
import { adminClient } from '../rls/helpers'
import { E2E } from './fixtures'

// El limitador de login (5 intentos / 15 min por `ip:email`, src/lib/rate-limit.ts) también
// actúa en el Supabase de la suite, y la suite entra con el mismo técnico más de 5 veces: desde
// la sexta, «Trop de tentatives» y el login no sale de /login. Se vacía el cupo de ESE email de
// prueba antes de cada login. El limitador en sí lo prueban los tests RLS (rate-limit.test.ts).
async function resetLoginRateLimit(email: string) {
  // Solo cuentas de prueba: nunca tocar el cupo de un usuario real.
  if (!email.endsWith('@e2e.test')) throw new Error(`resetLoginRateLimit: ${email} no es de prueba`)
  const { error } = await adminClient()
    .from('rate_limit_hits')
    .delete()
    .eq('bucket', 'login')
    .like('identifier', `%:${email}`)
  if (error) throw new Error(`resetLoginRateLimit: ${error.message}`)
}

// Inicia sesión con email/password (form de src/app/login/login-form.tsx). El
// dashboard redirige por rol (admin→/admin, technician→/tech, client→/portal).
// Helper compartido por los specs — NO es un spec (Playwright prohíbe que un
// spec importe a otro).
export async function loginAs(page: Page, email: string) {
  await resetLoginRateLimit(email)
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
