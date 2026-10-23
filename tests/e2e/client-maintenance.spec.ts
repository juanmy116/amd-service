import { test, expect } from '@playwright/test'
import { adminClient } from '../rls/helpers'
import { E2E } from './fixtures'
import { loginAs } from './auth'

// Ficha del cliente: sección «Maintenance» (plan de pulido 2026-10-23, punto 1).
// La siembra deja el caso que la sección tiene que señalar: el contrato tiene plan, pero la
// primera máquina (E2E.serie) no tiene ninguna visita; las otras dos tienen una el 15/01/2026,
// ya pasada, así que salen en retard (la «libre», asignada al técnico; la «ajena», sin asignar).

test('fiche client : maintenance par machine, avec les machines sans visite', async ({ page }) => {
  const { data: client } = await adminClient()
    .from('clients').select('id').eq('nom_client', E2E.clientNombre).single()
  expect(client).not.toBeNull()

  await loginAs(page, E2E.adminEmail)
  await page.goto(`/admin/clients/${client!.id}`)
  const main = page.getByRole('main')

  await expect(main.getByRole('heading', { name: 'Maintenance' })).toBeVisible()
  await expect(main.getByText('1 sans visite')).toBeVisible()
  await expect(main.getByText('2 en retard')).toBeVisible()

  const row = (serie: string) => main.getByRole('row').filter({ has: page.getByText(serie, { exact: true }) })
  await expect(row(E2E.serie)).toContainText('Aucune visite')
  await expect(row(E2E.serieLibre)).toContainText('15/01/2026')
  await expect(row(E2E.serieLibre)).toContainText('En retard')
  await expect(row(E2E.serieAjena)).toContainText('15/01/2026')
  await expect(row(E2E.serieAjena)).toContainText('Non assigné')
  await expect(row(E2E.serieLibre)).not.toContainText('Non assigné')

  // Lo que pide acción va arriba: las dos en retard y después la que no tiene visita.
  await expect(main.getByRole('row').nth(3)).toContainText(E2E.serie)
})
