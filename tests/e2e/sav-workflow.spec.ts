import { test, expect } from '@playwright/test'
import { readFileSync } from 'node:fs'
import { adminClient } from '../rls/helpers'
import { E2E, type SeedIds } from './fixtures'
import { loginAs } from './auth'

// Recorrido SAV de punta a punta: el admin asigna una incidencia a un técnico
// (auto → assigné), el técnico la ve en /tech, y al abrir /tech/scan/<serie> la
// incidencia pasa sola a en_cours (auto-transición del primer escaneo).
test('recorrido: admin asigna → técnico ve → scan → en_cours', async ({ page }) => {
  // Los IDs sembrados por globalSetup (en runtime, no en --list).
  const ids = JSON.parse(readFileSync('tests/e2e/.seed.json', 'utf8')) as SeedIds
  const admin = adminClient()

  // 1) Admin asigna el técnico en el detalle de la incidencia.
  await loginAs(page, E2E.adminEmail)
  await page.goto(`/admin/incidents/${ids.incidentId}`)
  await page.selectOption('select[name="assigned_to"]', ids.techId)
  await page.getByRole('button', { name: 'Enregistrer' }).click()
  await page.waitForURL('**/admin/incidents**', { timeout: 30_000 }).catch(() => {})

  // Verificación independiente (service_role): la incidencia quedó assigné + asignada.
  const afterAssign = await admin
    .from('incidents').select('status, assigned_to').eq('id', ids.incidentId).single()
  expect(afterAssign.data?.assigned_to).toBe(ids.techId)
  expect(afterAssign.data?.status).toBe('assigné')

  // 2) El técnico la ve en su lista.
  await page.context().clearCookies()
  await loginAs(page, E2E.techEmail)
  await page.goto('/tech/incidents')
  await expect(page.getByText(E2E.incidentNumero)).toBeVisible()

  // 3) Al abrir el scan de la máquina, la incidencia pasa a en_cours.
  await page.goto(`/tech/scan/${encodeURIComponent(E2E.serie)}`)
  await expect(page.getByText(E2E.serie)).toBeVisible()

  await expect.poll(async () => {
    const r = await admin.from('incidents').select('status').eq('id', ids.incidentId).single()
    return r.data?.status
  }, { timeout: 15_000 }).toBe('en_cours')

  // Rastro de auditoría del cambio automático.
  const hist = await admin
    .from('incident_history')
    .select('new_status')
    .eq('incident_id', ids.incidentId)
    .eq('new_status', 'en_cours')
  expect((hist.data ?? []).length).toBeGreaterThan(0)
})
