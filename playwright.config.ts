import { defineConfig, devices } from '@playwright/test'

// Tests E2E (Fase 3): recorrido SAV de punta a punta con navegador real, contra
// la app + un Supabase LOCAL efímero. NO entran en `npm test` (vitest). Corren con
// `npm run test:e2e`. En CI los arranca el job .github/workflows/e2e.yml (que
// levanta Supabase, exporta env y arranca la app); en local se puede usar webServer.
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
  webServer: process.env.CI
    ? undefined
    : {
        command: 'npm run dev',
        url: 'http://localhost:3000',
        reuseExistingServer: true,
        timeout: 120_000,
      },
})
