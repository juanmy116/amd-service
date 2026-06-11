import { test, expect } from '@playwright/test'
import { E2E } from './fixtures'
import { loginAs } from './auth'

test.describe('Login — redirección por rol', () => {
  test('admin aterriza en /admin', async ({ page }) => {
    await loginAs(page, E2E.adminEmail)
    await page.waitForURL('**/admin/**', { timeout: 30_000 }).catch(() => {})
    await expect(page).toHaveURL(/\/admin/)
  })

  test('técnico aterriza en /tech', async ({ page }) => {
    await loginAs(page, E2E.techEmail)
    await page.waitForURL('**/tech**', { timeout: 30_000 }).catch(() => {})
    await expect(page).toHaveURL(/\/tech/)
  })

  test('cliente aterriza en /portal', async ({ page }) => {
    await loginAs(page, E2E.clientEmail)
    await page.waitForURL('**/portal**', { timeout: 30_000 }).catch(() => {})
    await expect(page).toHaveURL(/\/portal/)
  })
})
