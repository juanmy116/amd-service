import { test, expect } from '@playwright/test'
import { adminClient } from '../rls/helpers'
import { E2E } from './fixtures'
import { loginAs } from './auth'

// Ficha de la máquina: ya no hay «Supprimer». En contrato se REEMPLAZA desde la propia ficha;
// en stock se pone HORS SERVICE con motivo, y se puede deshacer (plan de pulido 2026-10-23, punto 6).
// Contrato y máquinas propios (prefijo TEST-, los barre cleanup()) para no tocar la siembra común.

const OUT = 'TEST-SN-HS-OUT'
const IN = 'TEST-SN-HS-IN'

test.describe('Fiche machine : remplacer, hors service', () => {
  // La 2ª prueba parte de donde deja la 1ª (la saliente, ya en stock).
  test.describe.configure({ mode: 'serial' })

  test.beforeAll(async () => {
    const admin = adminClient()
    // Desde cero si un intento anterior dejó datos (las líneas van antes por la FK).
    await admin.from('contract_machines').delete().in('machine_id', [OUT, IN])
    await admin.from('contracts').delete().eq('numero_contrat', 'TEST-E2E-HS')
    await admin.from('machines').delete().in('numero_serie', [OUT, IN])
    const { data: cli } = await admin.from('clients').select('id').eq('nom_client', E2E.clientNombre).single()
    const { data: c, error: cErr } = await admin.from('contracts')
      .insert({ numero_contrat: 'TEST-E2E-HS', client_id: cli!.id, date_debut: '2026-01-01', statut: 'actif' })
      .select('id').single()
    if (cErr) throw new Error(cErr.message)
    for (const serie of [OUT, IN]) {
      const { error } = await admin.from('machines').insert({ numero_serie: serie, marque: 'TEST', modele: 'HS' })
      if (error) throw new Error(error.message)
    }
    const { error: lErr } = await admin.from('contract_machines')
      .insert({ contract_id: c!.id, machine_id: OUT, date_debut: '2026-01-01', statut: 'actif' })
    if (lErr) throw new Error(lErr.message)
  })

  test('sous contrat : pas de « Supprimer », remplacement depuis la fiche', async ({ page }) => {
    await loginAs(page, E2E.adminEmail)
    await page.goto(`/admin/machines/${OUT}`)
    await page.waitForLoadState('networkidle')
    const main = page.getByRole('main')

    await expect(main.getByText('Sous contrat')).toBeVisible()
    await expect(main.getByRole('link', { name: 'TEST-E2E-HS' })).toBeVisible()
    await expect(main.getByRole('button', { name: /supprimer/i })).toHaveCount(0)
    await expect(main.getByRole('button', { name: 'Mettre hors service' })).toHaveCount(0)

    await main.getByRole('button', { name: 'Remplacer' }).click()
    const dialog = page.getByRole('dialog')
    await dialog.locator('select[name="in_machine_id"]').selectOption(IN)
    await dialog.locator('input[name="date"]').fill(new Date().toISOString().slice(0, 10))
    for (const name of ['out_counter_bw', 'out_counter_color', 'in_counter_bw', 'in_counter_color']) {
      await dialog.locator(`input[name="${name}"]`).fill('0')
    }
    await dialog.getByRole('button', { name: 'Confirmer le remplacement' }).click()

    // La saliente vuelve a stock; la entrante ocupa su sitio en el contrato.
    await expect(main.getByText('En stock')).toBeVisible()
    const { data: lines } = await adminClient().from('contract_machines')
      .select('machine_id, date_fin').in('machine_id', [OUT, IN]).order('machine_id')
    expect(lines?.find((l) => l.machine_id === IN)?.date_fin).toBeNull()
    expect(lines?.find((l) => l.machine_id === OUT)?.date_fin).not.toBeNull()
  })

  test('en stock : mise hors service avec motif, puis remise en service', async ({ page }) => {
    await loginAs(page, E2E.adminEmail)
    await page.goto(`/admin/machines/${OUT}`)
    await page.waitForLoadState('networkidle')
    const main = page.getByRole('main')

    await main.getByRole('button', { name: 'Mettre hors service' }).click()
    const dialog = page.getByRole('dialog')
    await dialog.locator('textarea[name="reason"]').fill('Obsolète E2E')
    await dialog.getByRole('button', { name: 'Mettre hors service' }).click()

    await expect(main.getByText('Motif : Obsolète E2E')).toBeVisible()
    await expect(main.getByText('Hors service', { exact: true })).toBeVisible()
    const { data: off } = await adminClient().from('machines').select('active').eq('numero_serie', OUT).single()
    expect(off!.active).toBe(false)

    await main.getByRole('button', { name: 'Remettre en service' }).click()
    await main.getByRole('button', { name: 'Oui' }).click()
    await expect(main.getByText('En stock')).toBeVisible()
    const { data: on } = await adminClient().from('machines').select('active, hors_service_reason').eq('numero_serie', OUT).single()
    expect(on).toEqual({ active: true, hors_service_reason: null })
  })
})
