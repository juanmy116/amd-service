import { test, expect } from '@playwright/test'
import { adminClient } from '../rls/helpers'
import { E2E } from './fixtures'
import { loginAs } from './auth'

// E2E de la UI REAL de facturación (PR-E / verificación humana automatizada): conduce el
// navegador por la pantalla de facturación con el código nuevo (cadena por fecha real) →
// seleccionar contrato → emitir → ver la factura inmutable → anular. Cubre la capa de
// presentación, que los tests de motor/RPC saltan.
//
// El contrato/cliente usan prefijo TESTINV (cleanup() de E2E NO lo barre) porque al emitir
// se crea una factura INMUTABLE que bloquearía el borrado del contrato. En CI la BD es
// efímera (supabase stop), así que no hace falta limpiarlo.

const admin = adminClient()
const CLIENT = 'TESTINV E2E Fact'
const CONTRAT = 'TESTINV-E2E-FACT'
const SERIE = 'TESTINV-E2E-FACT-M'
const PLAN = 'TESTINV E2E Fact Plan'

let contractId: string

// Sin retry: el test EMITE una factura inmutable; un reintento re-ejecutaría el seed y
// chocaría con el contrato ya existente. En CI la BD es efímera (un solo run limpio).
test.describe.configure({ retries: 0 })

test.beforeAll(async () => {
  // Limpieza best-effort previa (idempotencia local; en CI la BD ya es efímera).
  await admin.from('machine_counters').delete().eq('machine_id', SERIE)
  const prev = await admin.from('contracts').select('id').eq('numero_contrat', CONTRAT).maybeSingle()
  if (prev.data) {
    await admin.from('contract_machines').delete().eq('contract_id', prev.data.id)
    await admin.from('contracts').delete().eq('id', prev.data.id)
  }
  await admin.from('machines').delete().eq('numero_serie', SERIE)

  const cli = await admin.from('clients').upsert({ nom_client: CLIENT }, { onConflict: 'nom_client' }).select('id').single()
  if (cli.error) throw new Error(`seed client: ${cli.error.message}`)

  const plan = await admin.from('billing_plans')
    .upsert({ name: PLAN, type: 'per_copy', price_bw: 10, price_color: 50 }, { onConflict: 'name' }).select('id').single()
  if (plan.error) throw new Error(`seed plan: ${plan.error.message}`)

  await admin.from('machines').insert({ numero_serie: SERIE, marque: 'TESTINV', modele: 'E2E', type: 'color' })
  const contract = await admin.from('contracts')
    .insert({ numero_contrat: CONTRAT, client_id: cli.data!.id, date_debut: '2026-01-01', statut: 'actif', billing_day: 1 })
    .select('id').single()
  if (contract.error) throw new Error(`seed contract: ${contract.error.message}`)
  contractId = contract.data!.id as string

  const line = await admin.from('contract_machines')
    .insert({ contract_id: contractId, machine_id: SERIE, date_debut: '2026-04-01', statut: 'actif', billing_plan_id: plan.data!.id, start_counter_bw: 1000, start_counter_color: 100 })
    .select('id').single()
  if (line.error) throw new Error(`seed line: ${line.error.message}`)

  // Una lectura de cierre (02-may → cierra abril con billing_day=1): contrato facturable.
  const cnt = await admin.from('machine_counters').insert({
    machine_id: SERIE, contract_id: contractId, contract_machine_id: line.data!.id, client_id: cli.data!.id,
    year: 2026, month: 5, day: 2, counter_bw: 1200, counter_color: 130, recorded_at: '2026-05-02T10:00:00Z',
  })
  if (cnt.error) throw new Error(`seed counter: ${cnt.error.message}`)
})

test('UI de facturación: seleccionar contrato → emitir → ver factura → anular', async ({ page }) => {
  await loginAs(page, E2E.adminEmail)

  // 1) Pantalla de facturación.
  await page.goto('/admin/facturation')
  await expect(page.getByRole('heading', { name: 'Rapport de facturation' })).toBeVisible()

  // 2) Seleccionar nuestro contrato en el desplegable (value = contract_id|year|month).
  const select = page.locator('select')
  const value = await select.locator('option', { hasText: CONTRAT }).getAttribute('value')
  expect(value).toBeTruthy()
  await select.selectOption(value!)

  // 3) El preview muestra la línea de la máquina con su consumo (Δ B&N = 200 = 1200 − 1000).
  await expect(page.getByText(SERIE)).toBeVisible({ timeout: 10_000 })
  await expect(page.getByRole('cell', { name: '200', exact: true })).toBeVisible()

  // 4) Emitir la factura.
  await page.getByRole('button', { name: 'Émettre la facture' }).click()

  // 5) Redirige al detalle de la factura emitida. El id va en la URL.
  await page.waitForURL(/\/admin\/factures\/[0-9a-f-]+$/, { timeout: 20_000 })
  const invoiceId = page.url().split('/').pop()!
  await expect(page.getByText(CLIENT, { exact: true })).toBeVisible()
  await expect(page.getByText('Télécharger le tableur')).toBeVisible()

  // 6) En BD: esa factura existe, status 'emise'. Total = ΔB&N·10 + ΔColor·50
  //    = 200·10 + 30·50 = 2000 + 1500 = 3500 (color: 130 − 100 = 30).
  const issued = await admin.from('invoices').select('status, total_amount').eq('id', invoiceId).single()
  expect(issued.data!.status).toBe('emise')
  expect(issued.data!.total_amount).toBe(3500)

  // 7) Anular la factura desde la UI (motivo + botón).
  await page.getByPlaceholder('Motif d\'annulation…').fill('Vérification E2E')
  await page.getByRole('button', { name: 'Annuler la facture' }).click()

  // 8) La página muestra el estado "Annulée" y en BD queda annulee.
  await expect(page.getByText('Annulée')).toBeVisible({ timeout: 10_000 })
  await expect.poll(async () => {
    const r = await admin.from('invoices').select('status').eq('id', invoiceId).single()
    return r.data?.status
  }, { timeout: 10_000 }).toBe('annulee')
})
