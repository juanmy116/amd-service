import { test, expect } from '@playwright/test'
import { adminClient } from '../rls/helpers'
import { E2E } from './fixtures'
import { loginAs } from './auth'

// Ficha del cliente: teléfono móvil y fijo, con +221 escrito por defecto y «al menos uno de los
// dos» (plan de pulido 2026-10-23, punto 9). El cliente sembrado no tiene teléfonos.

test('fiche client : mobile et fixe, +221 par défaut, au moins un des deux', async ({ page }) => {
  const admin = adminClient()
  const { data: client } = await admin.from('clients').select('id').eq('nom_client', E2E.clientNombre).single()
  expect(client).not.toBeNull()

  await loginAs(page, E2E.adminEmail)
  await page.goto(`/admin/clients/${client!.id}`)
  const main = page.getByRole('main')
  const mobile = main.locator('input[name="telephone"]')
  const fixe = main.locator('input[name="telephone_fixe"]')

  await expect(mobile).toHaveValue('+221 ')
  await expect(fixe).toHaveValue('+221 ')

  // Los demás obligatorios del formulario, que el cliente sembrado no trae.
  await main.locator('input[name="ninea"]').fill('TEST-NINEA-E2E')
  await main.locator('input[name="email"]').fill('client-tel@e2e.test')
  await main.locator('input[name="adresse"]').fill('Rue E2E')
  await main.locator('input[name="ville"]').fill('Dakar')

  // Solo los prefijos: no guarda.
  await main.getByRole('button', { name: 'Enregistrer' }).click()
  await expect(main.getByText('Indiquez au moins un numéro de téléphone (mobile ou fixe).')).toBeVisible()
  // Lo escrito sigue ahí tras el error (antes React vaciaba el formulario).
  await expect(main.locator('input[name="ninea"]')).toHaveValue('TEST-NINEA-E2E')
  await expect(main.locator('input[name="adresse"]')).toHaveValue('Rue E2E')

  // Con el fijo basta; el móvil con solo el prefijo se guarda vacío.
  await fixe.fill('+221 33 820 12 34')
  await main.getByRole('button', { name: 'Enregistrer' }).click()
  await page.waitForURL('**/admin/clients')

  const { data: saved } = await admin
    .from('clients').select('telephone, telephone_fixe').eq('id', client!.id).single()
  expect(saved).toEqual({ telephone: null, telephone_fixe: '+221 33 820 12 34' })

  // Al volver a la ficha: el fijo guardado y el móvil otra vez con el prefijo listo.
  await page.goto(`/admin/clients/${client!.id}`)
  await expect(fixe).toHaveValue('+221 33 820 12 34')
  await expect(mobile).toHaveValue('+221 ')
})
