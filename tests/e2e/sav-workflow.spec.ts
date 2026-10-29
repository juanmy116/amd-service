import { test, expect } from '@playwright/test'
import { readFileSync } from 'node:fs'
import { adminClient } from '../rls/helpers'
import { E2E, type SeedIds } from './fixtures'
import { loginAs } from './auth'
import type { Page } from '@playwright/test'

// Recorrido SAV de punta a punta con la ficha en 3 pasos (doble escaneo): el admin asigna una incidencia a un
// técnico (auto → assigné), el técnico la ve en /tech; abrir /tech/scan/<serie> ya NO la
// arranca, solo el escaneo del QR (/m/<serie>) la pone en_cours; y para cerrar hace falta un
// segundo escaneo.
test.describe.configure({ mode: 'serial' })

const seedIds = () => JSON.parse(readFileSync('tests/e2e/.seed.json', 'utf8')) as SeedIds

async function statusOf(incidentId: string) {
  const r = await adminClient().from('incidents').select('status').eq('id', incidentId).single()
  return r.data?.status
}

// page.goto justo después de otra navegación (p. ej. la pasarela /m, que redirige) puede abortarse
// con ERR_ABORTED en el navegador: se reintenta una vez.
async function go(page: Page, url: string) {
  try {
    await page.goto(url)
  } catch (e) {
    if (!String(e).includes('ERR_ABORTED')) throw e
    await page.goto(url)
  }
}

// Retrasa los escaneos ya grabados para no esperar la deduplicación (60 s) ni la ventana (1 h).
async function backdateScans(incidentId: string, minutes: number) {
  const admin = adminClient()
  const { data } = await admin.from('incident_scans').select('id, scanned_at').eq('incident_id', incidentId)
  for (const s of data ?? []) {
    const at = new Date(new Date(s.scanned_at).getTime() - minutes * 60_000).toISOString()
    const { error } = await admin.from('incident_scans').update({ scanned_at: at }).eq('id', s.id)
    if (error) throw new Error(`backdateScans: ${error.message}`)
  }
}

test('recorrido: admin asigna → técnico ve → scan → en_cours → segundo scan → resuelve', async ({ page }) => {
  const ids = seedIds()
  const admin = adminClient()

  // 1) Admin asigna el técnico en el detalle de la incidencia.
  await loginAs(page, E2E.adminEmail)
  await go(page, `/admin/incidents/${ids.incidentId}`)
  await page.selectOption('select[name="assigned_to"]', ids.techId)
  await page.getByRole('button', { name: 'Enregistrer' }).click()

  // Verificación independiente (service_role): la incidencia quedó assigné + asignada.
  // Se sondea: la Server Action persiste y redirige de forma asíncrona tras el submit.
  await expect.poll(async () => {
    const r = await admin.from('incidents').select('status, assigned_to').eq('id', ids.incidentId).single()
    return r.data
  }, { timeout: 20_000 }).toEqual(expect.objectContaining({ assigned_to: ids.techId, status: 'assigné' }))

  // 2) El técnico la ve en su lista.
  await page.context().clearCookies()
  await loginAs(page, E2E.techEmail)
  await go(page, '/tech/incidents')
  await expect(page.getByText(E2E.incidentNumero)).toBeVisible()

  // 3) Abrir la ficha de la máquina ya NO arranca la avería.
  await go(page, `/tech/scan/${encodeURIComponent(E2E.serie)}`)
  // En escritorio la agenda lateral también lista la serie de la avería: mirar solo la ficha.
  await expect(page.getByRole('main').getByText(E2E.serie)).toBeVisible()
  await expect(page.getByText('Scan non enregistré')).toHaveCount(0)
  expect(await statusOf(ids.incidentId)).toBe('assigné')

  // Si el escáner de la app no logra grabar el sello, llega con ?scan=echec y la ficha lo avisa.
  await go(page, `/tech/scan/${encodeURIComponent(E2E.serie)}?scan=echec`)
  await expect(page.getByText('Scan non enregistré — vérifiez la connexion et scannez à nouveau.')).toBeVisible()

  // La ficha de la avería (3 pasos): hay que escanear para empezar; el botón flotante del
  // escáner no aparece aquí (sí en /tech). Se cuenta en el DOM: en escritorio está oculto por CSS.
  await go(page, `/tech/incidents/${ids.incidentId}`)
  await expect(page.getByRole('button', { name: 'Scanner pour démarrer' })).toBeVisible()
  await expect(page.getByText('Disponible après le scan de démarrage.').first()).toBeVisible()
  await expect(page.getByRole('link', { name: 'Scanner une machine', includeHidden: true })).toHaveCount(0)
  await go(page, '/tech')
  await expect(page.getByRole('link', { name: 'Scanner une machine', includeHidden: true })).toHaveCount(1)

  // 4) Escanear el QR (pasarela /m/<serie>) la pone en_cours.
  await go(page, `/m/${encodeURIComponent(E2E.serie)}`)
  await expect.poll(() => statusOf(ids.incidentId), { timeout: 15_000 }).toBe('en_cours')
  const hist = await admin
    .from('incident_history')
    .select('new_status')
    .eq('incident_id', ids.incidentId)
    .eq('new_status', 'en_cours')
  expect((hist.data ?? []).length).toBeGreaterThan(0)

  // 5) Paso 1 hecho; sin informe el cierre está desactivado y dice por qué.
  await go(page, `/tech/incidents/${ids.incidentId}`)
  await expect(page.getByText(/^Démarrée — scan à \d{2}:\d{2}$/)).toBeVisible()
  await expect(page.getByRole('button', { name: 'Scanner pour clôturer' })).toBeDisabled()
  await expect(page.getByText("Écrivez d'abord le rapport (étape 2).")).toBeVisible()

  // 6) Con informe y el escaneo de inicio reciente (<60 s): cuenta atrás.
  await page.fill('textarea[name="rapport"]', 'Rodillo cambiado, prueba de impresión correcta')
  await expect(page.getByText(/Scan de clôture possible dans \d:\d{2}/)).toBeVisible()

  // 7) Pasado el minuto (se retrasa el escaneo): se puede escanear para cerrar. En headless la
  // cámara falla: basta con que la hoja abra y se cierre.
  await backdateScans(ids.incidentId, 2)
  await go(page, `/tech/incidents/${ids.incidentId}`)
  await expect(page.locator('textarea[name="rapport"]')).toHaveValue('Rodillo cambiado, prueba de impresión correcta')
  const scanClose = page.getByRole('button', { name: 'Scanner pour clôturer' })
  await expect(scanClose).toBeEnabled()
  await scanClose.click()
  await expect(page.getByText('Scan de clôture', { exact: true })).toBeVisible()
  await page.getByRole('button', { name: 'Annuler' }).click()
  await expect(page.getByText('Scan de clôture', { exact: true })).toHaveCount(0)

  // 8) Segundo escaneo real (pasarela) → cierre confirmable → résolu.
  await go(page, `/m/${encodeURIComponent(E2E.serie)}`)
  await go(page, `/tech/incidents/${ids.incidentId}`)
  await expect(page.getByText(/clôture possible jusqu'à \d{2}:\d{2}/)).toBeVisible()
  await page.getByRole('button', { name: "Clôturer l'intervention" }).click()
  await expect.poll(() => statusOf(ids.incidentId), { timeout: 20_000 }).toBe('résolu')
})

test('cierre con la ventana vencida: error, escanear de nuevo y el informe tecleado sobrevive', async ({ page }) => {
  const ids = seedIds()
  const admin = adminClient()

  // Estado de partida: avería en curso con dos escaneos vigentes (el último hace 59 min).
  const { error: e1 } = await admin.from('incidents')
    .update({ status: 'en_cours', resolved_at: null }).eq('id', ids.incidentId)
  if (e1) throw new Error(`reset incidente: ${e1.message}`)
  const { error: e0 } = await admin.from('incident_scans').delete().eq('incident_id', ids.incidentId)
  if (e0) throw new Error(`reset escaneos: ${e0.message}`)
  const now = Date.now()
  const { error: e2 } = await admin.from('incident_scans').insert([
    { incident_id: ids.incidentId, scanned_by: ids.techId, scanned_at: new Date(now - 120 * 60_000).toISOString() },
    { incident_id: ids.incidentId, scanned_by: ids.techId, scanned_at: new Date(now - 59 * 60_000).toISOString() },
  ])
  if (e2) throw new Error(`fixture escaneos: ${e2.message}`)

  await loginAs(page, E2E.techEmail)
  await go(page, `/tech/incidents/${ids.incidentId}`)
  const closeBtn = page.getByRole('button', { name: "Clôturer l'intervention" })
  await expect(closeBtn).toBeVisible()
  const texto = 'Informe largo que no debe perderse'
  await page.fill('textarea[name="rapport"]', texto)
  await expect(closeBtn).toBeEnabled()

  // Mientras el técnico escribe, la ventana vence: el último escaneo pasa a hace 61 min.
  await backdateScans(ids.incidentId, 2)

  await closeBtn.click()
  await expect(page.getByText('Scannez à nouveau le QR de la machine pour clôturer (valable 1 heure).')).toBeVisible({ timeout: 20_000 })
  await expect(page.locator('textarea[name="rapport"]')).toHaveValue(texto)
  expect(await statusOf(ids.incidentId)).toBe('en_cours')

  // Tras el rechazo aparece el botón de escanear, sin la hora de cierre ya pasada.
  await expect(page.getByRole('button', { name: 'Scanner pour clôturer' })).toBeVisible()
  await expect(page.getByText(/clôture possible jusqu'à/)).toHaveCount(0)

  // Segundo escaneo (pasarela /m) y vuelta a la ficha: lo tecleado sigue ahí (borrador por avería).
  await go(page, `/m/${encodeURIComponent(E2E.serie)}`)
  await expect.poll(async () => {
    const r = await admin.from('incident_scans').select('id').eq('incident_id', ids.incidentId)
    return r.data?.length
  }, { timeout: 15_000 }).toBe(3)
  await go(page, `/tech/incidents/${ids.incidentId}`)
  await expect(page.locator('textarea[name="rapport"]')).toHaveValue(texto)

  // Cerrar ahora sí: el informe guardado es el del borrador y el borrador se borra.
  await page.getByRole('button', { name: "Clôturer l'intervention" }).click()
  await expect.poll(() => statusOf(ids.incidentId), { timeout: 20_000 }).toBe('résolu')
  const { data: closed } = await admin.from('incidents').select('rapport_intervention').eq('id', ids.incidentId).single()
  expect(closed?.rapport_intervention).toBe(texto)
  await expect.poll(() => page.evaluate(
    (id) => Object.keys(sessionStorage).filter((k) => k.includes(id)).length, ids.incidentId,
  )).toBe(0)
})
