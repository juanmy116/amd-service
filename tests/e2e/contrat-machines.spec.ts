import { test, expect } from '@playwright/test'
import { adminClient } from '../rls/helpers'
import { E2E } from './fixtures'
import { loginAs } from './auth'

// Formulario de contrato: las máquinas se ven en filas cortas y se añaden / modifican en una
// ventana (plan de pulido 2026-10-23, punto 4). La ventana solo cambia el estado local; lo que
// cuenta es que «Enregistrer» guarde en la BD lo que se tocó en ella.

const SERIE_STOCK = 'TEST-SN-E2E-STOCK'

test.describe('Contrat : machines via la fenêtre', () => {
  test('modifier une machine et en ajouter une nouvelle, puis enregistrer', async ({ page }) => {
    const admin = adminClient()
    const { data: contract } = await admin
      .from('contracts').select('id').eq('numero_contrat', 'TEST-E2E-C1').single()
    expect(contract).not.toBeNull()

    // Máquina libre en stock para añadirla al contrato.
    const { error: mErr } = await admin
      .from('machines').insert({ numero_serie: SERIE_STOCK, marque: 'TEST', modele: 'STOCK', active: true })
    expect(mErr).toBeNull()

    try {
      await loginAs(page, E2E.adminEmail)
      await page.goto(`/admin/contracts/${contract!.id}`)
      const main = page.getByRole('main')

      // Las tres máquinas sembradas, una fila cada una.
      const rows = main.getByRole('listitem').filter({ hasText: 'TEST-SN-E2E' })
      await expect(rows).toHaveCount(3)

      // ── Modifier : notas de la máquina «libre» ──
      await rows.filter({ hasText: E2E.serieLibre }).getByRole('button', { name: 'Modifier' }).click()
      const dialog = page.getByRole('dialog')
      await expect(dialog.getByRole('heading', { name: 'Modifier la machine' })).toBeVisible()
      await dialog.getByPlaceholder('Consignes particulières pour cette machine…').fill('Note E2E')
      await dialog.getByRole('button', { name: 'Valider' }).click()
      await expect(dialog).toHaveCount(0)

      // ── Ajouter : sin máquina elegida no se cierra ──
      await main.getByRole('button', { name: 'Ajouter une machine' }).click()
      await expect(dialog.getByRole('heading', { name: 'Ajouter une machine' })).toBeVisible()
      await dialog.getByRole('button', { name: 'Ajouter', exact: true }).click()
      // (el contenedor del Dialog no tiene tamaño propio: se mira su título)
      await expect(dialog.getByRole('heading', { name: 'Ajouter une machine' })).toBeVisible()

      await dialog.getByPlaceholder('Rechercher par marque, modèle ou série…').fill('STOCK')
      await page.getByRole('option', { name: new RegExp(SERIE_STOCK) }).click()
      await dialog.getByRole('button', { name: 'Ajouter', exact: true }).click()
      await expect(dialog).toHaveCount(0)
      await expect(rows.filter({ hasText: SERIE_STOCK })).toContainText('Nouvelle')

      // ── Enregistrer ──
      await main.getByRole('button', { name: 'Enregistrer' }).click()
      await page.waitForURL('**/admin/contracts')

      const { data: lines } = await admin
        .from('contract_machines')
        .select('machine_id, notes')
        .eq('contract_id', contract!.id)
        .is('date_fin', null)
      const bySerie = new Map((lines ?? []).map((l) => [l.machine_id, l.notes]))
      expect(bySerie.get(E2E.serieLibre)).toBe('Note E2E')
      expect(bySerie.has(SERIE_STOCK)).toBe(true)
      expect(bySerie.size).toBe(4)
    } finally {
      // Dejar el contrato sembrado como estaba para los demás specs.
      await admin.from('contract_machines').delete().eq('machine_id', SERIE_STOCK)
      await admin.from('machines').delete().eq('numero_serie', SERIE_STOCK)
      await admin.from('contract_machines').update({ notes: null })
        .eq('contract_id', contract!.id).eq('machine_id', E2E.serieLibre)
    }
  })
})
