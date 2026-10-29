import { defineConfig, devices } from '@playwright/test'

import { assertLocalSupabase } from './tests/e2e/local-only'
import { ANON_KEY, SERVICE_KEY, URL as SUPABASE_URL } from './tests/rls/helpers'

// Tests E2E (Fase 3): recorrido SAV de punta a punta con navegador real, contra
// la app + un Supabase LOCAL efímero. NO entran en `npm test` (vitest). Corren con
// `npm run test:e2e`. En CI los arranca el job .github/workflows/e2e.yml (que
// levanta Supabase, exporta env y arranca la app); en local se puede usar webServer.

// Se niega a arrancar si los tests no apuntan a un Supabase local: siembran y borran datos.
assertLocalSupabase()

export default defineConfig({
  testDir: './tests/e2e',
  globalSetup: './tests/e2e/global-setup.ts',
  globalTeardown: './tests/e2e/global-teardown.ts',
  fullyParallel: false,
  workers: 1, // comparten fixtures en la misma BD
  retries: process.env.CI ? 1 : 0,
  timeout: 60_000,
  expect: { timeout: 15_000 },
  reporter: process.env.CI ? [['github'], ['html', { open: 'never' }]] : 'list',
  use: {
    baseURL: process.env.E2E_BASE_URL ?? 'http://localhost:3000',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  // En local (sin CI) Playwright arranca la app él mismo. En CI la arranca el workflow.
  // Build + start, igual que en CI, y no `npm run dev`: en dev la suite recorre muchas rutas, el
  // servidor las compila y descarta sobre la marcha, y cuando una página pide un componente que el
  // chunk recién servido ya no trae, el runtime de Fast Refresh hace `location.reload()` antes de
  // hidratar, a veces en bucle. Todo lo que solo existe tras hidratar (el borrador del informe,
  // los botones de la ficha) fallaba al azar; en build no pasa.
  webServer: process.env.CI
    ? undefined
    : {
        command: 'npm run build && npm run start',
        url: 'http://localhost:3000',
        // Nunca reutilizar un servidor ya abierto: lleva el .env.local, que es producción.
        reuseExistingServer: false,
        // El build va primero (1–3 min en el Mac).
        timeout: 300_000,
        // En Next, process.env gana a .env.local: la app arranca contra el mismo Supabase local
        // que los tests, y sin Matrix para no avisar al canal real de mantenimiento. Vale para el
        // build y para el start: las NEXT_PUBLIC_* se graban en el bundle al construir.
        env: {
          NEXT_PUBLIC_SUPABASE_URL: SUPABASE_URL,
          NEXT_PUBLIC_SUPABASE_ANON_KEY: ANON_KEY,
          SUPABASE_SECRET_KEY: SERVICE_KEY,
          NEXT_PUBLIC_APP_URL: 'http://localhost:3000',
          MATRIX_HOMESERVER_URL: '',
        },
      },
})
