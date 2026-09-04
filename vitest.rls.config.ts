import { defineConfig } from 'vitest/config'
import { fileURLToPath } from 'node:url'

// Config SEPARADA para los tests de aislamiento RLS (Fase 2) y el gate E2E de
// facturación (PR-E). NO entran en el `npm test` normal (que no tiene Supabase):
// corren con `npm run test:rls` contra un Supabase local efímero (`supabase start`).
// Ver .github/workflows/rls.yml.
export default defineConfig({
  resolve: {
    alias: {
      // El gate E2E importa el motor real (`@/lib/invoicing`). Resolvemos `@/` igual
      // que tsconfig/vitest.config para que sus imports internos (`@/...`) funcionen.
      '@': fileURLToPath(new URL('./src', import.meta.url)),
      // `@/lib/supabase/admin` hace `import 'server-only'`, que lanza fuera de un
      // Server Component. En tests lo neutralizamos con un no-op para usar el client real.
      'server-only': fileURLToPath(new URL('./tests/rls/_stubs/server-only.ts', import.meta.url)),
    },
  },
  test: {
    environment: 'node',
    include: ['tests/rls/**/*.test.ts'],
    // Capa 1 — abre el candado de facturación una vez (arranca apagado por migración).
    globalSetup: ['./tests/rls/global-setup.ts'],
    testTimeout: 30_000,
    hookTimeout: 90_000,
    fileParallelism: false, // los tests comparten fixtures en la misma BD
  },
})
