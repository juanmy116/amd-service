import { test, expect } from '@playwright/test'
import { E2E } from './fixtures'
import { loginAs } from './auth'

// Escaneo de máquinas ajenas y mantenimientos (Task 1-3 del plan 2026-09-23): un técnico
// puede ver la ficha de CUALQUIER máquina activa aunque no tenga ninguna avería asignada ahí,
// abrir la visita de mantenimiento que sí le corresponde, y un serie inexistente da un
// mensaje claro en vez de un 404.
test.describe('Escaneo — cualquier técnico ve cualquier máquina', () => {
  test.beforeEach(async ({ page }) => {
    await loginAs(page, E2E.techEmail)
  })

  // Las comprobaciones se limitan a <main>: en escritorio ancho la agenda lateral del técnico
  // también muestra cliente y máquina de sus visitas.
  test('máquina sin nada asignado al técnico: se ve la ficha, sin enlace a una visita ajena', async ({ page }) => {
    await page.goto(`/tech/scan/${encodeURIComponent(E2E.serieAjena)}`)
    const main = page.getByRole('main')
    await expect(main.getByText('Fiche machine')).toBeVisible()
    await expect(main.getByText(E2E.serieAjena)).toBeVisible()
    await expect(main.getByText(E2E.clientNombre)).toBeVisible()
    await expect(main.getByText('Maintenance planifiée')).toHaveCount(0)
  })

  test('máquina con solo un mantenimiento del técnico: se ve la ficha, no 404', async ({ page }) => {
    await page.goto(`/tech/scan/${encodeURIComponent(E2E.serieLibre)}`)
    const main = page.getByRole('main')
    await expect(main.getByText('Fiche machine')).toBeVisible()
    await expect(main.getByText(E2E.serieLibre)).toBeVisible()
    await expect(main.getByText(E2E.clientNombre)).toBeVisible()
  })

  test('la visita de mantenimiento asignada se ve y se abre', async ({ page }) => {
    await page.goto(`/tech/scan/${encodeURIComponent(E2E.serieLibre)}`)
    const main = page.getByRole('main')
    await expect(main.getByText('Maintenance planifiée')).toBeVisible()

    await main.getByText('Maintenance planifiée').click()
    await expect(page).toHaveURL(/\/tech\/scan\/.+\/maintenance\/.+/)
    await expect(main.getByText('TEST E2E')).toBeVisible()
    await expect(main.getByText(E2E.clientNombre)).toBeVisible()
  })

  test('serie inexistente: mensaje claro, no 404', async ({ page }) => {
    await page.goto('/tech/scan/NO-EXISTE-E2E')
    await expect(page.getByRole('main').getByText('Machine introuvable ou retirée du parc')).toBeVisible()
  })
})
