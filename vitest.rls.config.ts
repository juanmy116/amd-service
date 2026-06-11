import { defineConfig } from 'vitest/config'

// Config SEPARADA para los tests de aislamiento RLS (Fase 2). NO entran en el
// `npm test` normal (que no tiene Supabase): corren con `npm run test:rls`
// contra un Supabase local efímero (`supabase start`). Ver .github/workflows/rls.yml.
export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/rls/**/*.test.ts'],
    testTimeout: 30_000,
    hookTimeout: 90_000,
    fileParallelism: false, // los tests comparten fixtures en la misma BD
  },
})
