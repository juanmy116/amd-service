import { test, expect } from '@playwright/test'
import { adminClient } from '../rls/helpers'
import { E2E } from './fixtures'
import { loginAs } from './auth'

// Los formularios ya no se vacían cuando el servidor devuelve un error (React 19 los reiniciaba
// al terminar la acción; ver src/lib/useSubmitKeepingValues.ts). El de contadores es el caso más
// completo: se queda en la página, así que al GUARDAR BIEN sí debe vaciarse (listo para el
// siguiente), y con ERROR debe conservar lo escrito.

test('relevé manuel : vide après succès, garde les valeurs après une erreur', async ({ page }) => {
  const admin = adminClient()
  const day = String(new Date().getDate())

  try {
    await loginAs(page, E2E.adminEmail)
    await page.goto(`/admin/contadores/${encodeURIComponent(E2E.serie)}`)
    // Que la página acabe de arrancar (precarga de los enlaces del menú) antes de guardar: en CI,
    // un envío a los pocos ms de abrirla se quedó una vez «Enregistrement…» sin aplicar la
    // respuesta (que había llegado completa). Una persona no envía tan rápido.
    await page.waitForLoadState('networkidle')
    const main = page.getByRole('main')
    const bw = main.locator('input[name="counter_bw"]')
    const color = main.locator('input[name="counter_color"]')
    const notes = main.locator('[name="notes"]')

    async function fillAndSave() {
      await main.locator('select[name="day"]').selectOption(day)
      await bw.fill('1000')
      await color.fill('200')
      await notes.fill('Note E2E')
      await main.getByRole('button', { name: /enregistrer/i }).click()
    }

    // 1) Bien: mensaje de éxito y casillas vacías.
    await fillAndSave()
    await expect(main.getByText('Relevé enregistré avec succès.')).toBeVisible()
    await expect(bw).toHaveValue('')
    await expect(notes).toHaveValue('')

    // 2) El mismo día otra vez: error del servidor y lo escrito sigue ahí.
    await fillAndSave()
    await expect(main.getByText(/Un relevé actif existe déjà pour ce jour/)).toBeVisible()
    await expect(bw).toHaveValue('1000')
    await expect(color).toHaveValue('200')
    await expect(notes).toHaveValue('Note E2E')
  } finally {
    await admin.from('machine_counters').delete().eq('machine_id', E2E.serie)
  }
})
