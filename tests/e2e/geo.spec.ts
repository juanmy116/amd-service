import { test, expect } from '@playwright/test'
import { readFileSync } from 'node:fs'
import { adminClient } from '../rls/helpers'
import { E2E, type SeedIds } from './fixtures'
import { loginAs } from './auth'

// Geolocalización, Fase 3 (Task 10 del plan). Dos recorridos de la UI real; la geolocalización
// del navegador NO se prueba aquí (getPositionOnce depende de la API del navegador, cubierta por
// sus propios tests unitarios) — solo lo que hace el servidor con una posición ya conocida.
//
// Las comprobaciones se limitan a <main>: en escritorio ancho la agenda lateral del técnico
// también puede repetir nombres de máquina/cliente (mismo patrón que tech-scan.spec.ts).

test.describe('Geolocalización', () => {
  test('technicien : bouton Itinéraire vers la position de la machine', async ({ page }) => {
    const ids = JSON.parse(readFileSync('tests/e2e/.seed.json', 'utf8')) as SeedIds
    const admin = adminClient()

    // Indépendant de l'ordre des autres specs (ex. sav-workflow.spec.ts assigne la même
    // incidence via l'UI) : on s'assure ici, directement en base, qu'elle est bien assignée à
    // ce technicien — seule condition pour qu'il puisse ouvrir sa fiche (RLS/page guard).
    const { error } = await admin.from('incidents').update({ assigned_to: ids.techId }).eq('id', ids.incidentId)
    expect(error).toBeNull()

    await loginAs(page, E2E.techEmail)
    await page.goto(`/tech/incidents/${ids.incidentId}`)
    const main = page.getByRole('main')

    await main.getByRole('button', { name: 'Itinéraire' }).click()
    const googleLink = main.getByRole('menuitem', { name: 'Google Maps' })
    await expect(googleLink).toBeVisible()
    const href = await googleLink.getAttribute('href')
    expect(href).toContain(`destination=${E2E.serieLat},${E2E.serieLng}`)
  })

  test('admin : corriger puis effacer la position d\'une machine', async ({ page }) => {
    // Le dialogue de confirmation d'« Effacer la position » (window.confirm) doit être accepté
    // dès qu'il apparaît, sinon Playwright reste bloqué dessus.
    page.on('dialog', (d) => d.accept())

    await loginAs(page, E2E.adminEmail)
    await page.goto(`/admin/machines/${encodeURIComponent(E2E.serieAjena)}`)
    const main = page.getByRole('main')

    await expect(main.getByText('Position inconnue')).toBeVisible()

    // `main` contient aussi le formulaire de MachineForm, qui a son propre bouton
    // « Enregistrer » : on cible le formulaire de la carte Position par son texte.
    const positionForm = main.locator('form').filter({ hasText: 'Coller un lien Google Maps' })
    await positionForm.getByPlaceholder('14.6928, -17.4467').fill('14.7, -17.45')
    await positionForm.getByRole('button', { name: 'Enregistrer' }).click()
    await expect(main.getByText('Saisie manuelle')).toBeVisible()

    await main.getByRole('button', { name: 'Effacer la position' }).click()
    await expect(main.getByText('Position inconnue')).toBeVisible()
  })
})
